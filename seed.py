"""
Dados iniciais: proposta inicial do RH para as operadoras de caixa da
Morada do Sol (arquivo escala.txt), modelos de turno e feriados de 2026.

Roda automaticamente só quando o banco é criado pela primeira vez.
"""
import json
from datetime import date, timedelta

LOJA = "Morada do Sol"

FUNCIONARIOS = [
    # nome, cargo, folga no dia útil (0=seg ... 4=sex)
    ("Catarina", "Fiscal de caixa", 0),
    ("Rebecca", "Operadora de caixa", 1),
    ("Julia", "Operadora de caixa", 2),
    ("Milena", "Operadora de caixa", 3),
    ("Anna", "Operadora de caixa", 4),
]

TURNOS = [
    # chave, nome, sigla, cor, blocos, descrição
    ("sem_fiscal", "Semana 7h30 · lanche 18h", "S18", "#2f5bea",
     [["11:30", "14:00"], ["15:00", "18:00"], ["18:15", "20:15"]],
     "Proposta RH — fiscal. Intervalo 14h–15h, lanche 18h–18h15."),
    ("sem_17", "Semana 7h30 · lanche 17h", "S17", "#0e9f8e",
     [["11:30", "14:00"], ["15:00", "17:00"], ["17:15", "20:15"]],
     "Proposta RH. Intervalo 14h–15h, lanche 17h–17h15."),
    ("sem_1730", "Semana 7h30 · lanche 17h30", "S17½", "#7c5cd6",
     [["11:30", "14:00"], ["15:00", "17:30"], ["17:45", "20:15"]],
     "Proposta RH. Intervalo 14h–15h, lanche 17h30–17h45."),
    ("sab", "Sábado 8h", "SAB", "#c2410c",
     [["11:00", "14:00"], ["15:00", "16:00"], ["16:15", "20:15"]],
     "Proposta RH. Intervalo 14h–15h, lanche 16h–16h15."),
    ("dom", "Domingo 6h", "DOM", "#b45309",
     [["07:00", "08:00"], ["08:15", "13:15"]],
     "Proposta RH. Lanche 8h–8h15. Atenção: após o sábado até 20h15 sobram só 10h45 de descanso."),
    ("dom_aj", "Domingo 6h · ajustado", "DOM+", "#15803d",
     [["07:15", "08:15"], ["08:30", "13:30"]],
     "Sugestão: entrada 7h15 garante as 11h de interjornada (CLT art. 66) após o sábado até 20h15."),
]

# Turno de cada funcionária nos dias úteis, conforme a proposta
TURNO_SEMANA = {
    "Catarina": "sem_fiscal", "Rebecca": "sem_17", "Julia": "sem_17",
    "Milena": "sem_1730", "Anna": "sem_1730",
}

FERIADOS_2026 = [
    ("2026-01-01", "Confraternização Universal", "Nacional"),
    ("2026-04-03", "Sexta-feira Santa", "Nacional"),
    ("2026-04-21", "Tiradentes", "Nacional"),
    ("2026-05-01", "Dia do Trabalho", "Nacional"),
    ("2026-09-05", "Elevação do Amazonas à categoria de província", "Estadual (AM)"),
    ("2026-09-07", "Independência do Brasil", "Nacional"),
    ("2026-10-12", "Nossa Senhora Aparecida", "Nacional"),
    ("2026-10-24", "Aniversário de Manaus", "Municipal (Manaus)"),
    ("2026-11-02", "Finados", "Nacional"),
    ("2026-11-15", "Proclamação da República", "Nacional"),
    ("2026-11-20", "Dia Nacional de Zumbi e da Consciência Negra", "Nacional"),
    ("2026-12-08", "Nossa Senhora da Conceição", "Municipal (Manaus)"),
    ("2026-12-25", "Natal", "Nacional"),
    ("2027-01-01", "Confraternização Universal", "Nacional"),
]

INICIO = date(2026, 11, 9)   # segunda-feira
SEMANAS = 2


def popular(con):
    turno_id = {}
    for chave, nome, sigla, cor, blocos, desc in TURNOS:
        cur = con.execute(
            "INSERT INTO turnos (nome, sigla, cor, blocos, descricao) VALUES (?,?,?,?,?)",
            (nome, sigla, cor, json.dumps(blocos), desc))
        turno_id[chave] = (cur.lastrowid, blocos)

    func_ids = []
    for nome, cargo, folga in FUNCIONARIOS:
        cur = con.execute(
            """INSERT INTO funcionarios (nome, cargo, loja, sexo, jornada_semanal, observacoes)
               VALUES (?,?,?,?,?,?)""",
            (nome, cargo, LOJA, "F", 44, "Cadastro inicial a partir da proposta do RH."))
        func_ids.append((cur.lastrowid, nome, folga))

    for data, nome, abr in FERIADOS_2026:
        con.execute("INSERT INTO feriados (data, nome, abrangencia) VALUES (?,?,?)", (data, nome, abr))

    fim = INICIO + timedelta(days=7 * SEMANAS - 1)
    cur = con.execute(
        "INSERT INTO escalas (titulo, loja, inicio, fim, observacoes) VALUES (?,?,?,?,?)",
        ("Proposta inicial RH — Caixas", LOJA, INICIO.isoformat(), fim.isoformat(),
         "Reprodução da proposta inicial do RH (escala.txt): 4 dias úteis de 7h30, sábado 8h e "
         "domingo 6h = 44h semanais. A proposta não informa o dia da folga semanal; aqui cada "
         "funcionária folga em um dia útil diferente (seg a sex)."))
    eid = cur.lastrowid

    for ordem, (fid, nome, folga) in enumerate(func_ids):
        con.execute("INSERT INTO escala_funcionarios (escala_id, funcionario_id, ordem) VALUES (?,?,?)",
                    (eid, fid, ordem))
        for n in range(7 * SEMANAS):
            dia = INICIO + timedelta(days=n)
            dow = dia.weekday()  # 0 = segunda
            if dow == folga:
                tipo, chave = "folga", None
            elif dow == 5:
                tipo, chave = "trabalho", "sab"
            elif dow == 6:
                tipo, chave = "trabalho", "dom"
            else:
                tipo, chave = "trabalho", TURNO_SEMANA[nome]
            tid, blocos = turno_id[chave] if chave else (None, [])
            con.execute(
                """INSERT INTO escala_itens (escala_id, funcionario_id, data, tipo, turno_id, blocos, obs)
                   VALUES (?,?,?,?,?,?,?)""",
                (eid, fid, dia.isoformat(), tipo, tid, json.dumps(blocos), ""))

    con.execute(
        "INSERT INTO log (acao, entidade, entidade_id, detalhe) VALUES (?,?,?,?)",
        ("Importação", "escala", eid, "Proposta inicial RH — Caixas (dados de exemplo)"))
