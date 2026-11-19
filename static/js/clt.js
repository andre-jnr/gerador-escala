/*
 * Motor de conformidade CLT e gerador automático de escalas.
 *
 * analisar() recebe a escala (dias × funcionários) mais o contexto dos dias
 * anteriores e devolve as ocorrências por regra, por célula e os totais.
 * gerar() monta uma escala respeitando DSR, domingos e 7 dias seguidos.
 */
'use strict';

const CLT = (() => {
  const REGRAS = {
    jornada: {
      nome: 'Jornada diária', base: 'CLT arts. 58 e 59',
      texto: 'Jornada normal de até 8h por dia. Horas extras limitadas a 2h diárias, mediante acordo individual, acordo coletivo ou convenção.',
    },
    intrajornada: {
      nome: 'Intervalo para repouso e alimentação', base: 'CLT art. 71',
      texto: 'Jornada acima de 6h: intervalo mínimo de 1h e máximo de 2h (acima disso, só com acordo escrito ou convenção). Jornada de 4h a 6h: pausa de 15 minutos. O intervalo não conta como hora trabalhada.',
    },
    pausaExtra: {
      nome: 'Pausas além do intervalo legal', base: 'Súmula 118 do TST',
      texto: 'Intervalos dados pela empresa além dos previstos em lei são tempo à disposição; se forem acrescidos ao fim da jornada, devem ser pagos como hora extra. Confira se a convenção coletiva autoriza o lanche.',
    },
    interjornada: {
      nome: 'Descanso entre jornadas', base: 'CLT art. 66',
      texto: 'Mínimo de 11 horas seguidas entre o fim de uma jornada e o início da próxima.',
    },
    dsr35: {
      nome: 'Duração da folga semanal', base: 'CLT arts. 66 e 67; Súmula 110 do TST',
      texto: 'As 24h do descanso semanal somam-se às 11h de interjornada: 35 horas seguidas de descanso.',
    },
    seteDias: {
      nome: 'Repouso semanal remunerado', base: 'CLT art. 67; Lei 605/49; OJ 410 SDI-1 TST',
      texto: 'Uma folga de 24h por semana. Trabalhar o 7º dia seguido sem folga viola o DSR, que passa a ser devido em dobro.',
    },
    domingo: {
      nome: 'Folga no domingo (comércio)', base: 'Lei 10.101/2000, art. 6º, parágrafo único',
      texto: 'No comércio, o repouso semanal deve cair no domingo pelo menos uma vez a cada três semanas.',
    },
    domingoMulher: {
      nome: 'Revezamento quinzenal das mulheres', base: 'CLT art. 386',
      texto: 'Havendo trabalho aos domingos, a escala das mulheres deve garantir folga dominical a cada 15 dias. O TST aplica a regra; pode ser desligada em Configurações.',
    },
    semanal: {
      nome: 'Jornada semanal', base: 'CF art. 7º, XIII; contrato de trabalho',
      texto: 'Limite constitucional de 44 horas por semana. O que passar da jornada contratual é hora extra.',
    },
    feriado: {
      nome: 'Trabalho em feriado', base: 'Lei 605/49, art. 9º; Lei 10.101/2000, art. 6º-A',
      texto: 'No comércio, só com autorização em convenção coletiva. O dia trabalhado é pago em dobro ou compensado com outra folga.',
    },
    noturno: {
      nome: 'Trabalho noturno', base: 'CLT art. 73',
      texto: 'Entre 22h e 5h: adicional mínimo de 20% e hora noturna reduzida (52min30s).',
    },
    sobreposicao: {
      nome: 'Escala em duplicidade', base: 'Controle interno',
      texto: 'O funcionário também aparece em outra escala no mesmo dia.',
    },
    indefinido: {
      nome: 'Dia sem definição', base: 'Controle interno',
      texto: 'Dia do período sem turno, folga ou afastamento definido.',
    },
    cobertura: {
      nome: 'Horário sem ninguém', base: 'Operacional',
      texto: 'Dentro do horário de funcionamento do dia, ninguém da escala está trabalhando.',
    },
  };

  const SEV_ORDEM = { erro: 0, alerta: 1, info: 2 };

  /** Minutos de trabalho entre 22h e 5h. */
  function minutosNoturnos(iv) {
    let total = 0;
    for (const [a, b] of iv) {
      for (let k = -1; k <= 2; k++) {
        const ini = k * 1440 + 22 * 60, fim = k * 1440 + 29 * 60;
        total += Math.max(0, Math.min(b, fim) - Math.max(a, ini));
      }
    }
    return total;
  }

  const ligado = (config, chave) => String(config[chave] ?? '1') === '1';
  const ehTrabalho = (it) => !!(it && it.tipo === 'trabalho' && it.blocos && it.blocos.length);

  function analisar({ dias, funcionarios, itens, contexto = {}, sobreposicoes = [], feriados = {}, config = {} }) {
    const issues = [];
    const celulas = {};
    const porFunc = {};
    const inicio = dias[0], fim = dias[dias.length - 1];
    const limite = Number(config.limite_semanal || 44) * 60;

    const add = (sev, regra, fid, data, msg, marcarCelula = true) => {
      issues.push({ sev, regra, fid, data, msg });
      if (fid && data && marcarCelula) (celulas[`${fid}|${data}`] ||= []).push({ sev, regra, msg });
    };

    for (const f of funcionarios) {
      const fid = f.id;
      const meus = itens[fid] || {};
      const ctx = contexto[fid] || contexto[String(fid)] || {};
      const datasCtx = Object.keys(ctx).filter((d) => d < inicio).sort();
      const todas = U.intervalo(datasCtx.length ? datasCtx[0] : inicio, fim);

      // Informações de cada dia (null = sem registro / desconhecido)
      const info = {};
      for (const data of todas) {
        const it = data >= inicio ? meus[data] : ctx[data];
        if (!it) { info[data] = null; continue; }
        const trab = ehTrabalho(it);
        const r = trab ? U.resumoBlocos(it.blocos) : null;
        const off = U.diffDias(inicio, data) * 1440;
        info[data] = { it, trab, r, absIni: r ? off + r.inicio : null, absFim: r ? off + r.fim : null };
      }

      // 1) Regras do dia
      let totalMin = 0, diasTrab = 0, folgas = 0;
      for (const data of dias) {
        const x = info[data];
        if (!x) { add('info', 'indefinido', fid, data, 'Sem turno, folga ou afastamento definido.'); continue; }
        if (!x.trab) {
          if (x.it.tipo === 'trabalho') add('info', 'indefinido', fid, data, 'Marcado como trabalho, mas sem horários.');
          if (TIPOS[x.it.tipo]?.descanso) folgas++;
          continue;
        }
        diasTrab++;
        const T = x.r.trabalhado, pausas = x.r.pausas;
        totalMin += T;

        if (T > 600) add('erro', 'jornada', fid, data, `Jornada de ${U.dur(T)}: passa do máximo de 10h (8h + 2h extras).`);
        else if (T > 480 && Number(f.compensacao)) add('info', 'jornada', fid, data, `Jornada de ${U.dur(T)} coberta pelo acordo de compensação (art. 59, § 2º): até 10h por dia, dentro da jornada semanal.`);
        else if (T > 480) add('alerta', 'jornada', fid, data, `Jornada de ${U.dur(T)}: ${U.dur(T - 480)} de hora extra. Sem acordo de compensação no cadastro, exige acordo de prorrogação.`);

        const maior = pausas.reduce((m, p) => (p.min > m.min ? p : m), { min: 0 });
        let legal = null;
        if (T > 360) {
          if (maior.min < 60) {
            add('erro', 'intrajornada', fid, data, maior.min
              ? `Jornada de ${U.dur(T)} com intervalo de só ${U.dur(maior.min)}: o mínimo é 1h.`
              : `Jornada de ${U.dur(T)} sem intervalo: o mínimo é 1h.`);
          } else {
            legal = maior;
            if (maior.min > 120) add('alerta', 'intrajornada', fid, data, `Intervalo de ${U.dur(maior.min)}: acima de 2h só com acordo escrito ou convenção.`);
          }
        } else if (T > 240) {
          if (maior.min < 15) add('erro', 'intrajornada', fid, data, `Jornada de ${U.dur(T)} exige pausa de 15 min.`);
          else legal = maior;
        }
        if (ligado(config, 'sumula118')) {
          const extras = pausas.filter((p) => p !== legal);
          if (extras.length) {
            const txt = extras.map((p) => `${U.fmtMin(p.ini)}–${U.fmtMin(p.fim)}`).join(', ');
            add('alerta', 'pausaExtra', fid, data, `Pausa ${txt} além do intervalo legal: pode contar como tempo à disposição.`);
          }
        }
        if (feriados[data]) add('alerta', 'feriado', fid, data, `Trabalho no feriado “${feriados[data]}”: exige autorização em convenção e pagamento em dobro ou folga compensatória.`);
        const noturno = minutosNoturnos(x.r.iv);
        if (noturno) add('info', 'noturno', fid, data, `${U.dur(noturno)} no horário noturno (22h–5h): adicional de 20% e hora reduzida.`);
      }

      // 2) Interjornada (11h) e folga semanal de 35h
      let anterior = null;
      for (const data of todas) {
        const x = info[data];
        if (x === null) { anterior = null; continue; }
        if (!x.trab) continue;
        if (anterior && data >= inicio) {
          const gap = x.absIni - anterior.absFim;
          const entre = U.intervalo(U.addDias(anterior.data, 1), U.addDias(data, -1));
          const teveFolga = entre.some((d) => TIPOS[info[d]?.it.tipo]?.descanso);
          const ref = `${U.ddmm(anterior.data)} às ${U.fmtMin(anterior.absFim)}`;
          if (teveFolga && gap < 35 * 60) {
            add('erro', 'dsr35', fid, data, `Só ${U.dur(gap)} de descanso desde ${ref}: a folga semanal precisa somar 35h (24h + 11h).`);
          } else if (gap < 660) {
            add('erro', 'interjornada', fid, data, `Só ${U.dur(gap)} de descanso desde ${ref}: o mínimo entre jornadas é 11h.`);
          }
        }
        anterior = { data, absFim: x.absFim };
      }

      // 3) Sete dias seguidos sem folga
      let seq = 0;
      for (const data of todas) {
        const x = info[data];
        if (!x || !x.trab) { seq = 0; continue; }
        seq++;
        if (seq >= 7 && data >= inicio) {
          add('erro', 'seteDias', fid, data, `${seq}º dia seguido de trabalho sem folga (desde ${U.ddmm(U.addDias(data, 1 - seq))}).`);
        }
      }

      // 4) Domingos
      let domingosTrab = 0;
      for (const data of dias) {
        if (U.dow(data) !== 0 || !info[data]?.trab) continue;
        domingosTrab++;
        let n = 0;
        for (let x = data; info[x]?.trab; x = U.addDias(x, -7)) n++;
        if (n >= 3) {
          add('erro', 'domingo', fid, data, `${n}º domingo seguido trabalhado: no comércio a folga deve cair no domingo ao menos 1 vez a cada 3 semanas.`);
        } else if (n >= 2 && f.sexo === 'F' && ligado(config, 'art386_mulheres')) {
          add('alerta', 'domingoMulher', fid, data, '2º domingo seguido trabalhado: para mulheres a folga dominical deve ser quinzenal.');
        }
      }

      // 5) Jornada semanal (semanas de segunda a domingo)
      const contrato = Number(f.jornada_semanal || 44) * 60;
      const semanas = [];
      for (const seg of [...new Set(dias.map(U.segunda))]) {
        let min = 0, completa = true;
        for (let i = 0; i < 7; i++) {
          const x = info[U.addDias(seg, i)];
          if (x == null) { completa = false; continue; }
          if (x.trab) min += x.r.trabalhado;
        }
        semanas.push({ semana: seg, min, completa });
        if (!completa) continue;
        const ref = U.addDias(seg, 6) > fim ? fim : U.addDias(seg, 6);
        const rotulo = `Semana de ${U.ddmm(seg)}: ${U.dur(min)}`;
        if (min > limite) add('alerta', 'semanal', fid, ref, `${rotulo}, passa do limite de ${U.dur(limite)} em ${U.dur(min - limite)}.`, false);
        else if (min > contrato) add('alerta', 'semanal', fid, ref, `${rotulo}, ${U.dur(min - contrato)} acima da jornada contratual de ${U.dur(contrato)}.`, false);
        else if (min < contrato) add('info', 'semanal', fid, ref, `${rotulo}, ${U.dur(contrato - min)} abaixo da jornada contratual de ${U.dur(contrato)}.`, false);
      }

      // 6) Mesma pessoa em outra escala
      for (const s of sobreposicoes) {
        if (Number(s.funcionario_id) === fid) add('alerta', 'sobreposicao', fid, s.data, `Também está na escala “${s.titulo}” (${s.status}).`);
      }

      porFunc[fid] = { semanas, domingosTrab, totalMin, diasTrab, folgas };
    }

    // 7) Cobertura por dia
    const cobertura = {};
    for (const data of dias) {
      const barras = [];
      for (const f of funcionarios) {
        const it = (itens[f.id] || {})[data];
        if (ehTrabalho(it)) barras.push({ fid: f.id, iv: U.intervalos(it.blocos), blocos: it.blocos });
      }
      const todos = barras.flatMap((b) => b.iv).sort((a, b) => a[0] - b[0]);
      const buracos = [];
      let ini = null, fimDia = null;
      if (todos.length) {
        ini = todos[0][0];
        let cursor = todos[0][1];
        for (const [a, b] of todos.slice(1)) {
          if (a > cursor) buracos.push([cursor, a]);
          cursor = Math.max(cursor, b);
        }
        fimDia = cursor;
      }
      cobertura[data] = { barras, buracos, ini, fim: fimDia };
      if (ligado(config, 'cobertura')) {
        for (const [a, b] of buracos) {
          add('info', 'cobertura', null, data, `${U.DOW[U.dow(data)]} ${U.ddmm(data)}: ninguém trabalhando entre ${U.fmtMin(a)} e ${U.fmtMin(b)}.`);
        }
      }
    }

    issues.sort((a, b) => SEV_ORDEM[a.sev] - SEV_ORDEM[b.sev] || (a.data || '').localeCompare(b.data || ''));
    const contagem = { erro: 0, alerta: 0, info: 0 };
    issues.forEach((i) => contagem[i.sev]++);
    return { issues, celulas, porFunc, cobertura, contagem };
  }

  /** Quantas pessoas trabalham em cada fatia de `passo` minutos entre `de` e `ate`. */
  function contarPorFaixa(cob, de, ate, passo = 15) {
    const r = [];
    for (let t = de; t < ate; t += passo) {
      const meio = t + passo / 2;
      r.push({ t, n: cob.barras.filter((b) => b.iv.some(([a, z]) => meio >= a && meio < z)).length });
    }
    return r;
  }

  /** Situação de um membro do gerador: quais dias têm turno e que regras de folga se aplicam. */
  function perfilMembro(m) {
    const turnoDia = (j) => (m.t[j] ? S.turno(m.t[j]) : null);
    const fixas = [0, 1, 2, 3, 4, 5, 6].filter((j) => !turnoDia(j));
    return {
      turnoDia,
      fixas,
      trabalhaDomingo: !!turnoDia(6),
      // Só quem tem turno nos 7 dias precisa de folga rotativa; quem já tem dia sem turno
      // (ex.: administrativo sem sábado e domingo) usa esses dias como folga fixa.
      precisaRotativa: fixas.length === 0,
    };
  }

  /**
   * Gera os itens de uma escala.
   * membros: [{ f, t: [seg, ter, qua, qui, sex, sáb, dom] }] (ids de turno; vazio = folga fixa nesse dia)
   * freq: 'auto' | '2' | '3' — de quantas em quantas semanas o domingo é folga (só para quem trabalha domingo)
   * diasFolga: índices 0..5 (seg..sáb) onde pode cair a folga rotativa (só para quem tem turno nos 7 dias)
   */
  function gerar({ inicio, semanas, membros, freq = 'auto', diasFolga = [0, 1, 2, 3, 4], contexto = {}, config = {} }) {
    const itens = {};
    const folgasNaSemana = [];
    const dias = [...diasFolga].sort((a, b) => a - b);

    membros.forEach((m, i) => {
      const f = m.f;
      const p = perfilMembro(m);
      const ctx = contexto[f.id] || contexto[String(f.id)] || {};
      const k = freq === 'auto' ? (f.sexo === 'F' && ligado(config, 'art386_mulheres') ? 2 : 3) : Number(freq) || 3;

      // Domingos trabalhados em sequência antes do início (para não estourar a regra)
      let seqDom = 0;
      for (let x = U.addDias(inicio, -1); U.dow(x) === 0 && ehTrabalho(ctx[x]); x = U.addDias(x, -7)) seqDom++;
      const primeiraFolgaDom = Math.max(0, Math.min(i % k, k - 1 - seqDom));

      // Último descanso conhecido antes do início (índice relativo; -1 = véspera)
      let ultimo = -8;
      for (let n = 1; n <= 7; n++) {
        const x = ctx[U.addDias(inicio, -n)];
        if (!x || !ehTrabalho(x)) { ultimo = -n; break; }
      }

      itens[f.id] = {};
      for (let w = 0; w < semanas; w++) {
        const base = w * 7;
        // freq 'manual': o gerador não escolhe domingos de folga; quem edita define depois
        const domFolga = freq !== 'manual' && p.trabalhaDomingo && w >= primeiraFolgaDom && (w - primeiraFolgaDom) % k === 0;
        const cont = (folgasNaSemana[w] ||= [0, 0, 0, 0, 0, 0, 0]);

        let folga = null;
        if (p.precisaRotativa) {
          // A folga do dia útil não pode deixar mais de 6 dias seguidos de trabalho
          const maxIdx = ultimo + 7 - base;
          let candidatos = dias.filter((d) => d <= maxIdx);
          if (!candidatos.length) candidatos = [dias[0] ?? 0];
          candidatos.sort((a, b) => cont[a] - cont[b] || ((a - i - w + 70) % 7) - ((b - i - w + 70) % 7));
          folga = candidatos[0];
          cont[folga]++;
        }
        if (domFolga) cont[6]++;

        for (let j = 0; j < 7; j++) {
          const data = U.addDias(inicio, base + j);
          const t = p.turnoDia(j);
          if (j === folga || (j === 6 && domFolga) || !t) {
            itens[f.id][data] = { tipo: 'folga', turno_id: null, blocos: [], obs: '' };
          } else {
            itens[f.id][data] = { tipo: 'trabalho', turno_id: t.id, blocos: t.blocos.map((b) => [...b]), obs: '' };
          }
        }
        if (p.precisaRotativa) ultimo = domFolga ? base + 6 : base + folga;
      }
    });
    return itens;
  }

  /** Descanso entre o fim de um turno e o início de outro no dia seguinte. */
  function descansoEntre(blocosA, blocosB) {
    const a = U.resumoBlocos(blocosA), b = U.resumoBlocos(blocosB);
    if (a.fim == null || b.inicio == null) return null;
    return 1440 + b.inicio - a.fim;
  }

  return { REGRAS, analisar, contarPorFaixa, gerar, perfilMembro, descansoEntre, ehTrabalho };
})();
