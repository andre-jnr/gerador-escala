/* Componentes de interface: ícones, toasts, modais, popovers e editor de horários. */
'use strict';

const UI = (() => {
  const ICONES = {
    painel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    escala: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M7 13h4M13 17h4"/>',
    pessoas: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    balanca: '<path d="M12 3v18M7 21h10M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
    calendario: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    historico: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    erro: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    salvar: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    imprimir: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    lixo: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    editar: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    publicar: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4 12 14l-3-3"/>',
    cadeado: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    destrancar: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    gerar: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/>',
    seta: '<path d="m9 18 6-6-6-6"/>',
    voltar: '<path d="m15 18-6-6 6-6"/>',
    loja: '<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"/>',
    escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    grafico: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    restaurar: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    linha: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  };

  const ic = (nome, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome] || ''}</svg>`;

  /** Preenche <i data-i="..."> com o ícone correspondente. */
  const preencherIcones = (raiz = document) => {
    raiz.querySelectorAll('i[data-i]').forEach((el) => {
      if (!el.firstChild) el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[el.dataset.i] || ''}</svg>`;
    });
  };

  function toast(msg, tipo = 'ok') {
    const el = document.createElement('div');
    el.className = `toast ${tipo}`;
    el.innerHTML = `${ic(tipo === 'erro' ? 'erro' : 'check')}<span>${U.esc(msg)}</span>`;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, 3200);
    setTimeout(() => el.remove(), 3600);
  }

  const pilha = [];
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pilha.length) { e.preventDefault(); pilha[pilha.length - 1](); }
  });

  function modal({ titulo, sub = '', corpo = '', rodape = '', largo = false, aoFechar }) {
    const fundo = document.createElement('div');
    fundo.className = 'fundo';
    fundo.innerHTML = `
      <div class="modal ${largo === 'extra' ? 'extra-largo' : largo ? 'largo' : ''}" role="dialog" aria-modal="true">
        <div class="modal-cab">
          <div><h2>${titulo}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
          <button class="btn fantasma pequeno icone" data-fechar style="margin-left:auto" aria-label="Fechar">${ic('x')}</button>
        </div>
        <div class="modal-corpo">${corpo}</div>
        ${rodape ? `<div class="modal-rodape">${rodape}</div>` : ''}
      </div>`;
    document.getElementById('camada').appendChild(fundo);
    const fechar = () => {
      const i = pilha.indexOf(fechar);
      if (i >= 0) pilha.splice(i, 1);
      fundo.remove();
      aoFechar && aoFechar();
    };
    pilha.push(fechar);
    fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
    fundo.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', fechar));
    const el = fundo.querySelector('.modal');
    setTimeout(() => el.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea')?.focus(), 30);
    return { el, fechar, $: (s) => el.querySelector(s), $$: (s) => [...el.querySelectorAll(s)] };
  }

  function confirmar({ titulo, texto, ok = 'Confirmar', perigo = false }) {
    return new Promise((resolve) => {
      let resposta = false;
      const m = modal({
        titulo, corpo: `<p style="margin:0;color:var(--ink-2)">${texto}</p>`,
        rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn ${perigo ? 'perigo' : 'primario'}" data-ok>${ok}</button>`,
        aoFechar: () => resolve(resposta),
      });
      m.$('[data-ok]').addEventListener('click', () => { resposta = true; m.fechar(); });
      setTimeout(() => m.$('[data-ok]').focus(), 40);
    });
  }

  let popAtual = null;
  function fecharPopover() { if (popAtual) popAtual(); }
  function popover(ancora, html, { largura = 380 } = {}) {
    fecharPopover();
    const el = document.createElement('div');
    el.className = 'popover';
    el.style.width = `${largura}px`;
    el.innerHTML = html;
    document.getElementById('camada').appendChild(el);
    // Posiciona ao lado da âncora sem sair da tela. O corpo rola quando não cabe;
    // em telas estreitas vira uma folha presa na parte de baixo.
    const posicionar = () => {
      if (window.innerWidth < 640) {
        el.classList.add('folha');
        el.style.left = el.style.top = el.style.width = '';
        return;
      }
      el.classList.remove('folha');
      const r = ancora.getBoundingClientRect();
      const w = Math.min(largura, window.innerWidth - 24);
      el.style.width = `${w}px`;
      const h = Math.min(el.scrollHeight, window.innerHeight - 24);
      let left = r.right + 8;
      if (left + w > window.innerWidth - 12) left = r.left - w - 8;
      if (left < 12) left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left));
      const top = Math.max(12, Math.min(r.top, window.innerHeight - h - 12));
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    };
    posicionar();
    const obs = new ResizeObserver(posicionar);
    obs.observe(el.querySelector('.popover-corpo') || el);
    window.addEventListener('resize', posicionar);
    const fora = (e) => { if (!el.contains(e.target) && !e.target.closest('.fundo')) fechar(); };
    const fechar = () => {
      el.remove();
      obs.disconnect();
      window.removeEventListener('resize', posicionar);
      document.removeEventListener('mousedown', fora, true);
      const i = pilha.indexOf(fechar);
      if (i >= 0) pilha.splice(i, 1);
      if (popAtual === fechar) popAtual = null;
    };
    setTimeout(() => document.addEventListener('mousedown', fora, true), 0);
    pilha.push(fechar);
    popAtual = fechar;
    return { el, fechar, posicionar, $: (s) => el.querySelector(s), $$: (s) => [...el.querySelectorAll(s)] };
  }

  // ------------------------------------------------ campos de data, hora e número
  // Campos de texto com máscara: aceitam "01012027", "1/1/27", "0730", "7h30"...
  // O botão de calendário abre o seletor nativo do navegador como atalho.

  /** Campo de data. `valor` em ISO; o atributo extra (ex.: data-v="inicio") vai no campo de texto. */
  const campoData = (valor = '', attrs = '') => `<span class="campo-data">
      <input type="text" class="inp data" inputmode="numeric" autocomplete="off" placeholder="dd/mm/aaaa" maxlength="10"
        data-mask="data" value="${valor ? U.dataBR(valor) : ''}" ${attrs}>
      <button type="button" class="btn-cal" data-cal tabindex="-1" title="Abrir calendário">${ic('calendario')}</button>
      <input type="date" class="cal-nativo" tabindex="-1" aria-hidden="true">
    </span>`;

  /** Campo de horário "HH:MM". */
  const campoHora = (valor = '', attrs = '') =>
    `<input type="text" class="inp hora" inputmode="numeric" autocomplete="off" placeholder="hh:mm" maxlength="5" data-mask="hora" value="${valor || ''}" ${attrs}>`;

  /** Campo numérico que aceita vírgula. */
  const campoNumero = (valor = '', attrs = '') =>
    `<input type="text" class="inp numero" inputmode="decimal" autocomplete="off" data-mask="numero" value="${String(valor ?? '').replace('.', ',')}" ${attrs}>`;

  function mascaraData(v, digitouBarra) {
    const partes = v.split('/').map((p) => p.replace(/\D/g, ''));
    for (let i = 0; i < Math.min(2, partes.length - 1); i++) if (partes[i].length === 1) partes[i] = '0' + partes[i];
    const d = partes.join('').slice(0, 8);
    let out = d.slice(0, 2);
    if (d.length > 2) out += '/' + d.slice(2, 4);
    if (d.length > 4) out += '/' + d.slice(4);
    if (digitouBarra && (d.length === 2 || d.length === 4)) out += '/';
    return out;
  }

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.dataset || !t.dataset.mask) return;
    t.classList.remove('invalido');
    const apagando = (e.inputType || '').startsWith('delete');
    if (t.dataset.mask === 'data' && !apagando) t.value = mascaraData(t.value, e.data === '/' || e.data === '.' || e.data === '-');
    if (t.dataset.mask === 'hora' && !apagando) {
      let v = t.value.replace(/[^\d:h]/gi, '').replace(/h/gi, ':');
      if (!v.includes(':') && v.length === 4) v = `${v.slice(0, 2)}:${v.slice(2)}`;
      t.value = v.slice(0, 5);
    }
    if (t.dataset.mask === 'numero') t.value = t.value.replace(/[^\d,.]/g, '');
  });

  // Ao sair do campo, normaliza ("730" → "07:30", "010127" → "01/01/2027") ou marca como inválido.
  // Roda na captura para que os outros ouvintes de "change" já recebam o valor normalizado.
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.dataset || !t.dataset.mask || !t.value.trim()) return;
    if (t.dataset.mask === 'data') {
      const iso = U.lerData(t.value);
      if (iso) t.value = U.dataBR(iso); else t.classList.add('invalido');
    }
    if (t.dataset.mask === 'hora') {
      const h = U.lerHora(t.value);
      if (h) t.value = h; else t.classList.add('invalido');
    }
  }, true);

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cal]');
    if (!b) return;
    const caixa = b.closest('.campo-data');
    const texto = caixa.querySelector('[data-mask=data]');
    const nativo = caixa.querySelector('.cal-nativo');
    nativo.value = U.lerData(texto.value) || '';
    try { nativo.showPicker(); } catch { nativo.focus(); nativo.click(); }
  });
  document.addEventListener('change', (e) => {
    const n = e.target;
    if (!n.classList || !n.classList.contains('cal-nativo') || !n.value) return;
    e.stopPropagation();
    const texto = n.closest('.campo-data').querySelector('[data-mask=data]');
    texto.value = U.dataBR(n.value);
    texto.classList.remove('invalido');
    texto.dispatchEvent(new Event('change', { bubbles: true }));
  }, true);

  /** Barra horizontal com os blocos de trabalho entre `de` e `ate` (minutos). */
  function linhaTempo(blocos, cor, de = 6 * 60, ate = 24 * 60) {
    const total = ate - de;
    const partes = U.intervalos(blocos).map(([a, b]) => {
      const l = Math.max(0, (a - de) / total * 100), w = Math.max(0, (Math.min(b, ate) - Math.max(a, de)) / total * 100);
      return `<span style="left:${l}%;width:${w}%;background:${cor}"></span>`;
    }).join('');
    const marcas = [];
    for (let h = de; h <= ate; h += 180) marcas.push(`<span>${U.fmtMin(h).slice(0, 2)}h</span>`);
    return `<div><div class="linha-tempo">${partes}</div><div class="escala-horas">${marcas.join('')}</div></div>`;
  }

  /** Selos com total trabalhado e pausas. */
  function resumoTurno(blocos) {
    if (!blocos || !blocos.length) return '<span class="selo sem-ponto">Sem horários</span>';
    const r = U.resumoBlocos(blocos);
    const selos = [`<span class="selo sem-ponto info num">${U.dur(r.trabalhado)} trabalhadas</span>`];
    r.pausas.forEach((p) => selos.push(`<span class="selo sem-ponto num">${p.min >= 60 ? 'Intervalo' : 'Pausa'} ${U.dur(p.min)}</span>`));
    selos.push(`<span class="selo sem-ponto num">${U.fmtMin(r.inicio)}–${U.fmtMin(r.fim)}</span>`);
    return selos.join('');
  }

  /** Texto curto: "11:30–20:15". */
  const faixa = (blocos) => {
    const r = U.resumoBlocos(blocos);
    return r.inicio == null ? '' : `${U.fmtMin(r.inicio)}–${U.fmtMin(r.fim)}`;
  };

  /**
   * Editor de períodos de trabalho. Mostra as pausas entre eles e chama onChange(blocos).
   */
  function editorBlocos(container, blocosIniciais, onChange) {
    let blocos = (blocosIniciais || []).map((b) => [...b]);
    // Atualiza só as legendas "intervalo de 1h" entre os períodos, sem recriar os campos
    // (recriar durante a digitação faria o Tab perder o foco).
    const atualizarPausas = () => {
      container.querySelectorAll('.pausa-linha').forEach((el) => {
        const i = Number(el.dataset.pausa);
        const ant = blocos[i - 1], atual = blocos[i];
        if (!ant || !atual || !ant[1] || !atual[0]) { el.textContent = ''; return; }
        const min = U.resumoBlocos([ant, atual]).pausas[0]?.min;
        el.textContent = min == null ? '' : `${min >= 60 ? 'intervalo' : 'pausa'} de ${U.dur(min)}`;
      });
    };
    const render = () => {
      let html = '<div class="blocos-edit">';
      blocos.forEach(([a, b], i) => {
        if (i > 0) html += `<div class="pausa-linha num" data-pausa="${i}"></div>`;
        html += `<div class="bloco-linha">
          <span class="idx">${i + 1}</span>
          ${campoHora(a, `data-i="${i}" data-p="0" aria-label="Entrada ${i + 1}"`)}
          <span class="sep">até</span>
          ${campoHora(b, `data-i="${i}" data-p="1" aria-label="Saída ${i + 1}"`)}
          <button type="button" class="btn fantasma pequeno icone" data-rem="${i}" title="Remover período">${ic('x')}</button>
        </div>`;
      });
      html += `<div><button type="button" class="btn pequeno" data-add>${ic('mais')} Adicionar período</button></div></div>`;
      container.innerHTML = html;
      atualizarPausas();
    };
    const emitir = () => onChange && onChange(blocos.filter(([a, b]) => a && b));
    container.addEventListener('change', (e) => {
      const inp = e.target.closest('input[data-i]');
      if (!inp) return;
      const h = U.lerHora(inp.value);
      if (!h) { if (inp.value.trim()) UI.toast('Horário inválido. Ex.: 07:30, 0730 ou 7h30.', 'erro'); return; }
      blocos[Number(inp.dataset.i)][Number(inp.dataset.p)] = h;
      atualizarPausas(); emitir();
    });
    // Enter confirma o horário e passa para o próximo campo
    container.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.matches('input[data-i]')) return;
      e.preventDefault();
      const campos = [...container.querySelectorAll('input[data-i]')];
      const prox = campos[campos.indexOf(e.target) + 1];
      if (prox) { prox.focus(); prox.select(); } else e.target.blur();
    });
    container.addEventListener('click', (e) => {
      const rem = e.target.closest('[data-rem]');
      if (rem) { blocos.splice(Number(rem.dataset.rem), 1); render(); emitir(); return; }
      if (e.target.closest('[data-add]')) {
        const ult = blocos[blocos.length - 1];
        const ini = ult && ult[1] ? U.fmtMin(U.toMin(ult[1]) + 60) : '08:00';
        blocos.push([ini, U.fmtMin(U.toMin(ini) + 180)]);
        render(); emitir();
      }
    });
    render();
    return {
      get: () => blocos.filter(([a, b]) => a && b),
      set: (novos) => { blocos = (novos || []).map((b) => [...b]); render(); },
    };
  }

  /** Conteúdo visual de uma célula da escala (usado também no histórico). */
  function celula(item, { compacto = false } = {}) {
    if (!item) return '<div class="cx vazio">+</div>';
    if (item.tipo === 'trabalho') {
      const t = item.turno_id ? S.turno(item.turno_id) : null;
      const cor = t ? t.cor : '#64748b';
      const r = U.resumoBlocos(item.blocos);
      if (r.inicio == null) return '<div class="cx vazio">?</div>';
      const det = item.blocos.map(([a, b]) => `${a}–${b}`).join(' · ');
      return `<div class="cx" style="--c:${cor}" title="${U.esc((t ? t.nome + '\n' : '') + det + (item.obs ? '\n' + item.obs : ''))}">
        <div class="h">${U.fmtMin(r.inicio)}–${U.fmtMin(r.fim)}</div>
        ${compacto ? '' : `<div class="s">${U.dur(r.trabalhado)}${t && t.sigla ? ` · ${U.esc(t.sigla)}` : ''}</div>`}
        <div class="det-imp">${det}</div>
      </div>`;
    }
    const tipo = TIPOS[item.tipo] || { curto: item.tipo };
    return `<div class="cx ${item.tipo}" title="${U.esc(tipo.nome + (item.obs ? ' — ' + item.obs : ''))}">${tipo.curto}</div>`;
  }

  return {
    ic, preencherIcones, toast, modal, confirmar, popover, fecharPopover, linhaTempo, resumoTurno, faixa, editorBlocos, celula,
    campoData, campoHora, campoNumero,
  };
})();
