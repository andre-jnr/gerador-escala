/*
 * PDF da escala: monta um documento A4 paisagem diagramado e abre numa nova aba,
 * com prévia e botão "Baixar PDF" (usa o "Salvar como PDF" do navegador).
 * Não depende de bibliotecas nem de internet.
 */
'use strict';

const PDF = (() => {
  const esc = U.esc;

  /** Semanas (seg a dom) que cobrem o período, com os dias de cada uma. */
  function semanasDoPeriodo(dias) {
    const segs = [...new Set(dias.map(U.segunda))];
    return segs.map((seg, i) => ({
      n: i + 1,
      seg,
      dias: [0, 1, 2, 3, 4, 5, 6].map((k) => U.addDias(seg, k)),
      ini: dias.find((d) => U.segunda(d) === seg),
      fim: [...dias].reverse().find((d) => U.segunda(d) === seg),
    }));
  }

  function celula(it, dentro, detalhar) {
    if (!dentro) return '<td class="fora"></td>';
    if (!it) return '<td class="vazio">—</td>';
    if (it.tipo === 'trabalho' && it.blocos && it.blocos.length) {
      const t = it.turno_id ? S.turno(it.turno_id) : null;
      const r = U.resumoBlocos(it.blocos);
      const det = detalhar && it.blocos.length > 1
        ? `<span class="blocos">${it.blocos.map(([a, b]) => `${a}–${b}`).join('<br>')}</span>` : '';
      return `<td class="trab" style="--c:${t ? t.cor : '#64748b'}">
        <b>${U.fmtMin(r.inicio)}–${U.fmtMin(r.fim)}</b>${det}
        <span class="h">${U.dur(r.trabalhado)}${t && t.sigla ? ` · ${esc(t.sigla)}` : ''}</span>
        ${it.obs ? `<span class="obs">${esc(it.obs)}</span>` : ''}</td>`;
    }
    const nome = { folga: 'Folga', compensacao: 'Folga comp.', ferias: 'Férias', atestado: 'Atestado', afastado: 'Afastamento' }[it.tipo] || it.tipo;
    return `<td class="nt ${it.tipo}">${nome}${it.obs ? `<span class="obs">${esc(it.obs)}</span>` : ''}</td>`;
  }

  /**
   * dados: { escala, funcionarios: [obj], itens: {fid: {data: item}}, analise }
   * op: { porPagina: bool, detalhar: bool, conformidade: bool, totais: bool, assinaturas: bool }
   */
  function documento(dados, op) {
    const { escala: e, funcionarios: funcs, itens, analise } = dados;
    const dias = U.intervalo(e.inicio, e.fim);
    const fer = S.feriadosMapa();
    const semanas = semanasDoPeriodo(dias);
    const emitido = new Date();
    const emitidoTxt = `${U.pad(emitido.getDate())}/${U.pad(emitido.getMonth() + 1)}/${emitido.getFullYear()} ${U.pad(emitido.getHours())}:${U.pad(emitido.getMinutes())}`;
    const empresa = S.config.empresa || '';
    const publicada = e.status === 'publicada';
    // Vira o nome sugerido do arquivo ao salvar como PDF
    const titulo = (/^escala/i.test(e.titulo) ? e.titulo : `Escala - ${e.titulo}`).replace(/[\\/:*?"<>|]+/g, '-');

    const cabecalho = `
      <header class="cab">
        <div>
          <div class="emp">${esc(empresa)}${empresa ? ' · ' : ''}Escala de trabalho</div>
          <h1>${esc(e.titulo)}</h1>
          <div class="meta">${esc(e.loja || 'Sem loja')} · ${U.dataBR(e.inicio)} a ${U.dataBR(e.fim)} · ${semanas.length} ${semanas.length === 1 ? 'semana' : 'semanas'} · ${funcs.length} ${funcs.length === 1 ? 'funcionário' : 'funcionários'}</div>
        </div>
        <div class="dir">
          <span class="status ${publicada ? 'pub' : 'ras'}">${publicada ? 'Publicada' : 'Rascunho'}</span>
          <div class="meta">Emitida em ${emitidoTxt}</div>
        </div>
      </header>`;

    // ---- uma tabela por semana
    const tabelas = semanas.map((s) => {
      const head = s.dias.map((d) => {
        const dentro = d >= e.inicio && d <= e.fim;
        const cls = [U.dow(d) === 0 && 'dom', fer[d] && 'fer', !dentro && 'fora'].filter(Boolean).join(' ');
        return `<th class="${cls}"><span class="dw">${U.DOW[U.dow(d)]}</span><span class="dt">${U.ddmm(d)}</span>${fer[d] ? `<span class="fn">${esc(fer[d])}</span>` : ''}</th>`;
      }).join('');
      const linhas = funcs.map((f) => {
        const sem = analise.porFunc[f.id]?.semanas.find((x) => x.semana === s.seg);
        const contrato = Number(f.jornada_semanal || 44) * 60;
        const min = sem ? sem.min : 0;
        return `<tr><td class="nome"><b>${esc(f.nome)}</b><span>${esc(f.cargo || '')}</span></td>
          ${s.dias.map((d) => celula((itens[f.id] || {})[d], d >= e.inicio && d <= e.fim, op.detalhar)).join('')}
          <td class="tot ${min > contrato ? 'acima' : ''}">${U.dur(min)}${sem && !sem.completa ? '<sup>*</sup>' : ''}<span>de ${U.dur(contrato)}</span></td></tr>`;
      }).join('');
      const rodape = s.dias.map((d) => {
        if (d < e.inicio || d > e.fim) return '<td class="fora"></td>';
        const n = funcs.filter((f) => CLT.ehTrabalho((itens[f.id] || {})[d])).length;
        return `<td class="${n === 0 ? 'zero' : ''}">${n}</td>`;
      }).join('');
      return `<section class="semana ${op.porPagina ? 'quebra' : ''}">
        <h2><span class="num">${s.n}ª semana</span> ${U.dataBR(s.ini)} a ${U.dataBR(s.fim)}</h2>
        <table class="grade">
          <colgroup><col class="c-nome">${s.dias.map(() => '<col>').join('')}<col class="c-tot"></colgroup>
          <thead><tr><th class="nome">Funcionário</th>${head}<th class="tot">Horas</th></tr></thead>
          <tbody>${linhas}</tbody>
          <tfoot><tr><td class="nome">Trabalhando</td>${rodape}<td></td></tr></tfoot>
        </table>
      </section>`;
    }).join('');

    // ---- legenda dos turnos usados
    const usados = new Set();
    funcs.forEach((f) => Object.entries(itens[f.id] || {}).forEach(([d, it]) => { if (d >= e.inicio && d <= e.fim && it.turno_id) usados.add(it.turno_id); }));
    const legenda = [...usados].map((id) => S.turno(id)).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome)).map((t) => {
      const r = U.resumoBlocos(t.blocos);
      return `<div class="leg"><i style="background:${t.cor}"></i><div><b>${esc(t.nome)}</b>${t.sigla ? ` <span class="sg">${esc(t.sigla)}</span>` : ''}
        <span>${t.blocos.map(([a, b]) => `${a}–${b}`).join(' · ')} · ${U.dur(r.trabalhado)}</span></div></div>`;
    }).join('');

    // ---- totais por funcionário
    const totais = op.totais ? `<section class="bloco evitar">
      <h3>Totais por funcionário</h3>
      <table class="lista">
        <thead><tr><th>Funcionário</th>${semanas.map((s) => `<th class="r">${s.n}ª sem.</th>`).join('')}<th class="r">Total</th><th class="r">Dias trab.</th><th class="r">Folgas</th><th class="r">Domingos trab.</th></tr></thead>
        <tbody>${funcs.map((f) => {
          const pf = analise.porFunc[f.id];
          const contrato = Number(f.jornada_semanal || 44) * 60;
          return `<tr><td><b>${esc(f.nome)}</b> <span class="mut">${esc(f.cargo || '')}</span></td>
            ${semanas.map((s) => { const x = pf.semanas.find((y) => y.semana === s.seg); const m = x ? x.min : 0; return `<td class="r ${m > contrato ? 'acima' : ''}">${U.dur(m)}${x && !x.completa ? '*' : ''}</td>`; }).join('')}
            <td class="r"><b>${U.dur(pf.totalMin)}</b></td><td class="r">${pf.diasTrab}</td><td class="r">${pf.folgas}</td><td class="r">${pf.domingosTrab}</td></tr>`;
        }).join('')}</tbody>
      </table>
      <p class="nota">* semana incompleta no período da escala. Horas em vermelho passam da jornada contratual.</p>
    </section>` : '';

    // ---- conformidade CLT
    let conformidade = '';
    if (op.conformidade) {
      const c = analise.contagem;
      const grupos = {};
      analise.issues.filter((i) => i.sev !== 'info').forEach((i) => (grupos[i.regra] ||= []).push(i));
      const nome = (fid) => (fid ? S.func(fid)?.nome || '' : 'Equipe');
      const lista = Object.entries(grupos)
        .sort(([, a], [, b]) => (a.some((i) => i.sev === 'erro') ? 0 : 1) - (b.some((i) => i.sev === 'erro') ? 0 : 1) || b.length - a.length)
        .map(([regra, oc]) => {
          const r = CLT.REGRAS[regra];
          const sev = oc.some((i) => i.sev === 'erro') ? 'erro' : 'alerta';
          const mostrar = oc.slice(0, 6);
          return `<div class="regra ${sev}"><div class="rt"><b>${r.nome}</b> <span class="mut">${r.base}</span><span class="qt">${oc.length}</span></div>
            <ul>${mostrar.map((i) => `<li><b>${esc(nome(i.fid))}</b>${i.data ? ` · ${U.DOW[U.dow(i.data)]} ${U.ddmm(i.data)}` : ''} — ${esc(i.msg)}</li>`).join('')}
            ${oc.length > mostrar.length ? `<li class="mut">e mais ${oc.length - mostrar.length} ${oc.length - mostrar.length === 1 ? 'ocorrência' : 'ocorrências'}</li>` : ''}</ul></div>`;
        }).join('');
      conformidade = `<section class="bloco">
        <h3>Conformidade com a CLT</h3>
        <div class="kpis">
          <div class="k ${c.erro ? 'erro' : 'ok'}"><b>${c.erro}</b><span>${c.erro === 1 ? 'violação' : 'violações'}</span></div>
          <div class="k ${c.alerta ? 'alerta' : ''}"><b>${c.alerta}</b><span>${c.alerta === 1 ? 'alerta' : 'alertas'}</span></div>
        </div>
        ${lista || '<p class="okmsg">Nenhuma violação ou alerta nas regras verificadas.</p>'}
      </section>`;
    }

    const obs = e.observacoes ? `<section class="bloco evitar"><h3>Observações</h3><p class="texto">${esc(e.observacoes).replace(/\n/g, '<br>')}</p></section>` : '';
    const assin = op.assinaturas ? `<section class="assin evitar">
      <div><span></span>Responsável RH</div><div><span></span>Gerência da loja</div><div><span></span>Ciência dos funcionários</div></section>` : '';

    const rodapeTxt = `${empresa ? empresa + ' · ' : ''}${e.titulo} · ${U.dataBR(e.inicio)} a ${U.dataBR(e.fim)} · emitida em ${emitidoTxt}`.replace(/["\\<>]/g, '');

    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
@page { size: A4 landscape; margin: 11mm 10mm 13mm;
  @bottom-left { content: "${rodapeTxt}"; font: 7pt Inter, 'Segoe UI', Arial, sans-serif; color: #8a93a3; }
  @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 7pt Inter, 'Segoe UI', Arial, sans-serif; color: #8a93a3; } }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; }
body { font: 8.5pt/1.35 Inter, 'Segoe UI', Arial, sans-serif; color: #0f1a2e; background: #e9ecf2; font-variant-numeric: tabular-nums; }
.barra { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 10px; padding: 10px 18px; background: #0d1a2d; color: #c6cfdd; font-size: 13px; }
.barra b { color: #fff; }
.barra .sp { flex: 1; }
.barra button { font: 600 13px Inter, 'Segoe UI', Arial, sans-serif; border: 0; border-radius: 8px; padding: 9px 16px; cursor: pointer; background: #2442a8; color: #fff; }
.barra button.sec { background: #1f3352; }
.folha { width: 297mm; min-height: 210mm; margin: 18px auto; padding: 11mm 10mm 13mm; background: #fff; box-shadow: 0 6px 24px rgba(13,26,45,.18); }
.cab { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; padding-bottom: 9px; border-bottom: 2px solid #2442a8; margin-bottom: 10px; }
.cab .emp { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .09em; color: #2442a8; font-weight: 600; }
.cab h1 { font-size: 16pt; margin: 2px 0 3px; letter-spacing: -.01em; }
.cab .meta { color: #5b6475; font-size: 8pt; }
.cab .dir { text-align: right; }
.status { display: inline-block; font-size: 7.5pt; font-weight: 600; padding: 2px 9px; border-radius: 99px; margin-bottom: 4px; }
.status.pub { background: #e7f5ee; color: #157a52; }
.status.ras { background: #fdf4e6; color: #b8650a; }
.semana { margin-bottom: 10px; break-inside: avoid; }
.semana.quebra + .semana.quebra { break-before: page; }
h2 { font-size: 9.5pt; margin: 0 0 5px; color: #334155; font-weight: 500; }
h2 .num { display: inline-block; background: #2442a8; color: #fff; font-weight: 600; border-radius: 5px; padding: 1px 8px; margin-right: 6px; }
table { border-collapse: collapse; width: 100%; }
.grade { table-layout: fixed; }
.grade col.c-nome { width: 39mm; } .grade col.c-tot { width: 17mm; }
.grade th, .grade td { border: .6pt solid #d9dee7; padding: 3px 4px; vertical-align: middle; }
.grade thead th { background: #f3f5f9; font-weight: 600; text-align: center; }
.grade thead th .dw { display: block; font-size: 6.8pt; text-transform: uppercase; letter-spacing: .06em; color: #6b7486; font-weight: 500; }
.grade thead th .dt { display: block; font-size: 9pt; }
.grade thead th .fn { display: block; font-size: 6.2pt; color: #c8312b; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.grade thead th.dom { background: #fbf3e8; } .grade thead th.dom .dw { color: #b8650a; }
.grade thead th.fer .dt { color: #c8312b; }
.grade thead th.nome { text-align: left; } .grade thead th.tot { text-align: right; }
.grade td.nome b { display: block; font-size: 8.5pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.grade td.nome span { display: block; font-size: 6.8pt; color: #6b7486; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.grade td.trab { border-left: 2.4pt solid var(--c); background: color-mix(in srgb, var(--c) 8%, #fff); text-align: center; line-height: 1.25; }
.grade td.trab b { display: block; font-size: 8.3pt; }
.grade td.trab .blocos { display: block; font-size: 6.6pt; color: #475569; margin-top: 1px; }
.grade td.trab .h { display: block; font-size: 6.6pt; color: #6b7486; margin-top: 1px; }
.grade td .obs { display: block; font-size: 6.2pt; color: #2442a8; font-style: italic; margin-top: 1px; }
.grade td.nt { text-align: center; color: #6b7486; font-weight: 500; font-size: 7.8pt; }
.grade td.folga { background: repeating-linear-gradient(135deg, #f6f7f9 0 4px, #eceff3 4px 8px); }
.grade td.compensacao { background: #f1f3f6; }
.grade td.ferias { background: #e6f6f3; color: #0b7a6e; }
.grade td.atestado, .grade td.afastado { background: #fbf0e3; color: #92400e; }
.grade td.vazio { text-align: center; color: #b4bbc8; }
.grade .fora { background: #f7f8fa; }
.grade thead th.fora .dt, .grade thead th.fora .dw { color: #b4bbc8; }
.grade td.tot { text-align: right; font-weight: 600; font-size: 8.5pt; }
.grade td.tot span { display: block; font-size: 6.4pt; color: #8a93a3; font-weight: 400; }
.grade td.tot.acima { color: #c8312b; }
.grade tfoot td { background: #f3f5f9; text-align: center; font-size: 7.5pt; color: #5b6475; font-weight: 600; }
.grade tfoot td.nome { text-align: left; font-weight: 500; }
.grade tfoot td.zero { color: #c8312b; }
.legenda { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 4px 0 12px; padding: 7px 9px; background: #f8f9fb; border-radius: 6px; break-inside: avoid; }
.leg { display: flex; gap: 6px; align-items: flex-start; font-size: 7.3pt; }
.leg i { width: 9px; height: 9px; border-radius: 2px; margin-top: 2px; flex-shrink: 0; }
.leg span { display: block; color: #5b6475; }
.leg .sg { display: inline; font-size: 6.5pt; background: #eef1f6; border-radius: 3px; padding: 0 3px; color: #334155; }
.leg.tipo i { border: .6pt solid #cfd5df; }
.bloco { margin-top: 12px; }
.evitar { break-inside: avoid; }
h3 { font-size: 10pt; margin: 0 0 6px; padding-bottom: 3px; border-bottom: .8pt solid #e1e5ec; }
.lista th, .lista td { padding: 3px 6px; border-bottom: .6pt solid #e6e9ef; text-align: left; font-size: 7.8pt; }
.lista th { font-size: 6.8pt; text-transform: uppercase; letter-spacing: .05em; color: #6b7486; font-weight: 600; background: #f3f5f9; }
.lista .r { text-align: right; } .lista .acima { color: #c8312b; font-weight: 600; }
.mut { color: #6b7486; font-weight: 400; }
.nota { font-size: 6.8pt; color: #6b7486; margin: 4px 0 0; }
.kpis { display: flex; gap: 8px; margin-bottom: 8px; }
.k { border: .8pt solid #e1e5ec; border-radius: 6px; padding: 4px 12px; display: flex; align-items: baseline; gap: 6px; }
.k b { font-size: 13pt; } .k span { color: #5b6475; }
.k.erro b { color: #c8312b; } .k.alerta b { color: #b8650a; } .k.ok b { color: #157a52; }
.regra { margin-bottom: 6px; break-inside: avoid; border-left: 2.4pt solid #b8650a; padding: 2px 0 2px 8px; }
.regra.erro { border-left-color: #c8312b; }
.regra .rt { font-size: 8pt; display: flex; gap: 6px; align-items: baseline; }
.regra .qt { margin-left: auto; font-weight: 600; color: #334155; }
.regra ul { margin: 2px 0 0; padding-left: 14px; font-size: 7.2pt; color: #334155; }
.okmsg { color: #157a52; font-weight: 500; }
.texto { margin: 0; font-size: 8pt; color: #334155; }
.assin { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; margin-top: 34px; }
.assin div { text-align: center; font-size: 7.5pt; color: #5b6475; }
.assin span { display: block; border-top: .8pt solid #334155; margin-bottom: 4px; }
@media print {
  body { background: #fff; }
  .barra { display: none; }
  .folha { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
}
</style></head><body>
<div class="barra"><b>Prévia do PDF</b><span>A4 paisagem · ${esc(e.titulo)}</span><span class="sp"></span>
  <button class="sec" onclick="window.close()">Fechar</button>
  <button onclick="window.print()">Baixar PDF</button></div>
<div class="folha">
  ${cabecalho}
  ${tabelas}
  <div class="legenda">${legenda}
    <div class="leg tipo"><i style="background:repeating-linear-gradient(135deg,#f6f7f9 0 2px,#dfe2e8 2px 4px)"></i><div><b>Folga</b><span>descanso semanal</span></div></div>
    <div class="leg tipo"><i style="background:#f3f5f9"></i><div><b>Horas</b><span>trabalhadas na semana / contrato</span></div></div>
  </div>
  ${totais}
  ${conformidade}
  ${obs}
  ${assin}
</div>
<p style="text-align:center;font:12px Inter,'Segoe UI',Arial,sans-serif;color:#6b7486" class="nao-imp">Na janela que abrir, escolha <b>Salvar como PDF</b> em "Destino".</p>
<style>@media print { .nao-imp { display: none; } }</style>
</body></html>`;
  }

  /** Pergunta as opções e abre a prévia numa nova aba. */
  function abrir(obterDados) {
    let op = { porPagina: false, detalhar: true, totais: true, conformidade: true, assinaturas: true };
    try { op = { ...op, ...JSON.parse(localStorage.getItem('pdf-opcoes') || '{}') }; } catch { /* sem preferências salvas */ }
    const dados = obterDados();
    const nSem = semanasDoPeriodo(U.intervalo(dados.escala.inicio, dados.escala.fim)).length;
    const opcao = (k, t, d) => `<label class="chk" style="align-items:flex-start;padding:8px 0"><input type="checkbox" data-op="${k}" ${op[k] ? 'checked' : ''} style="margin-top:2px">
      <span><span class="pessoa-nome">${t}</span><br><small class="muted">${d}</small></span></label>`;
    const m = UI.modal({
      titulo: 'Gerar PDF da escala',
      sub: `${U.esc(dados.escala.titulo)} · A4 paisagem · ${nSem} ${nSem === 1 ? 'semana' : 'semanas'}`,
      corpo: `<div class="stack" style="gap:0">
        ${opcao('detalhar', 'Mostrar entradas, intervalos e saídas', 'Além do horário de início e fim, lista cada período de trabalho do dia.')}
        ${opcao('porPagina', 'Uma semana por página', 'Desligado, as semanas seguem uma após a outra e o documento fica mais curto.')}
        ${opcao('totais', 'Totais por funcionário', 'Horas por semana, total do período, folgas e domingos trabalhados.')}
        ${opcao('conformidade', 'Resumo de conformidade CLT', 'Violações e alertas encontrados, por regra.')}
        ${opcao('assinaturas', 'Linhas de assinatura', 'RH, gerência e ciência dos funcionários.')}
      </div>
      ${E_SUJO(dados) ? `<div class="aviso alerta" style="margin-top:12px">${UI.ic('alerta')}<div>Há alterações não salvas. O PDF mostra a escala como está na tela agora.</div></div>` : ''}`,
      rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-gerar>${UI.ic('baixar')} Gerar PDF</button>`,
    });
    m.$('[data-gerar]').addEventListener('click', () => {
      m.$$('[data-op]').forEach((c) => { op[c.dataset.op] = c.checked; });
      try { localStorage.setItem('pdf-opcoes', JSON.stringify(op)); } catch { /* armazenamento indisponível */ }
      const janela = window.open('', '_blank');
      if (!janela) { UI.toast('O navegador bloqueou a nova aba. Permita pop-ups para este site.', 'erro'); return; }
      janela.document.open();
      janela.document.write(documento(dados, op));
      janela.document.close();
      // Abre o diálogo de "Salvar como PDF" quando as fontes terminarem de carregar
      const imprimir = () => (janela.document.fonts ? janela.document.fonts.ready : Promise.resolve()).then(() => setTimeout(() => janela.print(), 250));
      if (janela.document.readyState === 'complete') imprimir(); else janela.addEventListener('load', imprimir);
      m.fechar();
    });
  }
  const E_SUJO = (d) => !!d.sujo;

  return { abrir, documento, semanasDoPeriodo };
})();
