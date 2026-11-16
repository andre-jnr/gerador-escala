/* Telas: painel, funcionários (lista, cadastro, histórico), turnos, regras, feriados e atividades. */
'use strict';

const Telas = (() => {
  const { ic } = UI;
  const esc = U.esc;

  const cabecalho = (titulo, sub = '', acoes = '', trilha = '') => `
    <div class="cabecalho">
      <div>${trilha ? `<div class="trilha">${trilha}</div>` : ''}<h1>${titulo}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
      <div class="acoes">${acoes}</div>
    </div>`;

  const seloStatus = (s) => `<span class="selo ${s}">${s === 'publicada' ? 'Publicada' : 'Rascunho'}</span>`;

  /** Analisa uma escala carregada da API e devolve o resultado do motor CLT. */
  function analisarEscala(dados) {
    const e = dados.escala;
    const funcionarios = dados.funcionarios.map((id) => S.func(id)).filter(Boolean);
    const itens = {};
    dados.itens.forEach((it) => { (itens[it.funcionario_id] ||= {})[it.data] = it; });
    return {
      funcionarios, itens,
      analise: CLT.analisar({
        dias: U.intervalo(e.inicio, e.fim), funcionarios, itens, contexto: dados.contexto,
        sobreposicoes: dados.sobreposicoes, feriados: S.feriadosMapa(), config: S.config,
      }),
    };
  }

  // ------------------------------------------------------------ painel
  async function painel(main) {
    const [escalas, log] = await Promise.all([API.get('/api/escalas'), API.get('/api/log?limite=8')]);
    const ativos = S.funcionarios.filter((f) => f.ativo);
    const vigentes = escalas.filter((e) => e.inicio <= S.hoje && e.fim >= S.hoje)
      .sort((a, b) => (b.status === 'publicada') - (a.status === 'publicada'));
    const vigente = vigentes[0];
    const proximos = S.feriados.filter((f) => f.data >= S.hoje).slice(0, 4);

    let blocoHoje = `<div class="vazio">${ic('calendario')}<div>Nenhuma escala cobre o dia de hoje.</div>
      <div style="margin-top:12px"><a class="btn primario" href="#/escalas/nova">${ic('mais')} Nova escala</a></div></div>`;
    let conformidade = '';
    if (vigente) {
      const dados = await API.get(`/api/escalas/${vigente.id}`);
      const { funcionarios, itens, analise } = analisarEscala(dados);
      const c = analise.contagem;
      conformidade = `
        <div class="kpi card ${c.erro ? 'erro' : 'ok'}"><div class="rot">${ic('escudo')} Conformidade da escala vigente</div>
          <div class="val">${c.erro ? `${c.erro} ${c.erro === 1 ? 'violação' : 'violações'}` : 'Em dia'}</div>
          <div class="det">${c.alerta} ${c.alerta === 1 ? 'alerta' : 'alertas'} · ${esc(vigente.titulo)}</div></div>`;
      const linhas = funcionarios.map((f) => {
        const it = (itens[f.id] || {})[S.hoje];
        const det = it && it.tipo === 'trabalho' ? it.blocos.map(([a, b]) => `${a}–${b}`).join(' · ') : '';
        return `<tr class="clicavel" data-href="#/funcionarios/${f.id}">
          <td><div class="pessoa"><div class="avatar">${U.iniciais(f.nome)}</div><div><div class="pessoa-nome">${esc(f.nome)}</div><div class="pessoa-sub">${esc(f.cargo || '')}</div></div></div></td>
          <td style="width:150px">${UI.celula(it, { compacto: true })}</td>
          <td class="muted small num">${det}</td></tr>`;
      }).join('');
      blocoHoje = `<table class="tabela"><tbody>${linhas}</tbody></table>`;
    }

    main.innerHTML = `
      ${cabecalho('Painel', `${U.DOW_LONGO[U.dow(S.hoje)]}, ${U.dataBR(S.hoje)}`,
        `<a class="btn" href="#/funcionarios">${ic('pessoas')} Funcionários</a><a class="btn primario" href="#/escalas/nova">${ic('mais')} Nova escala</a>`)}
      <div class="kpis">
        <div class="kpi card"><div class="rot">${ic('pessoas')} Funcionários ativos</div><div class="val">${ativos.length}</div>
          <div class="det">${S.lojas().length} ${S.lojas().length === 1 ? 'loja' : 'lojas'}</div></div>
        <div class="kpi card"><div class="rot">${ic('publicar')} Escalas publicadas</div><div class="val">${escalas.filter((e) => e.status === 'publicada').length}</div>
          <div class="det">${escalas.filter((e) => e.status !== 'publicada').length} em rascunho</div></div>
        <div class="kpi card"><div class="rot">${ic('relogio')} Modelos de turno</div><div class="val">${S.turnos.filter((t) => t.ativo).length}</div>
          <div class="det">prontos para usar</div></div>
        ${conformidade}
      </div>
      <div class="grade-2">
        <div class="card">
          <div class="card-cab"><h2>Quem trabalha hoje</h2>
            ${vigente ? `<span class="muted small">${esc(vigente.titulo)}</span><div class="acoes"><a class="btn pequeno" href="#/escalas/${vigente.id}">Abrir escala ${ic('seta')}</a></div>` : ''}</div>
          <div class="card-corpo compacto">${blocoHoje}</div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-cab"><h2>Próximos feriados</h2><div class="acoes"><a class="btn pequeno fantasma" href="#/feriados">Ver todos</a></div></div>
            <div class="card-corpo compacto">${proximos.length ? proximos.map((f) => `
              <div class="linha-log"><div class="ic-log">${ic('calendario')}</div>
                <div><div class="o-que">${esc(f.nome)}</div><div class="muted small">${esc(f.abrangencia)}</div></div>
                <div class="quando">${U.DOW[U.dow(f.data)]}, ${U.dataBR(f.data)}</div></div>`).join('') : '<div class="vazio">Nenhum feriado cadastrado à frente.</div>'}
            </div>
          </div>
          <div class="card">
            <div class="card-cab"><h2>Atividades recentes</h2><div class="acoes"><a class="btn pequeno fantasma" href="#/historico">Ver tudo</a></div></div>
            <div class="card-corpo compacto">${linhasLog(log)}</div>
          </div>
        </div>
      </div>`;
    main.querySelectorAll('[data-href]').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
  }

  // ------------------------------------------------------- atividades
  const ICONE_ENTIDADE = { escala: 'escala', funcionario: 'pessoa', turno: 'relogio', feriado: 'calendario', config: 'balanca' };
  const NOME_ENTIDADE = { escala: 'Escala', funcionario: 'Funcionário', turno: 'Turno', feriado: 'Feriado', config: 'Configuração' };
  function linhasLog(log) {
    if (!log.length) return '<div class="vazio">Nada registrado ainda.</div>';
    return log.map((l) => {
      let alvo = esc(l.detalhe || '');
      if (l.entidade === 'escala' && l.acao !== 'Exclusão') alvo = `<a href="#/escalas/${l.entidade_id}">${alvo}</a>`;
      if (l.entidade === 'funcionario') alvo = `<a href="#/funcionarios/${l.entidade_id}">${alvo}</a>`;
      return `<div class="linha-log"><div class="ic-log">${ic(ICONE_ENTIDADE[l.entidade] || 'historico')}</div>
        <div><div class="o-que">${esc(l.acao)} · <span class="muted">${NOME_ENTIDADE[l.entidade] || l.entidade}</span></div><div class="small">${alvo}</div></div>
        <div class="quando">${U.quando(l.quando)}</div></div>`;
    }).join('');
  }

  async function historico(main) {
    const log = await API.get('/api/log?limite=300');
    main.innerHTML = `${cabecalho('Atividades', 'Tudo o que foi criado, alterado, publicado ou excluído no sistema.')}
      <div class="card"><div class="card-corpo compacto">${linhasLog(log)}</div></div>`;
  }

  // ------------------------------------------------------ funcionários
  let filtroFunc = { busca: '', loja: '', status: 'ativos' };

  function funcionarios(main) {
    const lojas = S.lojas();
    main.innerHTML = `
      ${cabecalho('Funcionários', 'Cadastro usado nas escalas. O histórico de cada pessoa fica guardado mesmo após inativação.',
        `<button class="btn primario" data-novo>${ic('mais')} Novo funcionário</button>`)}
      <div class="card">
        <div class="card-cab">
          <div class="busca">${ic('busca')}<input class="inp" placeholder="Buscar por nome, cargo ou matrícula" data-busca value="${esc(filtroFunc.busca)}"></div>
          <select class="inp" style="width:200px" data-loja><option value="">Todas as lojas</option>
            ${lojas.map((l) => `<option ${l === filtroFunc.loja ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
          <div class="acoes"><div class="segmentado" data-status>
            ${['ativos', 'inativos', 'todos'].map((s) => `<button data-s="${s}" class="${filtroFunc.status === s ? 'ativo' : ''}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
          </div></div>
        </div>
        <div class="card-corpo compacto" data-lista></div>
      </div>`;

    const lista = main.querySelector('[data-lista]');
    const desenhar = () => {
      const q = filtroFunc.busca.toLowerCase();
      const fs = S.funcionarios.filter((f) =>
        (filtroFunc.status === 'todos' || (filtroFunc.status === 'ativos' ? f.ativo : !f.ativo)) &&
        (!filtroFunc.loja || f.loja === filtroFunc.loja) &&
        (!q || [f.nome, f.cargo, f.matricula].some((v) => (v || '').toLowerCase().includes(q))));
      if (!fs.length) {
        lista.innerHTML = `<div class="vazio">${ic('pessoas')}<div>Nenhum funcionário encontrado.</div></div>`;
        return;
      }
      lista.innerHTML = `<table class="tabela"><thead><tr><th>Nome</th><th>Matrícula</th><th>Loja</th><th>Jornada</th><th>Admissão</th><th>Situação</th><th></th></tr></thead><tbody>
        ${fs.map((f) => `<tr class="clicavel ${f.ativo ? '' : 'inativo'}" data-id="${f.id}">
          <td><div class="pessoa"><div class="avatar">${U.iniciais(f.nome)}</div><div><div class="pessoa-nome">${esc(f.nome)}</div><div class="pessoa-sub">${esc(f.cargo || '—')}</div></div></div></td>
          <td class="num">${esc(f.matricula || '—')}</td>
          <td>${esc(f.loja || '—')}</td>
          <td class="num">${U.dur(Number(f.jornada_semanal || 44) * 60)}/sem.</td>
          <td class="num">${f.admissao ? U.dataBR(f.admissao) : '—'}</td>
          <td>${f.ativo ? '<span class="selo ok">Ativo</span>' : '<span class="selo">Inativo</span>'}</td>
          <td class="right"><button class="btn fantasma pequeno" data-editar="${f.id}">${ic('editar')} Editar</button></td>
        </tr>`).join('')}</tbody></table>`;
    };
    desenhar();

    main.querySelector('[data-busca]').addEventListener('input', U.debounce((e) => { filtroFunc.busca = e.target.value; desenhar(); }, 120));
    main.querySelector('[data-loja]').addEventListener('change', (e) => { filtroFunc.loja = e.target.value; desenhar(); });
    main.querySelector('[data-status]').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      filtroFunc.status = b.dataset.s;
      main.querySelectorAll('[data-status] button').forEach((x) => x.classList.toggle('ativo', x === b));
      desenhar();
    });
    main.querySelector('[data-novo]').addEventListener('click', () => formFuncionario(null, () => funcionarios(main)));
    lista.addEventListener('click', (e) => {
      const ed = e.target.closest('[data-editar]');
      if (ed) { e.stopPropagation(); formFuncionario(S.func(ed.dataset.editar), () => funcionarios(main)); return; }
      const tr = e.target.closest('tr[data-id]');
      if (tr) location.hash = `#/funcionarios/${tr.dataset.id}`;
    });
  }

  function formFuncionario(f, depois) {
    const novo = !f;
    f = f || { sexo: 'F', jornada_semanal: 44, loja: S.lojas()[0] || '' };
    const m = UI.modal({
      titulo: novo ? 'Novo funcionário' : 'Editar funcionário',
      sub: novo ? 'Os dados abaixo entram nas validações da escala.' : esc(f.nome),
      corpo: `<form class="form-grade" id="form-func" autocomplete="off">
        <label class="campo inteiro"><span>Nome completo *</span><input class="inp" name="nome" required value="${esc(f.nome || '')}"></label>
        <label class="campo"><span>Cargo</span><input class="inp" name="cargo" list="dl-cargos" value="${esc(f.cargo || '')}" placeholder="Ex.: Operadora de caixa"></label>
        <label class="campo"><span>Matrícula</span><input class="inp" name="matricula" value="${esc(f.matricula || '')}"></label>
        <label class="campo"><span>Loja / setor</span><input class="inp" name="loja" list="dl-lojas" value="${esc(f.loja || '')}"></label>
        <label class="campo"><span>Data de admissão</span>${UI.campoData(f.admissao || '', 'name="admissao"')}
          <small>Pode digitar só os números: 01012027.</small></label>
        <label class="campo"><span>Jornada semanal (horas)</span>${UI.campoNumero(f.jornada_semanal ?? 44, 'name="jornada_semanal"')}
          <small>Até 44h (CF art. 7º, XIII). Ex.: 44, 40 ou 37,5.</small></label>
        <label class="campo"><span>Sexo</span><select class="inp" name="sexo">
          <option value="F" ${f.sexo === 'F' ? 'selected' : ''}>Feminino</option><option value="M" ${f.sexo === 'M' ? 'selected' : ''}>Masculino</option></select>
          <small>Usado no revezamento dominical (CLT art. 386).</small></label>
        <label class="chk inteiro" style="align-items:flex-start"><input type="checkbox" name="compensacao" value="1" ${Number(f.compensacao) ? 'checked' : ''} style="margin-top:2px">
          <span><span class="pessoa-nome">Tem acordo de compensação de jornada</span><br>
          <small class="muted">CLT art. 59, § 2º. Permite dias de até 10h para não trabalhar no sábado (ex.: administrativo 5x2). Sem o acordo, dia acima de 8h é hora extra.</small></span></label>
        <label class="campo inteiro"><span>Observações</span><textarea class="inp" name="observacoes">${esc(f.observacoes || '')}</textarea></label>
        <datalist id="dl-cargos">${S.cargos().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <datalist id="dl-lojas">${S.lojas().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      </form>`,
      rodape: `${novo ? '' : `<button class="btn ${f.ativo ? 'perigo' : ''}" data-ativo>${f.ativo ? 'Inativar' : 'Reativar'}</button><span class="spacer"></span>`}
        <button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-salvar>${ic('check')} Salvar</button>`,
    });
    const salvar = async () => {
      const dados = Object.fromEntries(new FormData(m.$('#form-func')).entries());
      if (!dados.nome.trim()) { UI.toast('Informe o nome.', 'erro'); return; }
      const jornada = U.lerNumero(dados.jornada_semanal);
      if (jornada == null || jornada <= 0 || jornada > 44) { UI.toast('Jornada semanal deve ficar entre 1 e 44 horas.', 'erro'); return; }
      dados.jornada_semanal = jornada;
      dados.compensacao = dados.compensacao ? 1 : 0;
      if (dados.admissao) {
        const iso = U.lerData(dados.admissao);
        if (!iso) { UI.toast('Data de admissão inválida. Use dd/mm/aaaa.', 'erro'); return; }
        dados.admissao = iso;
      }
      try {
        const r = novo ? await API.post('/api/funcionarios', dados) : await API.put(`/api/funcionarios/${f.id}`, dados);
        await S.carregar();
        m.fechar();
        UI.toast(novo ? `${r.nome} cadastrado(a).` : 'Alterações salvas.');
        depois && depois(r);
      } catch (e) { UI.toast(e.message, 'erro'); }
    };
    m.$('[data-salvar]').addEventListener('click', salvar);
    m.$('#form-func').addEventListener('submit', (e) => { e.preventDefault(); salvar(); });
    m.$('[data-ativo]')?.addEventListener('click', async () => {
      if (f.ativo && !(await UI.confirmar({
        titulo: 'Inativar funcionário?', ok: 'Inativar', perigo: true,
        texto: `${esc(f.nome)} deixa de aparecer para novas escalas. O histórico continua guardado e é possível reativar depois.`,
      }))) return;
      try {
        await API.put(`/api/funcionarios/${f.id}`, { ativo: f.ativo ? 0 : 1 });
        await S.carregar();
        m.fechar();
        UI.toast(f.ativo ? 'Funcionário inativado.' : 'Funcionário reativado.');
        depois && depois();
      } catch (e) { UI.toast(e.message, 'erro'); }
    });
  }

  async function funcionario(main, id) {
    const h = await API.get(`/api/funcionarios/${id}/historico`);
    const f = h.funcionario;
    const porData = Object.fromEntries(h.itens.map((i) => [i.data, i]));
    const semanas = [...new Set(h.itens.map((i) => U.segunda(i.data)))].sort().reverse();

    const minDia = (i) => (CLT.ehTrabalho(i) ? U.resumoBlocos(i.blocos).trabalhado : 0);
    const segAtual = U.segunda(S.hoje);
    const horasSemana = h.itens.filter((i) => U.segunda(i.data) === segAtual).reduce((s, i) => s + minDia(i), 0);
    const domingos = h.itens.filter((i) => U.dow(i.data) === 0);
    const domTrab = domingos.filter((i) => CLT.ehTrabalho(i));
    const ultDomFolga = domingos.filter((i) => !CLT.ehTrabalho(i) && i.data <= S.hoje).pop();
    const proxDomFolga = domingos.find((i) => !CLT.ehTrabalho(i) && i.data > S.hoje);

    const contrato = Number(f.jornada_semanal || 44) * 60;
    const linhasSemana = semanas.map((seg) => {
      let tot = 0;
      const cels = [0, 1, 2, 3, 4, 5, 6].map((n) => {
        const d = U.addDias(seg, n);
        const it = porData[d];
        tot += it ? minDia(it) : 0;
        return it ? `<div title="${esc(it.escala_titulo)}">${UI.celula(it, { compacto: true })}</div>` : '<div class="nada"></div>';
      }).join('');
      const fonte = [...new Set([0, 1, 2, 3, 4, 5, 6].map((n) => porData[U.addDias(seg, n)]).filter(Boolean).map((i) => i.escala_id))];
      return `<div class="semana-hist">
        <div class="rot"><span>${U.ddmm(seg)} – ${U.ddmm(U.addDias(seg, 6))}</span>
          <span class="small">${fonte.map((eid) => `<a href="#/escalas/${eid}">ver escala</a>`).slice(0, 1).join('')}</span></div>
        ${cels}
        <div class="tot" style="color:${tot > contrato ? 'var(--erro)' : 'inherit'}">${U.dur(tot)}</div>
      </div>`;
    }).join('');

    main.innerHTML = `
      <div class="trilha"><a href="#/funcionarios">Funcionários</a> / ${esc(f.nome)}</div>
      <div class="cabecalho">
        <div class="perfil"><div class="avatar g">${U.iniciais(f.nome)}</div>
          <div><h1>${esc(f.nome)} ${f.ativo ? '' : '<span class="selo">Inativo</span>'}</h1>
          <div class="sub">${[f.cargo, f.loja, f.matricula && `Matrícula ${f.matricula}`, `${U.dur(contrato)} semanais`, Number(f.compensacao) && 'Acordo de compensação', f.admissao && `Admissão ${U.dataBR(f.admissao)}`].filter(Boolean).map(esc).join(' · ')}</div></div></div>
        <div class="acoes"><button class="btn" data-editar>${ic('editar')} Editar cadastro</button></div>
      </div>
      <div class="kpis">
        <div class="kpi card"><div class="rot">${ic('escala')} Escalas</div><div class="val">${h.escalas.length}</div><div class="det">${h.escalas.filter((e) => e.status === 'publicada').length} publicadas</div></div>
        <div class="kpi card"><div class="rot">${ic('relogio')} Horas escaladas nesta semana</div><div class="val" style="${horasSemana > contrato ? 'color:var(--erro)' : ''}">${U.dur(horasSemana)}</div><div class="det">${U.ddmm(segAtual)} a ${U.ddmm(U.addDias(segAtual, 6))} · contrato ${U.dur(contrato)}</div></div>
        <div class="kpi card"><div class="rot">${ic('calendario')} Domingos trabalhados</div><div class="val">${domTrab.length}<span class="muted" style="font-size:15px"> / ${domingos.length}</span></div><div class="det">em todo o histórico</div></div>
        <div class="kpi card"><div class="rot">${ic('check')} Domingo de folga</div><div class="val" style="font-size:20px">${ultDomFolga ? U.dataBR(ultDomFolga.data) : '—'}</div>
          <div class="det">${proxDomFolga ? `próximo: ${U.dataBR(proxDomFolga.data)}` : 'nenhum futuro escalado'}</div></div>
      </div>
      <div class="card" style="margin-bottom:18px">
        <div class="card-cab"><h2>Histórico de escala</h2><span class="muted small">semana a semana; quando há mais de uma escala no mesmo dia, vale a publicada</span></div>
        <div class="card-corpo compacto">
          ${semanas.length ? `<div class="semana-hist cab"><div>Semana</div>${[1, 2, 3, 4, 5, 6, 0].map((d) => `<div>${U.DOW[d]}</div>`).join('')}<div class="right">Horas</div></div>${linhasSemana}`
            : `<div class="vazio">${ic('escala')}<div>Ainda não participou de nenhuma escala.</div></div>`}
        </div>
      </div>
      <div class="grade-2">
        <div class="card"><div class="card-cab"><h2>Escalas em que aparece</h2></div>
          <div class="card-corpo compacto">${h.escalas.length ? `<table class="tabela"><tbody>${h.escalas.map((e) => `
            <tr class="clicavel" data-href="#/escalas/${e.id}"><td><div class="pessoa-nome">${esc(e.titulo)}</div><div class="pessoa-sub">${esc(e.loja || '')}</div></td>
            <td class="num muted">${U.periodo(e.inicio, e.fim)}</td><td class="right">${seloStatus(e.status)}</td></tr>`).join('')}</tbody></table>`
            : '<div class="vazio">Nenhuma.</div>'}</div></div>
        <div class="card"><div class="card-cab"><h2>Alterações do cadastro</h2></div>
          <div class="card-corpo compacto">${linhasLog(h.log)}</div></div>
      </div>`;
    main.querySelector('[data-editar]').addEventListener('click', () => formFuncionario(S.func(f.id), () => funcionario(main, id)));
    main.querySelectorAll('[data-href]').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
  }

  // ------------------------------------------------------------ turnos
  function verificarTurno(blocos) {
    if (!blocos.length) return [];
    const dia = '2001-01-02';
    const r = CLT.analisar({
      dias: [dia], funcionarios: [{ id: 1, jornada_semanal: 44 }],
      itens: { 1: { [dia]: { tipo: 'trabalho', blocos } } }, config: { ...S.config, cobertura: '0' },
    });
    return r.issues.filter((i) => ['jornada', 'intrajornada', 'pausaExtra', 'noturno'].includes(i.regra));
  }

  const avisosHtml = (lista) => lista.length
    ? lista.map((i) => `<div class="aviso ${i.sev}">${ic(i.sev === 'erro' ? 'erro' : i.sev === 'alerta' ? 'alerta' : 'info')}<div><b>${CLT.REGRAS[i.regra].nome}.</b> ${esc(i.msg)}</div></div>`).join('')
    : `<div class="aviso ok">${ic('check')}<div>Dentro das regras diárias da CLT (jornada e intervalos).</div></div>`;

  function turnos(main) {
    const lista = [...S.turnos].sort((a, b) => b.ativo - a.ativo || a.nome.localeCompare(b.nome));
    main.innerHTML = `
      ${cabecalho('Modelos de turno', 'Horários prontos para aplicar na escala. Cada célula da escala pode ser ajustada depois.',
        `<button class="btn primario" data-novo>${ic('mais')} Novo turno</button>`)}
      <div class="turnos-grade">${lista.map((t) => {
        const r = U.resumoBlocos(t.blocos);
        const avisos = verificarTurno(t.blocos);
        const pior = avisos.find((a) => a.sev === 'erro') ? 'erro' : avisos.find((a) => a.sev === 'alerta') ? 'alerta' : null;
        return `<div class="card turno-card ${t.ativo ? '' : 'inativo'}" data-id="${t.id}">
          <div class="turno-topo"><div class="turno-cor" style="background:${t.cor}"></div>
            <div><div class="turno-nome">${esc(t.nome)}</div><div class="turno-horas">${U.dur(r.trabalhado)} · ${U.fmtMin(r.inicio)}–${U.fmtMin(r.fim)}${t.sigla ? ` · ${esc(t.sigla)}` : ''}</div></div>
            <div style="margin-left:auto">${t.ativo ? (pior ? `<span class="selo ${pior}">${pior === 'erro' ? 'Irregular' : 'Atenção'}</span>` : '<span class="selo ok">CLT ok</span>') : '<span class="selo">Inativo</span>'}</div></div>
          ${UI.linhaTempo(t.blocos, t.cor)}
          <div class="small num muted">${t.blocos.map(([a, b]) => `${a}–${b}`).join(' · ')}</div>
          ${t.descricao ? `<div class="turno-desc">${esc(t.descricao)}</div>` : ''}
        </div>`;
      }).join('')}</div>`;
    main.querySelector('[data-novo]').addEventListener('click', () => formTurno(null, () => turnos(main)));
    main.querySelectorAll('.turno-card').forEach((c) => c.addEventListener('click', () => formTurno(S.turno(c.dataset.id), () => turnos(main))));
  }

  const CORES = ['#2f5bea', '#0e9f8e', '#7c5cd6', '#c2410c', '#b45309', '#15803d', '#be185d', '#0369a1', '#4b5563'];

  function formTurno(t, depois) {
    const novo = !t;
    t = t || { nome: '', sigla: '', cor: CORES[S.turnos.length % CORES.length], blocos: [['08:00', '12:00'], ['13:00', '17:00']], descricao: '', ativo: 1 };
    const m = UI.modal({
      titulo: novo ? 'Novo modelo de turno' : 'Editar modelo de turno',
      sub: 'Informe os períodos de trabalho. Os intervalos são calculados entre eles.',
      corpo: `<div class="stack">
        <div class="form-grade">
          <label class="campo"><span>Nome *</span><input class="inp" data-f="nome" value="${esc(t.nome)}" placeholder="Ex.: Semana 7h30"></label>
          <label class="campo"><span>Sigla</span><input class="inp" data-f="sigla" maxlength="6" value="${esc(t.sigla || '')}" placeholder="Ex.: S17"></label>
        </div>
        <div class="campo"><span>Cor</span><div class="row wrap" data-cores>
          ${CORES.map((c) => `<button type="button" data-cor="${c}" style="width:26px;height:26px;border-radius:7px;border:2px solid ${c === t.cor ? 'var(--ink)' : 'transparent'};background:${c};cursor:pointer"></button>`).join('')}
          <input type="color" data-f="cor" value="${t.cor}" style="width:34px;height:28px;border:0;background:none;cursor:pointer"></div></div>
        <div class="campo"><span>Períodos de trabalho</span><div data-blocos></div></div>
        <div data-preview></div>
        <div class="stack" style="gap:8px" data-avisos></div>
        <label class="campo"><span>Descrição</span><textarea class="inp" data-f="descricao" rows="2">${esc(t.descricao || '')}</textarea></label>
      </div>`,
      rodape: `${novo ? '' : `<button class="btn ${t.ativo ? 'perigo' : ''}" data-ativo>${t.ativo ? 'Desativar' : 'Reativar'}</button><span class="spacer"></span>`}
        <button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-salvar>${ic('check')} Salvar</button>`,
    });
    let cor = t.cor;
    const atualizar = (blocos) => {
      m.$('[data-preview]').innerHTML = `<div class="resumo-turno" style="margin-bottom:10px">${UI.resumoTurno(blocos)}</div>${UI.linhaTempo(blocos, cor)}`;
      m.$('[data-avisos]').innerHTML = avisosHtml(verificarTurno(blocos));
    };
    const editor = UI.editorBlocos(m.$('[data-blocos]'), t.blocos, atualizar);
    atualizar(editor.get());
    m.$('[data-cores]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cor]'); if (!b) return;
      cor = b.dataset.cor; m.$('[data-f=cor]').value = cor;
      m.$$('[data-cor]').forEach((x) => { x.style.borderColor = x === b ? 'var(--ink)' : 'transparent'; });
      atualizar(editor.get());
    });
    m.$('[data-f=cor]').addEventListener('input', (e) => { cor = e.target.value; atualizar(editor.get()); });
    const enviar = async (extra = {}) => {
      const dados = {
        nome: m.$('[data-f=nome]').value, sigla: m.$('[data-f=sigla]').value, cor,
        descricao: m.$('[data-f=descricao]').value, blocos: editor.get(), ativo: t.ativo, ...extra,
      };
      try {
        if (novo) await API.post('/api/turnos', dados); else await API.put(`/api/turnos/${t.id}`, dados);
        await S.carregar();
        m.fechar();
        UI.toast('Turno salvo.');
        depois && depois();
      } catch (e) { UI.toast(e.message, 'erro'); }
    };
    m.$('[data-salvar]').addEventListener('click', () => enviar());
    m.$('[data-ativo]')?.addEventListener('click', () => enviar({ ativo: t.ativo ? 0 : 1 }));
  }

  // ------------------------------------------------------------ regras
  function regras(main) {
    const c = S.config;
    const sevTipica = { jornada: 'erro', intrajornada: 'erro', pausaExtra: 'alerta', interjornada: 'erro', dsr35: 'erro', seteDias: 'erro', domingo: 'erro', domingoMulher: 'alerta', semanal: 'alerta', feriado: 'alerta', noturno: 'info', sobreposicao: 'alerta', indefinido: 'info', cobertura: 'info' };
    const icSev = { erro: 'erro', alerta: 'alerta', info: 'info' };
    main.innerHTML = `
      ${cabecalho('Regras CLT', 'O que o sistema confere em cada escala. Vermelho é violação; laranja pede atenção; azul é informativo.')}
      <div class="grade-2">
        <div class="card"><div class="card-cab"><h2>Regras verificadas</h2></div>
          <div class="card-corpo compacto">${Object.entries(CLT.REGRAS).map(([k, r]) => `
            <div class="regra-ref"><div class="sev-ic ${sevTipica[k]}">${ic(icSev[sevTipica[k]])}</div>
              <div><div class="nome">${r.nome}</div><div class="base">${r.base}</div></div>
              <div class="texto">${r.texto}</div></div>`).join('')}</div></div>
        <div class="stack">
          <div class="card"><div class="card-cab"><h2>Configurações</h2></div>
            <div class="card-corpo" style="padding-top:4px;padding-bottom:4px">
              <label class="interruptor"><input type="checkbox" data-c="art386_mulheres" ${c.art386_mulheres === '1' ? 'checked' : ''}>
                <div><div class="pessoa-nome">Revezamento quinzenal para mulheres</div><div class="muted small">CLT art. 386: folga dominical a cada 15 dias. Desligado, vale só a regra geral do comércio (1 domingo a cada 3 semanas).</div></div></label>
              <label class="interruptor"><input type="checkbox" data-c="sumula118" ${c.sumula118 === '1' ? 'checked' : ''}>
                <div><div class="pessoa-nome">Avisar sobre pausas além do intervalo legal</div><div class="muted small">Súmula 118 do TST. Desligue se a convenção coletiva da categoria prevê o lanche.</div></div></label>
              <label class="interruptor"><input type="checkbox" data-c="cobertura" ${c.cobertura === '1' ? 'checked' : ''}>
                <div><div class="pessoa-nome">Avisar horários sem ninguém trabalhando</div><div class="muted small">Checagem operacional, não é regra da CLT.</div></div></label>
              <label class="interruptor" style="align-items:center">${UI.campoNumero(c.limite_semanal || 44, 'data-n="limite_semanal" style="width:80px;height:34px;margin:0"')}
                <div><div class="pessoa-nome">Limite semanal (horas)</div><div class="muted small">Teto constitucional: 44h.</div></div></label>
              <label class="interruptor" style="align-items:center"><input class="inp" data-n="empresa" value="${esc(c.empresa || '')}" style="width:160px;height:34px;margin:0">
                <div><div class="pessoa-nome">Nome da empresa</div><div class="muted small">Aparece na impressão da escala.</div></div></label>
            </div>
            <div class="modal-rodape"><button class="btn primario" data-salvar>${ic('check')} Salvar configurações</button></div>
          </div>
          <div class="aviso info">${ic('info')}<div>As checagens seguem a CLT e a jurisprudência do TST. Convenções coletivas podem trazer regras próprias (lanche, banco de horas, trabalho em feriados): confirme com o RH/jurídico antes de publicar.</div></div>
        </div>
      </div>`;
    main.querySelector('[data-salvar]').addEventListener('click', async () => {
      const dados = {};
      main.querySelectorAll('[data-c]').forEach((i) => { dados[i.dataset.c] = i.checked ? '1' : '0'; });
      main.querySelectorAll('[data-n]').forEach((i) => { dados[i.dataset.n] = i.value; });
      const lim = U.lerNumero(dados.limite_semanal);
      if (lim == null || lim > 44 || lim <= 0) { UI.toast('O limite semanal deve ficar entre 1h e 44h.', 'erro'); return; }
      dados.limite_semanal = String(lim);
      try {
        S.config = await API.put('/api/config', dados);
        document.getElementById('empresa-nome').textContent = S.config.empresa || 'Gestão de jornada';
        UI.toast('Configurações salvas.');
      } catch (e) { UI.toast(e.message, 'erro'); }
    });
  }

  // ---------------------------------------------------------- feriados
  function feriados(main) {
    const anos = [...new Set(S.feriados.map((f) => f.data.slice(0, 4)))].sort();
    main.innerHTML = `
      ${cabecalho('Feriados', 'Dias marcados na escala. Trabalho em feriado gera alerta (pagamento em dobro ou folga compensatória).')}
      <div class="card" style="margin-bottom:18px"><div class="card-corpo">
        <form class="row wrap" data-form style="align-items:flex-end;gap:12px">
          <label class="campo" style="width:170px"><span>Data</span>${UI.campoData('', 'name="data" required')}</label>
          <label class="campo" style="flex:1;min-width:220px"><span>Nome</span><input class="inp" name="nome" required placeholder="Ex.: Aniversário da cidade"></label>
          <label class="campo"><span>Abrangência</span><select class="inp" name="abrangencia" style="width:200px">
            <option>Nacional</option><option>Estadual (AM)</option><option>Municipal (Manaus)</option><option>Ponto facultativo</option></select></label>
          <button class="btn primario">${ic('mais')} Adicionar</button>
        </form></div></div>
      ${anos.length ? anos.reverse().map((a) => `<div class="card" style="margin-bottom:18px"><div class="card-cab"><h2>${a}</h2></div>
        <div class="card-corpo compacto"><table class="tabela"><tbody>${S.feriados.filter((f) => f.data.startsWith(a)).map((f) => `
          <tr class="${f.data < S.hoje ? 'inativo' : ''}"><td class="num" style="width:120px">${U.dataBR(f.data)}</td><td style="width:90px" class="muted">${U.DOW_LONGO[U.dow(f.data)]}</td>
          <td class="pessoa-nome">${esc(f.nome)}</td><td class="muted">${esc(f.abrangencia)}</td>
          <td class="right"><button class="btn fantasma pequeno perigo" data-del="${f.id}">${ic('lixo')}</button></td></tr>`).join('')}
        </tbody></table></div></div>`).join('') : `<div class="card"><div class="vazio">Nenhum feriado cadastrado.</div></div>`}`;
    main.querySelector('[data-form]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = Object.fromEntries(new FormData(e.target).entries());
      dados.data = U.lerData(dados.data);
      if (!dados.data) { UI.toast('Data inválida. Use dd/mm/aaaa.', 'erro'); return; }
      try {
        await API.post('/api/feriados', dados);
        await S.carregar();
        UI.toast('Feriado adicionado.');
        feriados(main);
      } catch (err) { UI.toast(err.message, 'erro'); }
    });
    main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const f = S.feriados.find((x) => x.id === Number(b.dataset.del));
      if (!(await UI.confirmar({ titulo: 'Remover feriado?', texto: `${esc(f.nome)} (${U.dataBR(f.data)}) deixará de ser marcado nas escalas.`, ok: 'Remover', perigo: true }))) return;
      try { await API.del(`/api/feriados/${f.id}`); await S.carregar(); UI.toast('Feriado removido.'); feriados(main); } catch (e) { UI.toast(e.message, 'erro'); }
    }));
  }

  return { painel, funcionarios, funcionario, formFuncionario, turnos, regras, feriados, historico, cabecalho, seloStatus, linhasLog, analisarEscala, avisosHtml };
})();
