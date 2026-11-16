/* Escalas: lista, assistente de criação/geração e editor com validação CLT ao vivo. */
'use strict';

const Escalas = (() => {
  const { ic } = UI;
  const esc = U.esc;
  const SEV_IC = { erro: 'erro', alerta: 'alerta', info: 'info' };

  // =============================================================== LISTA
  let filtroLista = 'todas';

  async function lista(main, { abrirNova = false } = {}) {
    const escalas = await API.get('/api/escalas');
    main.innerHTML = `
      ${Telas.cabecalho('Escalas', 'Cada escala guarda as versões salvas. Escalas publicadas ficam travadas para edição.',
        `<button class="btn primario" data-nova>${ic('gerar')} Nova escala</button>`)}
      <div class="row" style="margin-bottom:16px"><div class="segmentado" data-filtro>
        ${[['todas', 'Todas'], ['rascunho', 'Rascunhos'], ['publicada', 'Publicadas']].map(([k, n]) => `<button data-k="${k}" class="${filtroLista === k ? 'ativo' : ''}">${n}</button>`).join('')}
      </div></div>
      <div data-cards></div>`;
    const desenhar = () => {
      const es = escalas.filter((e) => filtroLista === 'todas' || e.status === filtroLista);
      main.querySelector('[data-cards]').innerHTML = es.length ? `<div class="escalas-lista">${es.map((e) => {
        const vigente = e.inicio <= S.hoje && e.fim >= S.hoje;
        const semanas = Math.ceil((U.diffDias(e.inicio, e.fim) + 1) / 7);
        return `<div class="card escala-card ${vigente ? 'vigente' : ''}" data-id="${e.id}">
          <div class="row"><h3>${esc(e.titulo)}</h3><span class="spacer"></span>${Telas.seloStatus(e.status)}</div>
          <div class="stack" style="gap:6px">
            <div class="periodo">${ic('calendario')} ${U.periodo(e.inicio, e.fim)} · ${semanas} ${semanas === 1 ? 'semana' : 'semanas'}</div>
            <div class="periodo">${ic('loja')} ${esc(e.loja || 'Sem loja')} · ${e.n_funcionarios} ${e.n_funcionarios === 1 ? 'funcionário' : 'funcionários'}</div>
          </div>
          <div class="rodape">
            ${vigente ? '<span class="selo info">Vigente</span>' : ''}
            ${e.erros == null ? '<span class="selo">Abra para verificar</span>' : e.erros ? `<span class="selo erro">${e.erros} ${e.erros === 1 ? 'violação' : 'violações'}</span>` : '<span class="selo ok">Sem violações</span>'}
            ${e.alertas ? `<span class="selo alerta">${e.alertas} ${e.alertas === 1 ? 'alerta' : 'alertas'}</span>` : ''}
            <span class="spacer"></span><span class="faint small">salva ${U.quando(e.atualizado_em)}</span>
          </div></div>`;
      }).join('')}</div>` : `<div class="card"><div class="vazio">${ic('escala')}<div>Nenhuma escala por aqui.</div>
        <div style="margin-top:12px"><button class="btn primario" data-nova2>${ic('gerar')} Criar a primeira</button></div></div></div>`;
    };
    desenhar();
    main.querySelector('[data-filtro]').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      filtroLista = b.dataset.k;
      main.querySelectorAll('[data-filtro] button').forEach((x) => x.classList.toggle('ativo', x === b));
      desenhar();
    });
    main.addEventListener('click', (e) => {
      if (e.target.closest('[data-nova],[data-nova2]')) { assistente(escalas); return; }
      const c = e.target.closest('.escala-card');
      if (c) location.hash = `#/escalas/${c.dataset.id}`;
    });
    if (abrirNova) assistente(escalas);
  }

  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /**
   * Palpite de turno para um dia (j: 0 = seg ... 6 = dom) pelo nome dos modelos.
   * Prefere os turnos com o nome da loja (ex.: "Parque Dez · Sexta"); se a loja tem turnos
   * mas nenhum para esse dia, devolve '' (folga). Sem turnos da loja, ignora os de outras lojas.
   */
  function palpiteTurno(loja, j) {
    const ativos = S.turnos.filter((t) => t.ativo);
    const util = [/semana/i, /seg/i];
    const padroes = [util, util, util, util, [/sexta/i, ...util], [/s[áa]b/i], [/domingo.*ajust/i, /domingo/i]][j];
    const acha = (lista) => { for (const re of padroes) { const t = lista.find((x) => re.test(x.nome)); if (t) return t.id; } return ''; };
    const daLoja = loja ? ativos.filter((t) => semAcento(t.nome).includes(semAcento(loja))) : [];
    if (daLoja.length) return acha(daLoja);
    const outrasLojas = [...S.lojas().map(semAcento), 'parque dez'].filter((l) => l !== semAcento(loja));
    return acha(ativos.filter((t) => !outrasLojas.some((l) => semAcento(t.nome).includes(l))));
  }

  // ========================================================== ASSISTENTE
  function assistente(escalas) {
    const lojas = S.lojas();
    // Sugere a primeira segunda-feira livre depois da última escala (ou a próxima segunda)
    let proxSeg = U.addDias(U.segunda(S.hoje), 7);
    const ultimoFim = escalas.map((e) => e.fim).sort().pop();
    if (ultimoFim && ultimoFim >= proxSeg) {
      const dia = U.addDias(ultimoFim, 1);
      proxSeg = U.dow(dia) === 1 ? dia : U.addDias(U.segunda(dia), 7);
    }
    const st = {
      passo: 1, loja: lojas[0] || '', inicio: proxSeg, semanas: 2, titulo: '', tituloManual: false, busca: '',
      fids: new Set(), modo: 'gerar', freq: 'auto', diasFolga: [0, 1, 2, 3, 4], membros: [], origem: escalas[0]?.id || '', contexto: {},
    };
    S.funcionarios.filter((f) => f.ativo && (!st.loja || f.loja === st.loja)).forEach((f) => st.fids.add(f.id));

    const m = UI.modal({ titulo: 'Nova escala', sub: 'Defina o período, quem participa e como preencher.', largo: 'extra', corpo: '<div data-conteudo></div>', rodape: '<div data-rodape class="row" style="width:100%"></div>' });
    const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    const dowDoIndice = (j) => (j + 1) % 7; // 0 = segunda ... 6 = domingo  →  Date.getDay()
    const fim = () => U.addDias(st.inicio, st.semanas * 7 - 1);
    const tituloPadrao = () => `Escala ${st.loja ? st.loja + ' ' : ''}— ${U.ddmm(st.inicio)} a ${U.ddmm(fim())}`;

    /**
     * Turno sugerido para o dia j (0 = seg ... 6 = dom):
     * 1) o que a pessoa mais usou nesse dia da semana nas escalas anteriores;
     * 2) um turno com o nome da loja dela (ex.: "Parque Dez · Sexta"); sem turno da loja para o dia, folga;
     * 3) um palpite pelo nome do turno.
     */
    const sugerirTurno = (f, j) => {
      const dow = dowDoIndice(j);
      const ctx = st.contexto[f.id] || {};
      const cont = {};
      Object.entries(ctx).forEach(([d, it]) => { if (CLT.ehTrabalho(it) && it.turno_id && U.dow(d) === dow) cont[it.turno_id] = (cont[it.turno_id] || 0) + 1; });
      const top = Object.entries(cont).sort((a, b) => b[1] - a[1])[0];
      if (top && S.turno(top[0])?.ativo) return Number(top[0]);
      return palpiteTurno(f.loja, j);
    };

    // Texto usado na busca de funcionários (nome, cargo, loja e matrícula, sem acento)
    const textoBusca = (f) => semAcento([f.nome, f.cargo, f.loja, f.matricula].join(' '));
    const filtrarLista = () => {
      const q = semAcento(st.busca).trim();
      let visiveis = 0;
      m.$$('.lista-sel label[data-busca]').forEach((l) => {
        const ok = !q || q.split(/\s+/).every((p) => l.dataset.busca.includes(p));
        l.hidden = !ok;
        if (ok) visiveis++;
      });
      m.$$('.lista-sel [data-grupo]').forEach((g) => {
        g.hidden = !m.$$(`.lista-sel label[data-grupo-de="${g.dataset.grupo}"]`).some((l) => !l.hidden);
      });
      const vazio = m.$('[data-nenhum-achado]');
      if (vazio) vazio.hidden = visiveis > 0;
    };
    const atualizarContagem = () => {
      const c = m.$('[data-contagem]');
      if (c) c.textContent = `Funcionários (${st.fids.size} selecionados)`;
      const b = m.$('[data-avancar]');
      if (b) b.disabled = !st.fids.size;
    };

    function passo1() {
      const funcs = S.funcionarios.filter((f) => f.ativo);
      const porLoja = funcs.filter((f) => !st.loja || f.loja === st.loja);
      const outros = funcs.filter((f) => st.loja && f.loja !== st.loja);
      const item = (f, grupo) => `<label data-busca="${esc(textoBusca(f))}" data-grupo-de="${grupo}"><input type="checkbox" data-fid="${f.id}" ${st.fids.has(f.id) ? 'checked' : ''} style="accent-color:var(--brand)">
        <div class="avatar">${U.iniciais(f.nome)}</div><div><div class="pessoa-nome">${esc(f.nome)}</div><div class="pessoa-sub">${esc([f.cargo, f.loja].filter(Boolean).join(' · '))}</div></div>
        <span class="spacer"></span><span class="muted small num">${U.dur(f.jornada_semanal * 60)}/sem.</span></label>`;
      return `<div class="passos"><div class="passo feito"></div><div class="passo"></div></div>
        <div class="stack">
          <div class="form-grade">
            <label class="campo inteiro"><span>Título</span><input class="inp" data-v="titulo" value="${esc(st.titulo || tituloPadrao())}"></label>
            <label class="campo"><span>Loja / setor</span><input class="inp" data-v="loja" list="dl-lojas2" value="${esc(st.loja)}">
              <datalist id="dl-lojas2">${lojas.map((l) => `<option value="${esc(l)}">`).join('')}</datalist></label>
            <div class="form-grade" style="gap:12px">
              <label class="campo"><span>Início</span>${UI.campoData(st.inicio, 'data-v="inicio"')}</label>
              <label class="campo"><span>Duração</span><select class="inp" data-v="semanas">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<option value="${n}" ${n === st.semanas ? 'selected' : ''}>${n} ${n === 1 ? 'semana' : 'semanas'}</option>`).join('')}</select></label>
            </div>
          </div>
          <div class="aviso info">${ic('calendario')}<div>Período: <b>${U.DOW_LONGO[U.dow(st.inicio)]}, ${U.dataBR(st.inicio)}</b> a <b>${U.DOW_LONGO[U.dow(fim())]}, ${U.dataBR(fim())}</b>${U.dow(st.inicio) !== 1 ? '. Para gerar automaticamente, o início precisa ser numa segunda-feira.' : '.'}</div></div>
          <div class="campo"><div class="row wrap"><span style="font-size:12.5px;font-weight:500" data-contagem>Funcionários (${st.fids.size} selecionados)</span><span class="spacer"></span>
            <button type="button" class="btn fantasma pequeno" data-marcar>Marcar os visíveis</button><button type="button" class="btn fantasma pequeno" data-nenhum>Desmarcar todos</button></div>
            <div class="busca" style="margin:2px 0 4px">${ic('busca')}<input class="inp" data-buscar placeholder="Pesquisar por nome, cargo, loja ou matrícula" value="${esc(st.busca)}" style="width:100%"></div>
            <div class="lista-sel">${porLoja.map((f) => item(f, 'loja')).join('')}${outros.length ? `<div class="muted small" data-grupo="outras" style="padding:8px 12px;background:var(--surface-2)">Outras lojas</div>${outros.map((f) => item(f, 'outras')).join('')}` : ''}
              ${funcs.length ? '<div class="vazio" data-nenhum-achado hidden>Ninguém encontrado com essa pesquisa.</div>' : '<div class="vazio">Nenhum funcionário ativo. Cadastre antes de criar a escala.</div>'}</div></div>
        </div>`;
    }

    function passo2() {
      const ativos = S.turnos.filter((t) => t.ativo);
      const opcoesTurno = (sel) => ativos.map((t) => `<option value="${t.id}" ${Number(sel) === t.id ? 'selected' : ''}>${UI.faixa(t.blocos)} · ${esc(t.nome)}</option>`).join('');
      const modos = [
        ['gerar', 'gerar', 'Gerar automaticamente', 'Distribui folgas e domingos seguindo a CLT.'],
        ['copiar', 'copiar', 'Repetir outra escala', 'Copia o padrão semana a semana de uma escala existente.'],
        ['branco', 'escala', 'Começar em branco', 'Você preenche cada dia no editor.'],
      ];
      let corpo = '';
      if (st.modo === 'gerar') {
        const perfis = st.membros.map((mb) => CLT.perfilMembro(mb));
        const algumDomingo = perfis.some((p) => p.trabalhaDomingo);
        const rotativos = st.membros.filter((mb, i) => perfis[i].precisaRotativa);
        const horasSemana = (mb) => mb.t.reduce((s, id) => s + (S.turno(id) ? U.resumoBlocos(S.turno(id).blocos).trabalhado : 0), 0);
        const resumoLinha = (mb, p) => {
          const h = horasSemana(mb);
          const contrato = Number(mb.f.jornada_semanal || 44) * 60;
          const tipo = p.precisaRotativa ? '6x1 · folga rotativa' : `${7 - p.fixas.length}x${p.fixas.length}`;
          // Folga rotativa: desconta um dia em que a folga pode cair (semana típica, sem o domingo de folga)
          const minDia = (j) => U.resumoBlocos(S.turno(mb.t[j]).blocos).trabalhado;
          const total = p.precisaRotativa ? h - Math.min(...(st.diasFolga.length ? st.diasFolga : [0]).map(minDia)) : h;
          return `<span class="num" style="font-weight:600;color:${total > contrato ? 'var(--erro)' : 'inherit'}">${U.dur(total)}</span>
            <div class="pessoa-sub">${tipo}</div>`;
        };
        corpo = `
          <div class="aviso info">${ic('info')}<div>Escolha o turno de cada dia. <b>“Folga”</b> deixa o dia livre toda semana, como sábado e domingo no administrativo (5x2).
            Quem tem turno nos 7 dias recebe uma folga rotativa por semana, distribuída pelo sistema.</div></div>
          <div style="overflow-x:auto;border:1px solid var(--line);border-radius:10px">
          <table class="tabela tabela-membros">
            <thead><tr><th>Funcionário</th>${DIAS_SEMANA.map((d) => `<th>${d}</th>`).join('')}<th class="right">Semana</th></tr></thead>
            <tbody>
              <tr style="background:var(--surface-2)"><td class="muted small">Aplicar a todos</td>
                ${DIAS_SEMANA.map((_, j) => `<td><select class="inp" data-todos="${j}" title="Aplicar a todos na ${DIAS_SEMANA[j]}"><option value="">—</option><option value="0">Folga</option>${opcoesTurno()}</select></td>`).join('')}
                <td></td></tr>
              ${st.membros.map((mb, i) => `<tr><td><div class="pessoa"><div class="avatar">${U.iniciais(mb.f.nome)}</div><div><div class="pessoa-nome">${esc(mb.f.nome)}</div><div class="pessoa-sub">${esc(mb.f.cargo || '')} · ${U.dur(mb.f.jornada_semanal * 60)}</div></div></div></td>
                ${mb.t.map((tid, j) => `<td><select class="inp" data-m="${i}" data-j="${j}" style="${tid ? `border-left:3px solid ${S.turno(tid)?.cor}` : ''}"><option value="">Folga</option>${opcoesTurno(tid)}</select></td>`).join('')}
                <td class="right">${resumoLinha(mb, perfis[i])}</td></tr>`).join('')}
            </tbody></table></div>
          <div class="row wrap" style="gap:8px">
            <span class="muted small">Atalhos:</span>
            <button type="button" class="btn pequeno" data-copiar-seg>Copiar segunda para ter a sex</button>
          </div>
          ${algumDomingo || rotativos.length ? `<div class="form-grade">
            ${algumDomingo ? `<div class="campo"><span>Domingo de folga (para quem trabalha domingo)</span><div class="segmentado" data-freq>
              ${[['auto', 'Automático'], ['2', 'A cada 2 sem.'], ['3', 'A cada 3 sem.']].map(([k, n]) => `<button type="button" data-k="${k}" class="${st.freq === k ? 'ativo' : ''}">${n}</button>`).join('')}</div>
              <small>Automático: mulheres a cada 2 semanas (CLT art. 386) e homens a cada 3 (Lei 10.101/2000).</small></div>` : ''}
            ${rotativos.length ? `<div class="campo"><span>Folga rotativa pode cair em</span><div class="row wrap" data-dias>
              ${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((n, i) => `<label class="chk"><input type="checkbox" value="${i}" ${st.diasFolga.includes(i) ? 'checked' : ''}>${n}</label>`).join('')}</div>
              <small>Vale só para ${rotativos.map((mb) => esc(mb.f.nome)).join(', ')}, que ${rotativos.length === 1 ? 'tem' : 'têm'} turno nos 7 dias. O sistema espalha as folgas para não faltar gente.</small></div>` : ''}
          </div>` : ''}
          ${rotativos.some((mb) => CLT.perfilMembro(mb).trabalhaDomingo) ? `<div class="aviso info">${ic('info')}<div>Na semana do domingo de folga, quem tem folga rotativa também folga num dia útil (a CLT não permite 7 dias seguidos). Essas semanas ficam com menos horas.</div></div>` : ''}
          ${avisosDescanso()}`;
      } else if (st.modo === 'copiar') {
        corpo = escalas.length ? `<label class="campo"><span>Escala de origem</span><select class="inp" data-origem>${escalas.map((e) => `<option value="${e.id}" ${Number(st.origem) === e.id ? 'selected' : ''}>${esc(e.titulo)} · ${U.periodo(e.inicio, e.fim)}</option>`).join('')}</select>
          <small>Cada semana da nova escala recebe a semana correspondente da origem, repetindo o ciclo. Funcionários que não estão na origem ficam em branco.</small></label>`
          : '<div class="aviso alerta">Ainda não existe escala para copiar.</div>';
      } else {
        corpo = '<div class="aviso info">A escala será criada vazia. No editor, clique em cada dia para escolher turno, folga ou afastamento.</div>';
      }
      return `<div class="passos"><div class="passo feito"></div><div class="passo feito"></div></div>
        <div class="stack">
          <div class="opcoes-modo">${modos.map(([k, i, t, d]) => `<div class="opcao-modo ${st.modo === k ? 'ativo' : ''}" data-modo="${k}"><div class="t">${ic(i === 'copiar' ? 'copiar' : i)} ${t}</div><div class="d">${d}</div></div>`).join('')}</div>
          ${corpo}
        </div>`;
    }

    function avisosDescanso() {
      const grupos = {};
      const LONGO = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
      st.membros.forEach((mb) => [0, 1, 2, 3, 4, 5, 6].forEach((j) => {
        const ta = S.turno(mb.t[j]), tb = S.turno(mb.t[(j + 1) % 7]);
        if (!ta || !tb) return;
        const gap = CLT.descansoEntre(ta.blocos, tb.blocos);
        const rot = `${LONGO[j][0].toUpperCase() + LONGO[j].slice(1)} → ${LONGO[(j + 1) % 7]}`;
        if (gap != null && gap < 660) (grupos[`${rot}|${gap}`] ||= []).push(mb.f.nome);
      }));
      return Object.entries(grupos).map(([k, nomes]) => {
        const [rot, gap] = k.split('|');
        return `<div class="aviso erro">${ic('alerta')}<div><b>${rot}: só ${U.dur(Number(gap))} de descanso</b> (mínimo 11h, CLT art. 66) para ${nomes.map(esc).join(', ')}. Troque um dos turnos, por exemplo um domingo com entrada mais tarde.</div></div>`;
      }).join('');
    }

    function desenhar() {
      m.$('[data-conteudo]').innerHTML = st.passo === 1 ? passo1() : passo2();
      if (st.passo === 1) filtrarLista();
      m.$('[data-rodape]').innerHTML = st.passo === 1
        ? `<span class="spacer"></span><button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-avancar ${st.fids.size ? '' : 'disabled'}>Continuar ${ic('seta')}</button>`
        : `<button class="btn" data-voltar>${ic('voltar')} Voltar</button><span class="spacer"></span><button class="btn primario" data-criar>${ic(st.modo === 'gerar' ? 'gerar' : 'check')} ${st.modo === 'gerar' ? 'Gerar escala' : 'Criar escala'}</button>`;
      m.$('[data-rodape] [data-fechar]')?.addEventListener('click', m.fechar);
    }

    m.el.addEventListener('input', (e) => {
      if (e.target.matches('[data-buscar]')) { st.busca = e.target.value; filtrarLista(); return; }
      const v = e.target.dataset.v;
      if (!v) return;
      if (v === 'titulo') { st.titulo = e.target.value; st.tituloManual = true; return; }
      if (v === 'loja') st.loja = e.target.value;
    });
    m.el.addEventListener('keydown', (e) => {
      // Enter na pesquisa marca o único resultado visível
      if (e.key !== 'Enter' || !e.target.matches('[data-buscar]')) return;
      e.preventDefault();
      const vis = m.$$('.lista-sel label[data-busca]').filter((l) => !l.hidden);
      if (vis.length === 1) { const cb = vis[0].querySelector('input'); cb.checked = true; st.fids.add(Number(cb.dataset.fid)); atualizarContagem(); }
    });
    // Redesenha mantendo o foco no mesmo campo (ex.: depois de trocar a data de início)
    const redesenhar = () => {
      const ativo = document.activeElement;
      const seletor = ativo && ativo.dataset && ativo.dataset.v ? `[data-v="${ativo.dataset.v}"]` : null;
      desenhar();
      filtrarLista();
      if (seletor) m.$(seletor)?.focus();
    };
    m.el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.v === 'inicio') {
        const iso = U.lerData(t.value);
        if (!iso) { UI.toast('Data de início inválida. Use dd/mm/aaaa ou só os números (16112026).', 'erro'); return; }
        st.inicio = iso; refazTitulo(); redesenhar();
      } else if (t.dataset.v === 'semanas') { st.semanas = Number(t.value); refazTitulo(); redesenhar(); }
      else if (t.dataset.v === 'loja') { refazTitulo(); redesenhar(); }
      else if (t.dataset.fid) { t.checked ? st.fids.add(Number(t.dataset.fid)) : st.fids.delete(Number(t.dataset.fid)); atualizarContagem(); }
      else if (t.dataset.m) { st.membros[Number(t.dataset.m)].t[Number(t.dataset.j)] = t.value ? Number(t.value) : ''; desenhar(); }
      else if (t.dataset.todos !== undefined && t.matches('select')) {
        if (t.value !== '') st.membros.forEach((mb) => { mb.t[Number(t.dataset.todos)] = t.value === '0' ? '' : Number(t.value); });
        desenhar();
      }
      else if (t.closest('[data-dias]')) { st.diasFolga = [...m.el.querySelectorAll('[data-dias] input:checked')].map((x) => Number(x.value)); desenhar(); }
      else if (t.dataset.origem !== undefined) st.origem = t.value;
    });
    const refazTitulo = () => { if (!st.tituloManual) st.titulo = ''; };

    m.el.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('[data-marcar]')) {
        m.$$('.lista-sel label[data-busca]').filter((l) => !l.hidden).forEach((l) => {
          const cb = l.querySelector('input'); cb.checked = true; st.fids.add(Number(cb.dataset.fid));
        });
        atualizarContagem(); return;
      }
      if (t.closest('[data-nenhum]')) { st.fids.clear(); m.$$('.lista-sel input[data-fid]').forEach((cb) => { cb.checked = false; }); atualizarContagem(); return; }
      if (t.closest('[data-copiar-seg]')) { st.membros.forEach((mb) => { for (let j = 1; j <= 4; j++) mb.t[j] = mb.t[0]; }); desenhar(); return; }
      const modo = t.closest('[data-modo]');
      if (modo) { st.modo = modo.dataset.modo; desenhar(); return; }
      const fq = t.closest('[data-freq] button');
      if (fq) { st.freq = fq.dataset.k; desenhar(); return; }
      if (t.closest('[data-voltar]')) { st.passo = 1; desenhar(); return; }
      if (t.closest('[data-avancar]')) {
        // Todos da mesma loja: a escala assume essa loja (e o título, se não foi editado)
        const lojasSel = [...new Set([...st.fids].map((id) => S.func(id)?.loja).filter(Boolean))];
        if (lojasSel.length === 1 && lojasSel[0] !== st.loja) {
          st.loja = lojasSel[0];
          refazTitulo();
          UI.toast(`Loja da escala ajustada para ${st.loja}.`);
        }
        if (!st.titulo) st.titulo = tituloPadrao();
        try {
          const ids = [...st.fids];
          const r = await API.get(`/api/contexto?fids=${ids.join(',')}&inicio=${st.inicio}&fim=${fim()}`);
          st.contexto = r.contexto;
          st.membros = ids.map((id) => S.func(id)).sort((a, b) => a.nome.localeCompare(b.nome)).map((f) => ({
            f,
            // Um turno por dia (seg..dom): o que a pessoa mais usou nesse dia da semana; senão, um palpite pelo nome
            t: [0, 1, 2, 3, 4, 5, 6].map((j) => sugerirTurno(f, j)),
          }));
          st.passo = 2; desenhar();
        } catch (err) { UI.toast(err.message, 'erro'); }
        return;
      }
      if (t.closest('[data-criar]')) criar();
    });

    async function criar() {
      let inicio = st.inicio;
      if (st.modo === 'gerar' && U.dow(inicio) !== 1) {
        inicio = U.dow(inicio) === 0 ? U.addDias(inicio, 1) : U.segunda(inicio);
        UI.toast(`Início ajustado para segunda-feira, ${U.dataBR(inicio)}.`);
      }
      const fimEsc = U.addDias(inicio, st.semanas * 7 - 1);
      const fids = st.passo === 2 && st.membros.length ? st.membros.map((mb) => mb.f.id) : [...st.fids];
      let itens = {};
      if (st.modo === 'gerar') {
        if (st.membros.some((mb) => CLT.perfilMembro(mb).precisaRotativa) && !st.diasFolga.length) {
          UI.toast('Escolha ao menos um dia para a folga rotativa.', 'erro'); return;
        }
        itens = CLT.gerar({ inicio, semanas: st.semanas, membros: st.membros, freq: st.freq, diasFolga: st.diasFolga, contexto: st.contexto, config: S.config });
      } else if (st.modo === 'copiar' && st.origem) {
        const o = await API.get(`/api/escalas/${st.origem}`);
        const base = U.segunda(o.escala.inicio);
        const nSem = Math.ceil((U.diffDias(base, o.escala.fim) + 1) / 7);
        const fonte = {};
        o.itens.forEach((it) => { (fonte[it.funcionario_id] ||= {})[it.data] = it; });
        for (const fid of fids) {
          itens[fid] = {};
          for (const d of U.intervalo(inicio, fimEsc)) {
            const w = Math.floor(U.diffDias(U.segunda(inicio), d) / 7) % nSem;
            const it = fonte[fid]?.[U.addDias(base, w * 7 + (U.dow(d) + 6) % 7)];
            if (it) itens[fid][d] = { tipo: it.tipo, turno_id: it.turno_id, blocos: it.blocos, obs: it.obs };
          }
        }
      }
      const lista = [];
      for (const fid of fids) for (const [data, it] of Object.entries(itens[fid] || {})) lista.push({ funcionario_id: fid, data, ...it });
      const funcionarios = fids.map((id) => S.func(id));
      const analise = CLT.analisar({ dias: U.intervalo(inicio, fimEsc), funcionarios, itens, contexto: st.contexto, feriados: S.feriadosMapa(), config: S.config });
      try {
        const r = await API.post('/api/escalas', {
          titulo: st.titulo || tituloPadrao(), loja: st.loja, inicio, fim: fimEsc, funcionarios: fids, itens: lista,
          resumo: { erros: analise.contagem.erro, alertas: analise.contagem.alerta },
          origem: { gerar: 'Gerada automaticamente', copiar: 'Copiada de outra escala', branco: 'Criada em branco' }[st.modo],
        });
        m.fechar();
        UI.toast('Escala criada.');
        location.hash = `#/escalas/${r.id}`;
      } catch (err) { UI.toast(err.message, 'erro'); }
    }

    desenhar();
  }

  // ============================================================== EDITOR
  let E = null;

  async function editor(main, id) {
    const dados = await API.get(`/api/escalas/${id}`);
    const itens = {};
    dados.itens.forEach((it) => { (itens[it.funcionario_id] ||= {})[it.data] = { tipo: it.tipo, turno_id: it.turno_id, blocos: it.blocos, obs: it.obs }; });
    E = {
      id: Number(id), main, escala: dados.escala, funcs: dados.funcionarios.filter((f) => S.func(f)), itens,
      contexto: dados.contexto, sobreposicoes: dados.sobreposicoes, sujo: false,
      aba: E && E.id === Number(id) ? E.aba : 'conformidade', filtroSev: 'todos', abertos: new Set(), diaCob: null,
      sel: new Set(), ancora: null,
    };
    E.diaCob = E.escala.inicio <= S.hoje && E.escala.fim >= S.hoje ? S.hoje : E.escala.inicio;
    montar();
    // Mantém a contagem da lista de escalas em dia com as regras atuais
    const c = E.analise.contagem;
    if (c.erro !== dados.escala.erros || c.alerta !== dados.escala.alertas) {
      API.post(`/api/escalas/${E.id}/resumo`, { erros: c.erro, alertas: c.alerta }).catch(() => {});
    }
  }

  const bloqueada = () => E.escala.status === 'publicada';
  const dias = () => U.intervalo(E.escala.inicio, E.escala.fim);
  const funcsObj = () => E.funcs.map((id) => S.func(id)).filter(Boolean);

  function analisar() {
    E.analise = CLT.analisar({
      dias: dias(), funcionarios: funcsObj(), itens: E.itens, contexto: E.contexto,
      sobreposicoes: E.sobreposicoes, feriados: S.feriadosMapa(), config: S.config,
    });
    // Primeiro carregamento: abre os grupos com violação
    if (!E.abertos.size) E.analise.issues.filter((i) => i.sev === 'erro').forEach((i) => E.abertos.add(i.regra));
  }

  function montar() {
    const e = E.escala;
    E.main.innerHTML = `
      <div class="so-impressao" style="margin-bottom:10px">
        <div style="font-size:16px;font-weight:600">${esc(S.config.empresa || '')} — ${esc(e.titulo)}</div>
        <div>${esc(e.loja || '')} · ${U.dataBR(e.inicio)} a ${U.dataBR(e.fim)} · ${e.status === 'publicada' ? 'Escala publicada' : 'Rascunho'} · emitida em ${U.dataBR(S.hoje)}</div>
      </div>
      <div class="nao-imprimir"><div class="trilha"><a href="#/escalas">Escalas</a> / ${esc(e.titulo)}</div></div>
      <div class="editor-topo nao-imprimir" data-topo></div>
      <div class="resumo-faixa nao-imprimir" data-resumo></div>
      <div class="card" style="margin-bottom:18px">
        <div class="card-cab nao-imprimir">
          <h2>Grade</h2><span class="muted small" data-dica></span>
          <div class="acoes"><div data-barra-sel></div><div data-acoes-grade></div></div>
        </div>
        <div class="grade-wrap"><table class="grade" data-grade></table></div>
        <div class="legenda" data-legenda></div>
        <div class="assinaturas"><div>Responsável RH</div><div>Gerência da loja</div><div>Ciência dos funcionários</div></div>
      </div>
      <div class="card nao-imprimir">
        <div class="abas" data-abas></div>
        <div data-aba></div>
      </div>`;
    analisar();
    desenharTudo();
    const grade = E.main.querySelector('[data-grade]');
    grade.addEventListener('click', cliqueGrade);
    grade.addEventListener('mousedown', inicioArraste);
    grade.addEventListener('mouseover', moverArraste);
    E.main.querySelector('[data-barra-sel]').addEventListener('click', (ev) => {
      if (ev.target.closest('[data-limpar-sel]')) { UI.fecharPopover(); limparSelecao(); return; }
      const b = ev.target.closest('[data-editar-sel]');
      if (b && E.sel.size) editarDias(b, [...E.sel]);
    });
    E.main.querySelector('[data-abas]').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-aba-k]'); if (!b) return;
      E.aba = b.dataset.abaK; desenharAbas();
    });
    E.main.querySelector('[data-aba]').addEventListener('click', cliqueAba);
    E.main.querySelector('[data-resumo]').addEventListener('click', (ev) => {
      const k = ev.target.closest('[data-sev]'); if (!k) return;
      E.aba = 'conformidade'; E.filtroSev = k.dataset.sev;
      E.analise.issues.filter((i) => i.sev === k.dataset.sev).forEach((i) => E.abertos.add(i.regra));
      desenharAbas();
      E.main.querySelector('[data-abas]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function desenharTudo() { desenharTopo(); desenharResumo(); desenharGrade(); desenharAbas(); }

  function alterou() {
    E.sujo = true;
    analisar();
    desenharTopo(); desenharResumo(); desenharGrade(); desenharAbas();
  }

  // ---------------------------------------------------------------- topo
  function desenharTopo() {
    const e = E.escala, b = bloqueada();
    E.main.querySelector('[data-topo]').innerHTML = `
      <div class="editor-titulo" style="min-width:0">
        <input data-titulo value="${esc(e.titulo)}" ${b ? 'disabled' : ''} aria-label="Título da escala">
        <div class="editor-meta">
          ${Telas.seloStatus(e.status)}
          <span class="meta-item">${ic('calendario')} ${U.periodo(e.inicio, e.fim)}</span>
          <span class="meta-item">${ic('loja')} ${esc(e.loja || 'Sem loja')}</span>
          <span class="meta-item">${ic('pessoas')} ${E.funcs.length}</span>
          ${b ? '' : `<button class="btn fantasma pequeno" data-detalhes>${ic('editar')} Detalhes</button>`}
          ${E.sujo ? '<span class="sujo">● Alterações não salvas</span>' : ''}
        </div>
      </div>
      <div class="acoes" style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-versoes title="Versões salvas">${ic('historico')} Versões</button>
        <button class="btn icone" data-imprimir title="Imprimir">${ic('imprimir')}</button>
        <button class="btn icone" data-csv title="Exportar para Excel (CSV)">${ic('baixar')}</button>
        <button class="btn icone" data-duplicar title="Duplicar para outro período">${ic('copiar')}</button>
        ${b ? `<button class="btn" data-reabrir>${ic('destrancar')} Reabrir para edição</button>`
          : `<button class="btn icone perigo" data-excluir title="Excluir escala">${ic('lixo')}</button>
             <button class="btn ${E.sujo ? 'primario' : ''}" data-salvar>${ic('salvar')} Salvar</button>
             <button class="btn sucesso" data-publicar>${ic('publicar')} Publicar</button>`}
      </div>`;
    const t = E.main.querySelector('[data-topo]');
    t.querySelector('[data-titulo]').addEventListener('input', (ev) => {
      E.escala.titulo = ev.target.value;
      if (!E.sujo) { E.sujo = true; desenharTopoSemFoco(); }
    });
    t.querySelector('[data-salvar]')?.addEventListener('click', () => salvar());
    t.querySelector('[data-publicar]')?.addEventListener('click', publicar);
    t.querySelector('[data-reabrir]')?.addEventListener('click', reabrir);
    t.querySelector('[data-excluir]')?.addEventListener('click', excluir);
    t.querySelector('[data-detalhes]')?.addEventListener('click', detalhes);
    t.querySelector('[data-versoes]').addEventListener('click', versoes);
    t.querySelector('[data-imprimir]').addEventListener('click', () => window.print());
    t.querySelector('[data-csv]').addEventListener('click', exportarCSV);
    t.querySelector('[data-duplicar]').addEventListener('click', duplicar);
  }

  /** Atualiza só o indicador de "não salvo" sem perder o foco do título. */
  function desenharTopoSemFoco() {
    const meta = E.main.querySelector('.editor-meta');
    if (meta && !meta.querySelector('.sujo')) meta.insertAdjacentHTML('beforeend', '<span class="sujo">● Alterações não salvas</span>');
    E.main.querySelector('[data-salvar]')?.classList.add('primario');
  }

  // -------------------------------------------------------------- resumo
  function desenharResumo() {
    const c = E.analise.contagem;
    const pf = Object.values(E.analise.porFunc);
    const total = pf.reduce((s, p) => s + p.totalMin, 0);
    const domTrab = pf.reduce((s, p) => s + p.domingosTrab, 0);
    const domingos = dias().filter((d) => U.dow(d) === 0).length * E.funcs.length;
    E.main.querySelector('[data-resumo]').innerHTML = `
      <div class="kpi card clicavel ${c.erro ? 'erro' : 'ok'}" data-sev="erro"><div class="rot">${ic('erro')} Violações CLT</div><div class="val">${c.erro}</div></div>
      <div class="kpi card clicavel ${c.alerta ? 'alerta' : ''}" data-sev="alerta"><div class="rot">${ic('alerta')} Alertas</div><div class="val">${c.alerta}</div></div>
      <div class="kpi card clicavel" data-sev="info"><div class="rot">${ic('info')} Informações</div><div class="val">${c.info}</div></div>
      <div class="kpi card"><div class="rot">${ic('relogio')} Horas escaladas</div><div class="val">${U.dur(total)}</div></div>
      <div class="kpi card"><div class="rot">${ic('calendario')} Domingos de folga</div><div class="val">${domingos - domTrab}<span class="muted" style="font-size:14px"> / ${domingos}</span></div></div>`;
  }

  // --------------------------------------------------------------- grade
  function desenharGrade() {
    const ds = dias();
    const fer = S.feriadosMapa();
    const funcs = funcsObj();
    const pior = (lista) => (lista || []).reduce((p, i) => (p == null || ['erro', 'alerta', 'info'].indexOf(i.sev) < ['erro', 'alerta', 'info'].indexOf(p) ? i.sev : p), null);
    const head = `<thead><tr><th class="col-func">Funcionário</th>${ds.map((d, i) => {
      const cls = [U.dow(d) === 0 && 'domingo', fer[d] && 'feriado', d === S.hoje && 'hoje-col', i > 0 && U.dow(d) === 1 && 'semana-ini'].filter(Boolean).join(' ');
      return `<th class="${cls}" title="${esc(fer[d] || '')}"><div class="dia">${U.DOW[U.dow(d)]}</div><div class="data">${U.ddmm(d)}</div>${fer[d] ? `<div class="fer">${esc(fer[d])}</div>` : ''}</th>`;
    }).join('')}<th class="col-tot">Horas</th></tr></thead>`;

    const body = funcs.map((f) => {
      const pf = E.analise.porFunc[f.id];
      const contrato = Number(f.jornada_semanal || 44) * 60;
      const cels = ds.map((d, i) => {
        const it = (E.itens[f.id] || {})[d];
        const marc = pior(E.analise.celulas[`${f.id}|${d}`]);
        const cls = ['cel', U.dow(d) === 0 && 'domingo', i > 0 && U.dow(d) === 1 && 'semana-ini'].filter(Boolean).join(' ');
        return `<td class="${cls}" data-f="${f.id}" data-d="${d}">${UI.celula(it)}${marc ? `<span class="marcador ${marc}"></span>` : ''}</td>`;
      }).join('');
      const sem = pf.semanas.map((s, i) => `<div class="tot-semana">S${i + 1} <b class="${s.min > contrato ? 'acima' : ''}">${U.dur(s.min)}</b>${s.completa ? '' : '<span title="Semana incompleta">*</span>'}</div>`).join('');
      return `<tr><td class="col-func"><div class="func-cel"><div class="avatar">${U.iniciais(f.nome)}</div>
          <div style="min-width:0"><div class="pessoa-nome" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.nome)}</div><div class="pessoa-sub">${esc(f.cargo || '')}</div></div>
          ${bloqueada() ? '' : `<button class="btn fantasma pequeno icone acao-linha" data-linha="${f.id}" title="Ações da linha">${ic('linha')}</button>`}</div></td>
        ${cels}<td class="col-tot">${sem}</td></tr>`;
    }).join('');

    const foot = funcs.length ? `<tfoot><tr><td class="col-func muted small" style="background:var(--surface-2)">Trabalhando</td>${ds.map((d, i) => {
      const n = funcs.filter((f) => CLT.ehTrabalho((E.itens[f.id] || {})[d])).length;
      return `<td class="${i > 0 && U.dow(d) === 1 ? 'semana-ini' : ''}" style="text-align:center;background:var(--surface-2);padding:8px 4px"><span class="num" style="font-weight:600;color:${n === 0 ? 'var(--erro)' : 'var(--ink)'}">${n}</span><span class="muted small"> / ${funcs.length}</span></td>`;
    }).join('')}<td class="col-tot"></td></tr></tfoot>` : '';

    const grade = E.main.querySelector('[data-grade]');
    grade.classList.toggle('bloqueada', bloqueada());
    grade.innerHTML = funcs.length ? head + `<tbody>${body}</tbody>` + foot
      : `<tbody><tr><td><div class="vazio">${ic('pessoas')}<div>Nenhum funcionário nesta escala.</div></div></td></tr></tbody>`;

    E.main.querySelector('[data-dica]').innerHTML = bloqueada() ? 'Escala publicada: reabra para editar.'
      : 'Clique num dia para editar. Para vários: arraste, <kbd>Shift</kbd>+clique ou <kbd>Ctrl</kbd>+clique. <kbd>Delete</kbd> limpa.';
    marcarSelecao();
    E.main.querySelector('[data-acoes-grade]').innerHTML = bloqueada() ? '' : `<button class="btn pequeno" data-add-func>${ic('mais')} Funcionário</button>`;
    E.main.querySelector('[data-add-func]')?.addEventListener('click', adicionarFuncionario);

    const usados = new Set();
    Object.values(E.itens).forEach((m) => Object.values(m).forEach((it) => it.turno_id && usados.add(it.turno_id)));
    E.main.querySelector('[data-legenda]').innerHTML = [...usados].map((tid) => S.turno(tid)).filter(Boolean)
      .map((t) => `<span><i style="background:${t.cor}"></i>${esc(t.nome)}</span>`).join('')
      + '<span><i style="background:repeating-linear-gradient(135deg,#f6f7f9 0 3px,#dfe2e8 3px 6px)"></i>Folga</span>'
      + '<span class="nao-imprimir"><i style="background:var(--erro);border-radius:50%;width:8px;height:8px"></i>Violação</span>'
      + '<span class="nao-imprimir"><i style="background:var(--alerta);border-radius:50%;width:8px;height:8px"></i>Alerta</span>'
      + `<span class="nao-imprimir">${ic('info')} Totais por semana de seg a dom; * semana incompleta</span>`;
  }

  // ------------------------------------------------- seleção de vários dias
  // Clique: edita o dia. Arrastar, Shift+clique (intervalo) ou Ctrl+clique (um a um): seleciona vários.
  let arraste = null;

  const chaveTd = (td) => `${td.dataset.f}|${td.dataset.d}`;
  const tdDaChave = (k) => { const [f, d] = k.split('|'); return E.main.querySelector(`td.cel[data-f="${f}"][data-d="${d}"]`); };

  /** Todas as células do retângulo entre duas chaves (linhas = funcionários, colunas = dias). */
  function retangulo(a, b) {
    const [fa, da] = a.split('|'), [fb, db] = b.split('|');
    const ids = E.funcs.map(String), ds = dias();
    const [l1, l2] = [ids.indexOf(fa), ids.indexOf(fb)].sort((x, y) => x - y);
    const [c1, c2] = [ds.indexOf(da), ds.indexOf(db)].sort((x, y) => x - y);
    const r = new Set();
    for (let l = l1; l <= l2; l++) for (let c = c1; c <= c2; c++) r.add(`${ids[l]}|${ds[c]}`);
    return r;
  }

  function marcarSelecao() {
    E.main.querySelectorAll('td.cel.sel').forEach((x) => x.classList.remove('sel'));
    E.sel.forEach((k) => tdDaChave(k)?.classList.add('sel'));
    const barra = E.main.querySelector('[data-barra-sel]');
    if (!barra) return;
    if (E.sel.size > 1) {
      barra.innerHTML = `<div class="barra-sel"><span>${E.sel.size} dias selecionados</span>
        <button class="btn pequeno primario" data-editar-sel>${ic('editar')} Definir</button>
        <button class="btn pequeno fantasma" data-limpar-sel title="Desfazer seleção (Esc)">${ic('x')}</button></div>`;
    } else barra.innerHTML = '';
  }

  function limparSelecao() { E.sel = new Set(); E.ancora = null; marcarSelecao(); }

  function inicioArraste(ev) {
    const linha = ev.target.closest('[data-linha]');
    if (linha) return;
    const td = ev.target.closest('td.cel');
    if (!td || ev.button !== 0) return;
    if (bloqueada()) {
      const oc = E.analise.celulas[chaveTd(td)];
      if (oc) UI.toast(oc.map((o) => o.msg).join(' '), oc.some((o) => o.sev === 'erro') ? 'erro' : 'ok');
      return;
    }
    ev.preventDefault();
    UI.fecharPopover();
    const k = chaveTd(td);
    if (ev.ctrlKey || ev.metaKey) {
      E.sel.has(k) ? E.sel.delete(k) : E.sel.add(k);
      E.ancora = k;
      marcarSelecao();
      return;
    }
    if (ev.shiftKey && E.ancora) { E.sel = retangulo(E.ancora, k); marcarSelecao(); return; }
    E.ancora = k;
    E.sel = new Set([k]);
    arraste = { inicio: k, moveu: false };
    E.main.querySelector('[data-grade]').classList.add('selecionando');
    marcarSelecao();
  }

  function moverArraste(ev) {
    if (!arraste) return;
    const td = ev.target.closest('td.cel');
    if (!td) return;
    const k = chaveTd(td);
    if (k !== arraste.inicio) arraste.moveu = true;
    E.sel = retangulo(arraste.inicio, k);
    marcarSelecao();
  }

  // Um único ouvinte global (o editor é recriado a cada navegação)
  document.addEventListener('mouseup', () => {
    if (!arraste || !E) return;
    const { inicio, moveu } = arraste;
    arraste = null;
    E.main.querySelector('[data-grade]')?.classList.remove('selecionando');
    if (!moveu) { const td = tdDaChave(inicio); if (td) editarDias(td, [inicio]); }
    else if (E.sel.size > 1) editarDias(E.main.querySelector('[data-editar-sel]') || tdDaChave(inicio), [...E.sel]);
  });
  document.addEventListener('keydown', (ev) => {
    if (!E || !E.sel || !document.body.contains(E.main)) return;
    if (ev.key === 'Escape' && E.sel.size && !document.querySelector('.popover, .fundo')) limparSelecao();
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && E.sel.size && !bloqueada()
      && !document.querySelector('.popover, .fundo') && !ev.target.closest('input, textarea, select')) {
      E.sel.forEach((k) => { const [f, d] = k.split('|'); if (E.itens[f]) delete E.itens[f][d]; });
      const n = E.sel.size;
      limparSelecao(); alterou();
      UI.toast(`${n} ${n === 1 ? 'dia limpo' : 'dias limpos'}.`);
    }
  });

  function cliqueGrade(ev) {
    const linha = ev.target.closest('[data-linha]');
    if (linha) menuLinha(linha, Number(linha.dataset.linha));
  }

  // ---------------------------------------------------- editor de dia(s)
  /** Edita um dia (com opções de "aplicar em") ou vários dias selecionados de uma vez. */
  function editarDias(ancora, chaves) {
    const varios = chaves.length > 1;
    const [fid0, data0] = chaves[0].split('|');
    const fid = Number(fid0), data = data0;
    const f = S.func(fid);
    const atual = varios
      ? chaves.map((k) => { const [a, b] = k.split('|'); return (E.itens[a] || {})[b]; }).find(Boolean)
      : (E.itens[fid] || {})[data];
    const st = {
      tipo: atual?.tipo || 'trabalho',
      turno_id: atual?.turno_id || '',
      blocos: atual?.blocos?.length ? atual.blocos : (S.turno(atual?.turno_id)?.blocos || []),
      obs: varios ? '' : atual?.obs || '',
    };
    if (!atual) {
      // Dia vazio: sugere o turno que a pessoa já usa no mesmo dia da semana (ou o primeiro ativo)
      // senão, o palpite pela loja e dia da semana; por último, o primeiro turno ativo
      const mesmoDia = Object.entries(E.itens[fid] || {}).find(([d, it]) => U.dow(d) === U.dow(data) && it.turno_id && S.turno(it.turno_id)?.ativo);
      const palpite = palpiteTurno(f?.loja || E.escala.loja, (U.dow(data) + 6) % 7);
      const t = mesmoDia ? S.turno(mesmoDia[1].turno_id) : palpite ? S.turno(palpite) : S.turnos.find((x) => x.ativo);
      if (t) { st.turno_id = t.id; st.blocos = t.blocos.map((b) => [...b]); }
      // Dia sem turno da loja (ex.: sábado no administrativo): já começa como folga
      if (!mesmoDia && !palpite && f?.loja && S.turnos.some((x) => x.ativo && semAcento(x.nome).includes(semAcento(f.loja)))) st.tipo = 'folga';
    }
    const fer = S.feriadosMapa()[data];
    const oc = varios ? [] : E.analise.celulas[`${fid}|${data}`] || [];
    const ativos = S.turnos.filter((t) => t.ativo || t.id === Number(st.turno_id));
    const pessoas = [...new Set(chaves.map((k) => k.split('|')[0]))].map((id) => S.func(id)?.nome).filter(Boolean);
    const datas = [...new Set(chaves.map((k) => k.split('|')[1]))].sort();
    const cab = varios
      ? `<div class="t">${chaves.length} dias selecionados</div>
         <div class="muted small">${esc(pessoas.slice(0, 3).join(', '))}${pessoas.length > 3 ? ` e mais ${pessoas.length - 3}` : ''} · ${U.ddmm(datas[0])} a ${U.ddmm(datas[datas.length - 1])}</div>`
      : `<div class="t">${esc(f.nome)}</div>
         <div class="muted small">${U.DOW_LONGO[U.dow(data)]}, ${U.dataBR(data)}${fer ? ` · <span style="color:var(--erro)">${esc(fer)}</span>` : ''}</div>`;
    const nomeDia = U.DOW_LONGO[U.dow(data)].toLowerCase();
    const p = UI.popover(ancora, `
      <div class="popover-cab">${cab}</div>
      <div class="popover-corpo">
        ${oc.length ? `<div class="stack" style="gap:6px">${oc.map((o) => `<div class="aviso ${o.sev}" style="padding:8px 10px">${ic(SEV_IC[o.sev])}<div class="small">${esc(o.msg)}</div></div>`).join('')}</div>` : ''}
        <div class="segmentado" data-tipo>${Object.entries(TIPOS).map(([k, t]) => `<button type="button" data-k="${k}" class="${st.tipo === k ? 'ativo' : ''}">${k === 'folga' ? 'Folga' : k === 'compensacao' ? 'Compens.' : t.nome}</button>`).join('')}</div>
        <div data-trab class="stack" style="gap:12px">
          <label class="campo"><span>Modelo de turno</span><select class="inp" data-turno>
            <option value="">Personalizado</option>${ativos.map((t) => `<option value="${t.id}" ${Number(st.turno_id) === t.id ? 'selected' : ''}>${esc(t.nome)} (${UI.faixa(t.blocos)})</option>`).join('')}</select></label>
          <div class="campo"><span>Horários <small class="muted" style="font-weight:400">· pode digitar 0730 ou 7h30</small></span><div data-blocos></div></div>
          <div class="resumo-turno" data-res></div>
        </div>
        <label class="campo"><span>Observação</span><input class="inp" data-obs value="${esc(st.obs)}" placeholder="Opcional"></label>
        ${varios ? '' : `<label class="campo"><span>Aplicar em</span><select class="inp" data-alvo>
          <option value="dia">Somente este dia</option>
          <option value="dow">Todas as ${nomeDia}s do período</option>
          <option value="semana">Seg a sex desta semana</option>
          <option value="uteis">Seg a sex de todo o período</option>
          <option value="linha">Todos os dias de ${esc(f.nome)} no período</option>
          <option value="equipe">Este dia para toda a equipe</option>
        </select><small data-alvo-dica class="muted"></small></label>`}
      </div>
      <div class="popover-rodape"><button class="btn perigo" data-limpar title="${varios ? 'Limpar os dias selecionados' : 'Limpar este dia'}">${ic('lixo')}</button><span class="spacer"></span>
        <button class="btn" data-cancelar>Cancelar</button><button class="btn primario" data-aplicar>${ic('check')} Aplicar${varios ? ` em ${chaves.length}` : ''}</button></div>`);

    const mostrarTrab = () => { p.$('[data-trab]').style.display = st.tipo === 'trabalho' ? '' : 'none'; };
    const res = () => { p.$('[data-res]').innerHTML = UI.resumoTurno(st.blocos); };
    const ed = UI.editorBlocos(p.$('[data-blocos]'), st.blocos, (b) => {
      st.blocos = b;
      const t = S.turno(st.turno_id);
      if (t && JSON.stringify(t.blocos) !== JSON.stringify(b)) { st.turno_id = ''; p.$('[data-turno]').value = ''; }
      res();
    });
    mostrarTrab(); res();

    const dicaAlvo = () => {
      const el = p.$('[data-alvo-dica]'); if (!el) return;
      const v = p.$('[data-alvo]').value;
      el.textContent = (v === 'uteis' || v === 'linha') && st.tipo === 'trabalho'
        ? 'Folgas, férias e afastamentos já marcados são mantidos.' : '';
    };
    p.$('[data-alvo]')?.addEventListener('change', dicaAlvo);
    p.$('[data-tipo]').addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      st.tipo = b.dataset.k;
      p.$$('[data-tipo] button').forEach((x) => x.classList.toggle('ativo', x === b));
      if (st.tipo === 'trabalho' && !st.blocos.length) {
        const t = S.turnos.find((x) => x.ativo);
        if (t) { st.turno_id = t.id; st.blocos = t.blocos; p.$('[data-turno]').value = t.id; ed.set(t.blocos); res(); }
      }
      mostrarTrab(); dicaAlvo();
    });
    p.$('[data-turno]').addEventListener('change', (ev) => {
      st.turno_id = ev.target.value;
      const t = S.turno(st.turno_id);
      if (t) { st.blocos = t.blocos.map((b) => [...b]); ed.set(st.blocos); res(); }
    });
    const fechar = () => { p.fechar(); limparSelecao(); };
    p.$('[data-cancelar]').addEventListener('click', fechar);
    p.$('[data-limpar]').addEventListener('click', () => {
      chaves.forEach((k) => { const [a, b] = k.split('|'); if (E.itens[a]) delete E.itens[a][b]; });
      fechar(); alterou();
    });
    p.$('[data-aplicar]').addEventListener('click', () => {
      // Confirma um horário que ainda esteja sendo digitado
      if (document.activeElement && document.activeElement.matches('[data-mask=hora]')) document.activeElement.blur();
      if (st.tipo === 'trabalho' && !ed.get().length) { UI.toast('Informe ao menos um período de trabalho.', 'erro'); return; }
      const novo = {
        tipo: st.tipo,
        turno_id: st.tipo === 'trabalho' && st.turno_id ? Number(st.turno_id) : null,
        blocos: st.tipo === 'trabalho' ? ed.get().map((b) => [...b]) : [],
        obs: p.$('[data-obs]').value.trim(),
      };
      let alvos = chaves;
      if (!varios) {
        const alvo = p.$('[data-alvo]').value;
        const util = (d) => U.dow(d) >= 1 && U.dow(d) <= 5;
        // Ao espalhar um turno, não apaga folgas/afastamentos já marcados
        const livre = (f2, d) => {
          const it = (E.itens[f2] || {})[d];
          return d === data && f2 === fid || novo.tipo !== 'trabalho' || !it || it.tipo === 'trabalho';
        };
        let ds = [data], fs = [fid];
        if (alvo === 'dow') ds = dias().filter((d) => U.dow(d) === U.dow(data));
        if (alvo === 'semana') ds = dias().filter((d) => U.segunda(d) === U.segunda(data) && util(d));
        if (alvo === 'uteis') ds = dias().filter(util);
        if (alvo === 'linha') ds = dias();
        if (alvo === 'equipe') fs = [...E.funcs];
        alvos = [];
        fs.forEach((f2) => ds.forEach((d) => { if (alvo === 'dia' || livre(f2, d)) alvos.push(`${f2}|${d}`); }));
      }
      alvos.forEach((k) => {
        const [a, b] = k.split('|');
        E.itens[a] ||= {};
        E.itens[a][b] = { ...novo, blocos: novo.blocos.map((x) => [...x]) };
      });
      fechar(); alterou();
      if (alvos.length > 1) UI.toast(`Aplicado em ${alvos.length} dias.`);
    });
  }

  // ------------------------------------------------------- ações de linha
  function menuLinha(btn, fid) {
    const f = S.func(fid);
    const outros = funcsObj().filter((x) => x.id !== fid);
    const p = UI.popover(btn, `
      <div class="popover-cab"><div class="t">${esc(f.nome)}</div><div class="muted small">Ações para a linha inteira</div></div>
      <div class="popover-corpo" style="gap:10px">
        ${outros.length ? `<label class="campo"><span>Copiar a escala de</span><div class="row"><select class="inp" data-de>${outros.map((o) => `<option value="${o.id}">${esc(o.nome)}</option>`).join('')}</select>
          <button class="btn" data-copiar>Copiar</button></div></label>` : ''}
        <a class="btn" href="#/funcionarios/${fid}">${ic('pessoa')} Ver histórico</a>
        <button class="btn" data-limpar-linha>${ic('x')} Limpar todos os dias</button>
        <button class="btn perigo" data-remover>${ic('lixo')} Remover da escala</button>
      </div>`, { largura: 300 });
    p.$('[data-copiar]')?.addEventListener('click', () => {
      const de = Number(p.$('[data-de]').value);
      E.itens[fid] = JSON.parse(JSON.stringify(E.itens[de] || {}));
      p.fechar(); alterou();
    });
    p.$('[data-limpar-linha]').addEventListener('click', () => { E.itens[fid] = {}; p.fechar(); alterou(); });
    p.$('[data-remover]').addEventListener('click', async () => {
      p.fechar();
      if (!(await UI.confirmar({ titulo: 'Remover da escala?', texto: `${esc(f.nome)} e os dias dela(e) nesta escala serão retirados quando você salvar. O histórico de outras escalas não muda.`, ok: 'Remover', perigo: true }))) return;
      E.funcs = E.funcs.filter((x) => x !== fid);
      delete E.itens[fid];
      alterou();
    });
  }

  async function recarregarContexto() {
    const r = await API.get(`/api/contexto?fids=${E.funcs.join(',')}&inicio=${E.escala.inicio}&fim=${E.escala.fim}&excluir=${E.id}`);
    E.contexto = r.contexto; E.sobreposicoes = r.sobreposicoes;
  }

  function adicionarFuncionario() {
    const disp = S.funcionarios.filter((f) => f.ativo && !E.funcs.includes(f.id));
    const m = UI.modal({
      titulo: 'Adicionar funcionários', sub: 'Eles entram com os dias em branco.',
      corpo: disp.length ? `<div class="lista-sel">${disp.map((f) => `<label><input type="checkbox" value="${f.id}" style="accent-color:var(--brand)"><div class="avatar">${U.iniciais(f.nome)}</div>
        <div><div class="pessoa-nome">${esc(f.nome)}</div><div class="pessoa-sub">${esc([f.cargo, f.loja].filter(Boolean).join(' · '))}</div></div></label>`).join('')}</div>`
        : '<div class="vazio">Todos os funcionários ativos já estão na escala.</div>',
      rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-ok ${disp.length ? '' : 'disabled'}>Adicionar</button>`,
    });
    m.$('[data-ok]').addEventListener('click', async () => {
      const ids = m.$$('input:checked').map((i) => Number(i.value));
      if (!ids.length) { m.fechar(); return; }
      E.funcs.push(...ids);
      try { await recarregarContexto(); } catch (e) { UI.toast(e.message, 'erro'); }
      m.fechar(); alterou();
    });
  }

  function detalhes() {
    const e = E.escala;
    const m = UI.modal({
      titulo: 'Detalhes da escala',
      corpo: `<div class="form-grade">
        <label class="campo inteiro"><span>Título</span><input class="inp" data-f="titulo" value="${esc(e.titulo)}"></label>
        <label class="campo inteiro"><span>Loja / setor</span><input class="inp" data-f="loja" value="${esc(e.loja || '')}"></label>
        <label class="campo"><span>Início</span>${UI.campoData(e.inicio, 'data-f="inicio"')}</label>
        <label class="campo"><span>Fim</span>${UI.campoData(e.fim, 'data-f="fim"')}</label>
        <label class="campo inteiro"><span>Observações</span><textarea class="inp" data-f="observacoes" rows="4">${esc(e.observacoes || '')}</textarea></label>
      </div><div class="aviso info" style="margin-top:14px">${ic('info')}<div>Ao encurtar o período, os dias que ficarem de fora são descartados quando você salvar.</div></div>`,
      rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-ok>Aplicar</button>',
    });
    m.$('[data-ok]').addEventListener('click', async () => {
      const v = (k) => m.$(`[data-f=${k}]`).value;
      const ini = U.lerData(v('inicio')), fimN = U.lerData(v('fim'));
      if (!ini || !fimN) { UI.toast('Data inválida. Use dd/mm/aaaa ou só os números (01012027).', 'erro'); return; }
      if (fimN < ini) { UI.toast('A data final é anterior à inicial.', 'erro'); return; }
      if (U.diffDias(ini, fimN) > 62) { UI.toast('O período máximo é de 9 semanas.', 'erro'); return; }
      Object.assign(E.escala, { titulo: v('titulo'), loja: v('loja'), inicio: ini, fim: fimN, observacoes: v('observacoes') });
      try { await recarregarContexto(); } catch (err) { UI.toast(err.message, 'erro'); }
      if (E.diaCob < E.escala.inicio || E.diaCob > E.escala.fim) E.diaCob = E.escala.inicio;
      m.fechar(); alterou();
    });
  }

  // ---------------------------------------------------------------- abas
  function desenharAbas() {
    const c = E.analise.contagem;
    E.main.querySelector('[data-abas]').innerHTML = [
      ['conformidade', 'escudo', 'Conformidade CLT', c.erro + c.alerta],
      ['cobertura', 'grafico', 'Cobertura por horário', null],
      ['totais', 'lista', 'Totais por funcionário', null],
      ['obs', 'editar', 'Observações', null],
    ].map(([k, i, n, cont]) => `<button data-aba-k="${k}" class="${E.aba === k ? 'ativo' : ''}">${ic(i)} ${n}${cont != null ? ` <span class="contador">${cont}</span>` : ''}</button>`).join('');
    const alvo = E.main.querySelector('[data-aba]');
    alvo.innerHTML = { conformidade: abaConformidade, cobertura: abaCobertura, totais: abaTotais, obs: abaObs }[E.aba]();
    if (E.aba === 'obs') {
      alvo.querySelector('textarea')?.addEventListener('input', (ev) => { E.escala.observacoes = ev.target.value; if (!E.sujo) { E.sujo = true; desenharTopoSemFoco(); } });
    }
  }

  function abaConformidade() {
    const nome = (fid) => (fid ? S.func(fid)?.nome : 'Equipe');
    const filtradas = E.analise.issues.filter((i) => E.filtroSev === 'todos' || i.sev === E.filtroSev);
    const grupos = {};
    filtradas.forEach((i) => (grupos[i.regra] ||= []).push(i));
    const ordem = Object.entries(grupos).sort(([, a], [, b]) => {
      const s = (l) => Math.min(...l.map((i) => ({ erro: 0, alerta: 1, info: 2 }[i.sev])));
      return s(a) - s(b) || b.length - a.length;
    });
    const c = E.analise.contagem;
    const topo = `<div class="row wrap" style="padding:14px 18px;border-bottom:1px solid var(--line-2)">
      <div class="segmentado" data-sevf>${[['todos', 'Tudo'], ['erro', `Violações (${c.erro})`], ['alerta', `Alertas (${c.alerta})`], ['info', `Informações (${c.info})`]]
        .map(([k, n]) => `<button data-k="${k}" class="${E.filtroSev === k ? 'ativo' : ''}">${n}</button>`).join('')}</div>
      <span class="spacer"></span><span class="muted small">Clique numa ocorrência para localizar o dia na grade.</span></div>`;
    const ok = !c.erro && !c.alerta
      ? `<div class="tudo-ok"><div class="sev-ic" style="background:var(--ok-50);color:var(--ok)">${ic('check')}</div>Nenhuma violação ou alerta. A escala está de acordo com as regras verificadas.</div>` : '';
    return topo + ok + (ordem.length ? ordem.map(([regra, lista]) => {
      const r = CLT.REGRAS[regra];
      const sev = lista.some((i) => i.sev === 'erro') ? 'erro' : lista.some((i) => i.sev === 'alerta') ? 'alerta' : 'info';
      return `<div class="regra-grupo ${E.abertos.has(regra) ? 'aberto' : ''}" data-regra="${regra}">
        <div class="regra-cab"><div class="sev-ic ${sev}">${ic(SEV_IC[sev])}</div>
          <div><div class="nome">${r.nome}</div><div class="base">${r.base}</div></div>
          <span class="selo ${sev}" style="margin-left:12px">${lista.length}</span>
          <span class="seta">${ic('seta')}</span></div>
        <div class="regra-itens"><div class="regra-texto">${r.texto}</div>
          ${lista.map((i) => `<div class="ocorrencia" data-ir="${i.fid || ''}|${i.data || ''}">
            <span class="sev-ic ${i.sev}" style="width:18px;height:18px;border-radius:5px">${ic(SEV_IC[i.sev])}</span>
            <span class="quem">${esc(nome(i.fid))}</span><span class="quando">${i.data ? `${U.DOW[U.dow(i.data)]} ${U.ddmm(i.data)}` : ''}</span><span>${esc(i.msg)}</span></div>`).join('')}
        </div></div>`;
    }).join('') : (ok ? '' : '<div class="vazio">Nada neste filtro.</div>'));
  }

  function abaCobertura() {
    const ds = dias();
    const d = E.diaCob;
    const cob = E.analise.cobertura[d] || { barras: [], buracos: [] };
    const chips = `<div class="dias-chips">${ds.map((x) => `<button class="dia-chip ${x === d ? 'ativo' : ''} ${U.dow(x) === 0 ? 'dom' : ''}" data-dia="${x}">${U.DOW[U.dow(x)]} ${U.ddmm(x)}</button>`).join('')}</div>`;
    if (!cob.barras.length) return chips + `<div class="vazio">${ic('pessoas')}<div>Ninguém trabalha neste dia.</div></div>`;
    const de = Math.floor(Math.min(...cob.barras.map((b) => b.iv[0][0])) / 60) * 60;
    const ate = Math.ceil(Math.max(...cob.barras.map((b) => b.iv[b.iv.length - 1][1])) / 60) * 60;
    const tot = ate - de;
    const pct = (m) => ((m - de) / tot) * 100;
    const horas = tot / 60;
    const marcas = [];
    for (let h = de; h <= ate; h += 60) marcas.push(`<span style="left:${pct(h)}%">${U.fmtMin(h).slice(0, 2)}h</span>`);
    const funcs = funcsObj();
    const linhas = funcs.map((f) => {
      const b = cob.barras.find((x) => x.fid === f.id);
      const it = (E.itens[f.id] || {})[d];
      if (!b) return `<div class="gantt-linha"><div class="gantt-nome muted">${esc(f.nome)}</div><div class="muted small">${it ? (TIPOS[it.tipo]?.nome || it.tipo) : 'Sem definição'}</div><div></div></div>`;
      const t = S.turno(it.turno_id);
      const cor = t ? t.cor : '#64748b';
      const barras = b.iv.map(([a, z]) => `<div class="gantt-barra" style="left:${pct(a)}%;width:${pct(z) - pct(a)}%;--c:${cor}" title="${U.fmtMin(a)}–${U.fmtMin(z)}"></div>`).join('');
      const pausas = b.iv.slice(1).map(([a], i) => `<div class="gantt-pausa" style="left:${pct(b.iv[i][1])}%;width:${pct(a) - pct(b.iv[i][1])}%" title="Pausa ${U.fmtMin(b.iv[i][1])}–${U.fmtMin(a)}"></div>`).join('');
      return `<div class="gantt-linha"><div class="gantt-nome">${esc(f.nome)}</div><div class="gantt-trilho" style="--h:${horas}">${barras}${pausas}</div>
        <div class="gantt-total">${U.dur(b.iv.reduce((s, [a, z]) => s + z - a, 0))}</div></div>`;
    }).join('');
    const faixas = CLT.contarPorFaixa(cob, de, ate, 15);
    const max = Math.max(1, ...faixas.map((x) => x.n));
    const dentro = (t) => cob.ini != null && t >= cob.ini && t < cob.fim;
    const hist = faixas.map((x) => `<div class="${x.n === 0 ? (dentro(x.t) ? 'zero' : 'fora') : ''}" style="height:${(x.n / max) * 100}%" title="${U.fmtMin(x.t)}: ${x.n} ${x.n === 1 ? 'pessoa' : 'pessoas'}"></div>`).join('');
    const pico = Math.max(...faixas.map((x) => x.n));
    const menor = Math.min(...faixas.filter((x) => dentro(x.t)).map((x) => x.n));
    return chips + `<div class="gantt">
      <div class="gantt-eixo"><div></div><div class="marcas">${marcas.join('')}</div><div></div></div>
      ${linhas}
      <div class="gantt-sep"></div>
      <div class="gantt-linha"><div class="gantt-nome muted">Pessoas trabalhando</div><div class="gantt-cob">${hist}</div><div class="gantt-total">pico ${pico}</div></div>
      <div class="row wrap" style="margin-top:14px;gap:8px">
        <span class="selo info sem-ponto">Funcionamento ${U.fmtMin(cob.ini)}–${U.fmtMin(cob.fim)}</span>
        <span class="selo sem-ponto">Mínimo no horário: ${menor}</span>
        ${cob.buracos.map(([a, z]) => `<span class="selo erro">Sem ninguém ${U.fmtMin(a)}–${U.fmtMin(z)}</span>`).join('')}
      </div></div>`;
  }

  function abaTotais() {
    const funcs = funcsObj();
    const ds = dias();
    const semanas = [...new Set(ds.map(U.segunda))];
    return `<table class="tabela"><thead><tr><th>Funcionário</th>${semanas.map((s, i) => `<th>S${i + 1} · ${U.ddmm(s)}</th>`).join('')}<th>Dias trab.</th><th>Folgas</th><th>Domingos trab.</th><th class="right">Total</th></tr></thead><tbody>
      ${funcs.map((f) => {
        const pf = E.analise.porFunc[f.id];
        const contrato = Number(f.jornada_semanal || 44) * 60;
        return `<tr><td><div class="pessoa"><div class="avatar">${U.iniciais(f.nome)}</div><div><div class="pessoa-nome">${esc(f.nome)}</div><div class="pessoa-sub">${U.dur(contrato)}/sem. contratadas</div></div></div></td>
          ${pf.semanas.map((s) => `<td><div class="num" style="font-weight:600;${s.min > contrato ? 'color:var(--erro)' : ''}">${U.dur(s.min)}${s.completa ? '' : ' <span class="faint" title="Semana incompleta">*</span>'}</div>
            <div class="barra-horas"><span class="${s.min > contrato ? 'acima' : ''}" style="width:${Math.min(100, (s.min / contrato) * 100)}%"></span></div></td>`).join('')}
          <td class="num">${pf.diasTrab}</td><td class="num">${pf.folgas}</td><td class="num">${pf.domingosTrab}</td><td class="right num" style="font-weight:600">${U.dur(pf.totalMin)}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  function abaObs() {
    return `<div class="card-corpo"><textarea class="inp" rows="6" ${bloqueada() ? 'disabled' : ''} placeholder="Combinados, premissas, pendências com o RH…">${esc(E.escala.observacoes || '')}</textarea></div>`;
  }

  function cliqueAba(ev) {
    const sf = ev.target.closest('[data-sevf] button');
    if (sf) { E.filtroSev = sf.dataset.k; desenharAbas(); return; }
    const oc = ev.target.closest('[data-ir]');
    if (oc) {
      const [fid, data] = oc.dataset.ir.split('|');
      if (data) { E.diaCob = data; }
      const td = fid && E.main.querySelector(`td.cel[data-f="${fid}"][data-d="${data}"]`);
      if (td) {
        td.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        td.classList.add('sel');
        setTimeout(() => td.classList.remove('sel'), 1600);
      } else if (data) { E.aba = 'cobertura'; desenharAbas(); }
      return;
    }
    const cab = ev.target.closest('.regra-cab');
    if (cab) {
      const g = cab.parentElement, r = g.dataset.regra;
      g.classList.toggle('aberto');
      g.classList.contains('aberto') ? E.abertos.add(r) : E.abertos.delete(r);
      return;
    }
    const dia = ev.target.closest('[data-dia]');
    if (dia) { E.diaCob = dia.dataset.dia; desenharAbas(); }
  }

  // -------------------------------------------------------- persistência
  function payload(descricao) {
    const itens = [];
    for (const fid of E.funcs) {
      for (const [data, it] of Object.entries(E.itens[fid] || {})) {
        if (data < E.escala.inicio || data > E.escala.fim) continue;
        itens.push({ funcionario_id: fid, data, tipo: it.tipo, turno_id: it.turno_id || null, blocos: it.blocos || [], obs: it.obs || '' });
      }
    }
    return {
      titulo: E.escala.titulo, loja: E.escala.loja, inicio: E.escala.inicio, fim: E.escala.fim, observacoes: E.escala.observacoes,
      funcionarios: E.funcs, itens, descricao_versao: descricao,
      resumo: { erros: E.analise.contagem.erro, alertas: E.analise.contagem.alerta },
    };
  }

  async function salvar(descricao = 'Alteração', silencioso = false) {
    if (!E.escala.titulo.trim()) { UI.toast('Informe o título da escala.', 'erro'); return false; }
    try {
      await API.put(`/api/escalas/${E.id}`, payload(descricao));
      E.sujo = false;
      desenharTopo();
      if (!silencioso) UI.toast('Escala salva. Versão registrada no histórico.');
      return true;
    } catch (e) { UI.toast(e.message, 'erro'); return false; }
  }

  async function publicar() {
    const c = E.analise.contagem;
    const texto = c.erro
      ? `<b style="color:var(--erro)">A escala tem ${c.erro} ${c.erro === 1 ? 'violação' : 'violações'} da CLT.</b> Publicar assim expõe a empresa a passivo trabalhista. Deseja publicar mesmo assim?`
      : `Depois de publicada, a escala fica travada para edição e passa a valer no histórico dos funcionários.${c.alerta ? ` Ainda há ${c.alerta} ${c.alerta === 1 ? 'alerta' : 'alertas'} para conferir.` : ''}`;
    if (!(await UI.confirmar({ titulo: 'Publicar escala?', texto, ok: c.erro ? 'Publicar mesmo assim' : 'Publicar', perigo: !!c.erro }))) return;
    if (E.sujo && !(await salvar('Alteração antes da publicação', true))) return;
    try {
      await API.post(`/api/escalas/${E.id}/status`, { status: 'publicada' });
      E.escala.status = 'publicada';
      UI.toast('Escala publicada.');
      desenharTudo();
    } catch (e) { UI.toast(e.message, 'erro'); }
  }

  async function reabrir() {
    if (!(await UI.confirmar({ titulo: 'Reabrir para edição?', texto: 'A escala volta a ser rascunho. A versão publicada continua guardada no histórico de versões.', ok: 'Reabrir' }))) return;
    try {
      await API.post(`/api/escalas/${E.id}/status`, { status: 'rascunho' });
      E.escala.status = 'rascunho';
      UI.toast('Escala reaberta.');
      desenharTudo();
    } catch (e) { UI.toast(e.message, 'erro'); }
  }

  async function excluir() {
    if (!(await UI.confirmar({ titulo: 'Excluir escala?', texto: `“${esc(E.escala.titulo)}” sai da lista e deixa de contar no histórico dos funcionários. Os dados ficam guardados no banco e podem ser recuperados pelo administrador.`, ok: 'Excluir', perigo: true }))) return;
    try {
      await API.del(`/api/escalas/${E.id}`);
      E.sujo = false;
      UI.toast('Escala excluída.');
      location.hash = '#/escalas';
    } catch (e) { UI.toast(e.message, 'erro'); }
  }

  function duplicar() {
    const n = U.diffDias(E.escala.inicio, E.escala.fim) + 1;
    const sugestao = U.addDias(E.escala.inicio, Math.ceil(n / 7) * 7);
    const m = UI.modal({
      titulo: 'Duplicar escala', sub: 'Cria um rascunho com o mesmo padrão em outro período.',
      corpo: `<div class="form-grade">
        <label class="campo inteiro"><span>Título</span><input class="inp" data-t value="${esc(E.escala.titulo)} (cópia)"></label>
        <label class="campo"><span>Novo início</span>${UI.campoData(sugestao, 'data-i')}</label>
        <div class="campo"><span>Duração</span><div class="muted" style="padding-top:8px">${n} dias</div></div>
      </div>${E.sujo ? `<div class="aviso alerta" style="margin-top:14px">${ic('alerta')}<div>Há alterações não salvas: a cópia usa a última versão salva.</div></div>` : ''}`,
      rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-ok>Duplicar</button>',
    });
    m.$('[data-ok]').addEventListener('click', async () => {
      const inicio = U.lerData(m.$('[data-i]').value);
      if (!inicio) { UI.toast('Data de início inválida. Use dd/mm/aaaa.', 'erro'); return; }
      try {
        const r = await API.post(`/api/escalas/${E.id}/duplicar`, { titulo: m.$('[data-t]').value, inicio });
        m.fechar();
        E.sujo = false;
        UI.toast('Cópia criada.');
        location.hash = `#/escalas/${r.id}`;
      } catch (e) { UI.toast(e.message, 'erro'); }
    });
  }

  async function versoes() {
    const lista = await API.get(`/api/escalas/${E.id}/versoes`);
    const m = UI.modal({
      titulo: 'Versões salvas', sub: 'Cada salvamento, publicação e reabertura gera uma versão.', largo: false,
      corpo: `<div class="lista-sel" style="max-height:420px">${lista.map((v, i) => `<label style="cursor:default">
        <div class="ic-log" style="width:30px;height:30px;border-radius:8px;background:var(--brand-50);color:var(--brand);display:grid;place-items:center">${ic('historico')}</div>
        <div><div class="pessoa-nome">${esc(v.resumo || 'Versão')}${i === 0 ? ' <span class="selo info sem-ponto">atual</span>' : ''}</div><div class="pessoa-sub num">${U.quando(v.criado_em)}</div></div>
        <span class="spacer"></span>${i > 0 && !bloqueada() ? `<button class="btn pequeno" data-v="${v.id}">${ic('restaurar')} Restaurar</button>` : ''}</label>`).join('')}</div>
        ${bloqueada() ? `<div class="aviso info" style="margin-top:12px">${ic('info')}<div>Para restaurar uma versão, reabra a escala para edição.</div></div>` : ''}`,
    });
    m.el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-v]'); if (!b) return;
      try {
        const v = await API.get(`/api/versoes/${b.dataset.v}`);
        const s = v.snapshot;
        if (!s || !s.itens) { UI.toast('Esta versão não tem conteúdo para restaurar.', 'erro'); return; }
        const itens = {};
        s.itens.forEach((it) => { (itens[it.funcionario_id] ||= {})[it.data] = { tipo: it.tipo, turno_id: it.turno_id, blocos: it.blocos, obs: it.obs }; });
        Object.assign(E.escala, { titulo: s.escala.titulo, loja: s.escala.loja, inicio: s.escala.inicio, fim: s.escala.fim, observacoes: s.escala.observacoes });
        E.funcs = s.funcionarios.filter((id) => S.func(id));
        E.itens = itens;
        await recarregarContexto();
        m.fechar();
        alterou();
        UI.toast(`Versão de ${U.quando(v.criado_em)} carregada. Salve para confirmar.`);
      } catch (e) { UI.toast(e.message, 'erro'); }
    });
  }

  function exportarCSV() {
    const linhas = [['Funcionário', 'Cargo', 'Data', 'Dia', 'Situação', 'Turno', 'Entrada 1', 'Saída 1', 'Entrada 2', 'Saída 2', 'Entrada 3', 'Saída 3', 'Horas', 'Observação']];
    for (const f of funcsObj()) {
      for (const d of dias()) {
        const it = (E.itens[f.id] || {})[d];
        const bl = it?.tipo === 'trabalho' ? it.blocos : [];
        const hs = [];
        for (let i = 0; i < 3; i++) hs.push(bl[i]?.[0] || '', bl[i]?.[1] || '');
        linhas.push([f.nome, f.cargo || '', U.dataBR(d), U.DOW_LONGO[U.dow(d)], it ? TIPOS[it.tipo]?.nome || it.tipo : 'Sem definição',
          S.turno(it?.turno_id)?.nome || '', ...hs, bl.length ? U.dur(U.resumoBlocos(bl).trabalhado) : '', it?.obs || '']);
      }
    }
    const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    U.baixar(`${E.escala.titulo.replace(/[^\w\-À-ú ]+/g, '').trim() || 'escala'}.csv`, csv);
  }

  const temAlteracoes = () => !!(E && E.sujo);

  return { lista, editor, temAlteracoes, descartar: () => { if (E) E.sujo = false; } };
})();
