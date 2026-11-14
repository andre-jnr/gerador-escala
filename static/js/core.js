/* Utilitários de data/hora, acesso à API e estado global. */
'use strict';

const U = (() => {
  const pad = (n) => String(n).padStart(2, '0');
  const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const DOW_LONGO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const toMin = (hhmm) => {
    if (!hhmm) return NaN;
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const fmtMin = (min) => {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  };
  /** 450 → "7h30"; 2640 → "44h" */
  const dur = (min) => {
    min = Math.round(min);
    const sinal = min < 0 ? '−' : '';
    min = Math.abs(min);
    const h = Math.floor(min / 60), m = min % 60;
    return sinal + (m ? `${h}h${pad(m)}` : `${h}h`);
  };
  /** "11:30" → "11h30"; "11:00" → "11h" */
  const hora = (hhmm) => {
    const [h, m] = hhmm.split(':');
    return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`;
  };

  // Datas sempre em ISO (YYYY-MM-DD), calculadas em UTC para não sofrer com fuso.
  const d = (iso) => new Date(iso + 'T00:00:00Z');
  const iso = (dt) => dt.toISOString().slice(0, 10);
  const addDias = (s, n) => { const x = d(s); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
  const diffDias = (a, b) => Math.round((d(b) - d(a)) / 86400000);
  const dow = (s) => d(s).getUTCDay();
  const segunda = (s) => addDias(s, -((dow(s) + 6) % 7));
  const intervalo = (a, b) => { const r = []; for (let x = a; x <= b; x = addDias(x, 1)) r.push(x); return r; };
  const ddmm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const dataBR = (s) => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '';
  const dataLonga = (s) => `${Number(s.slice(8, 10))} ${MES[Number(s.slice(5, 7)) - 1]}`;
  const periodo = (a, b) => `${dataLonga(a)} – ${dataLonga(b)} ${b.slice(0, 4)}`;
  const quando = (s) => s ? `${dataBR(s.slice(0, 10))} ${s.slice(11, 16)}` : '';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  /** Converte os blocos [["11:30","14:00"], ...] em minutos contínuos, atravessando a meia-noite se preciso. */
  const intervalos = (blocos) => {
    const r = [];
    let fimAnterior = null;
    for (const [a, b] of blocos || []) {
      let s = toMin(a), e = toMin(b);
      if (isNaN(s) || isNaN(e)) continue;
      while (fimAnterior !== null && s < fimAnterior) s += 1440;
      while (e <= s) e += 1440;
      r.push([s, e]);
      fimAnterior = e;
    }
    return r;
  };

  /** Resumo de um conjunto de blocos: minutos trabalhados, pausas, início e fim. */
  const resumoBlocos = (blocos) => {
    const iv = intervalos(blocos);
    const trabalhado = iv.reduce((s, [a, b]) => s + (b - a), 0);
    const pausas = [];
    for (let i = 1; i < iv.length; i++) pausas.push({ ini: iv[i - 1][1], fim: iv[i][0], min: iv[i][0] - iv[i - 1][1] });
    return {
      trabalhado, pausas, iv,
      inicio: iv.length ? iv[0][0] : null,
      fim: iv.length ? iv[iv.length - 1][1] : null,
    };
  };

  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  const baixar = (nome, conteudo, tipo = 'text/csv;charset=utf-8') => {
    const blob = new Blob([conteudo], { type: tipo });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  return {
    pad, DOW, DOW_LONGO, toMin, fmtMin, dur, hora, addDias, diffDias, dow, segunda, intervalo,
    ddmm, dataBR, dataLonga, periodo, quando, esc, iniciais, intervalos, resumoBlocos, debounce, baixar,
  };
})();

const API = (() => {
  async function req(metodo, url, corpo) {
    const op = { method: metodo, headers: {} };
    if (corpo !== undefined) {
      op.headers['Content-Type'] = 'application/json';
      op.body = JSON.stringify(corpo);
    }
    const r = await fetch(url, op);
    let dados = null;
    try { dados = await r.json(); } catch { /* sem corpo */ }
    if (!r.ok) throw new Error((dados && dados.erro) || `Erro ${r.status}`);
    return dados;
  }
  return {
    get: (u) => req('GET', u),
    post: (u, c) => req('POST', u, c ?? {}),
    put: (u, c) => req('PUT', u, c ?? {}),
    del: (u) => req('DELETE', u),
  };
})();

/** Estado compartilhado (cadastros carregados uma vez e atualizados quando mudam). */
const S = {
  funcionarios: [],
  turnos: [],
  feriados: [],
  config: {},
  hoje: new Date().toISOString().slice(0, 10),
  async carregar() {
    const b = await API.get('/api/bootstrap');
    Object.assign(this, b);
  },
  func(id) { return this.funcionarios.find((f) => f.id === Number(id)); },
  turno(id) { return this.turnos.find((t) => t.id === Number(id)); },
  feriadosMapa() { return Object.fromEntries(this.feriados.map((f) => [f.data, f.nome])); },
  lojas() { return [...new Set(this.funcionarios.map((f) => f.loja).filter(Boolean))].sort(); },
  cargos() { return [...new Set(this.funcionarios.map((f) => f.cargo).filter(Boolean))].sort(); },
};

/** Tipos de dia na escala. */
const TIPOS = {
  trabalho: { nome: 'Trabalho', curto: 'Trab.', trabalho: true },
  folga: { nome: 'Folga (DSR)', curto: 'Folga', descanso: true },
  compensacao: { nome: 'Folga compensatória', curto: 'Comp.', descanso: true },
  ferias: { nome: 'Férias', curto: 'Férias' },
  atestado: { nome: 'Atestado', curto: 'Atest.' },
  afastado: { nome: 'Afastamento', curto: 'Afast.' },
};
