/* Roteamento por hash e inicialização. */
'use strict';

(() => {
  const ROTAS = [
    [/^\/?$/, 'painel', (m) => Telas.painel(m)],
    [/^\/escalas\/?$/, 'escalas', (m) => Escalas.lista(m)],
    [/^\/escalas\/nova$/, 'escalas', (m) => Escalas.lista(m, { abrirNova: true })],
    [/^\/escalas\/(\d+)$/, 'escalas', (m, id) => Escalas.editor(m, id)],
    [/^\/funcionarios\/?$/, 'funcionarios', (m) => Telas.funcionarios(m)],
    [/^\/funcionarios\/(\d+)$/, 'funcionarios', (m, id) => Telas.funcionario(m, id)],
    [/^\/turnos\/?$/, 'turnos', (m) => Telas.turnos(m)],
    [/^\/regras\/?$/, 'regras', (m) => Telas.regras(m)],
    [/^\/feriados\/?$/, 'feriados', (m) => Telas.feriados(m)],
    [/^\/historico\/?$/, 'historico', (m) => Telas.historico(m)],
  ];

  let hashAtual = location.hash;
  let ignorar = false;

  async function navegar() {
    if (ignorar) { ignorar = false; return; }
    const caminho = location.hash.replace(/^#/, '') || '/';
    const saindoDoEditor = /^#\/escalas\/\d+$/.test(hashAtual) && hashAtual !== location.hash;
    if (saindoDoEditor && Escalas.temAlteracoes()) {
      const ok = await UI.confirmar({
        titulo: 'Sair sem salvar?', texto: 'Há alterações na escala que ainda não foram salvas.', ok: 'Descartar alterações', perigo: true,
      });
      if (!ok) { ignorar = true; location.hash = hashAtual; return; }
      Escalas.descartar();
    }
    hashAtual = location.hash;
    UI.fecharPopover();

    // Troca o <main> por um novo para não acumular listeners entre telas
    const antigo = document.getElementById('main');
    const main = antigo.cloneNode(false);
    antigo.replaceWith(main);
    main.innerHTML = '<div class="carregando">Carregando…</div>';

    const rota = ROTAS.find(([re]) => re.test(caminho)) || ROTAS[0];
    const params = caminho.match(rota[0])?.slice(1) || [];
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === rota[1]));
    try {
      await rota[2](main, ...params);
      UI.preencherIcones(main);
      window.scrollTo(0, 0);
    } catch (e) {
      console.error(e);
      main.innerHTML = `<div class="card"><div class="vazio">${UI.ic('erro')}<div>${U.esc(e.message)}</div>
        <div style="margin-top:12px"><a class="btn" href="#/">Voltar ao painel</a></div></div></div>`;
    }
  }

  window.addEventListener('hashchange', navegar);
  window.addEventListener('beforeunload', (e) => {
    if (Escalas.temAlteracoes()) { e.preventDefault(); e.returnValue = ''; }
  });

  async function iniciar() {
    UI.preencherIcones(document);
    try {
      await S.carregar();
    } catch (e) {
      document.getElementById('main').innerHTML = `<div class="card"><div class="vazio">Não foi possível conectar ao servidor. ${U.esc(e.message)}</div></div>`;
      return;
    }
    document.getElementById('empresa-nome').textContent = S.config.empresa ? `${S.config.empresa} · Gestão de jornada` : 'Gestão de jornada';
    document.getElementById('hoje').textContent = `Hoje: ${U.DOW_LONGO[U.dow(S.hoje)]}, ${U.dataBR(S.hoje)}`;
    navegar();
  }
  iniciar();
})();
