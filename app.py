"""
Gerador de Escala de Trabalho — servidor Flask + SQLite.

Cadastro de funcionários, modelos de turno, escalas (com versões e histórico)
e feriados. A validação das regras da CLT roda no navegador (static/js/clt.js);
o servidor guarda os dados e entrega o contexto (dias anteriores) que a
validação precisa para checar interjornada, DSR e domingos.
"""
import json
import os
import socket
import sqlite3
import sys
from datetime import date, datetime, timedelta

from flask import Flask, g, jsonify, request, send_from_directory

BASE = os.path.dirname(os.path.abspath(__file__))


def carregar_env():
    """Lê o .env (chave=valor) sem depender de bibliotecas extras."""
    caminho = os.path.join(BASE, ".env")
    if not os.path.exists(caminho):
        return
    with open(caminho, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha or linha.startswith("#") or "=" not in linha:
                continue
            chave, valor = linha.split("=", 1)
            os.environ.setdefault(chave.strip(), valor.strip())


carregar_env()

PORT = int(os.environ.get("PORT", "3012"))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE, "dados", "escala.db"))
BACKUP_DIAS = int(os.environ.get("BACKUP_DIAS", "30"))

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.json.ensure_ascii = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS funcionarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    matricula TEXT,
    cargo TEXT,
    loja TEXT,
    sexo TEXT DEFAULT 'F',
    admissao TEXT,
    jornada_semanal REAL DEFAULT 44,
    ativo INTEGER DEFAULT 1,
    observacoes TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS turnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    sigla TEXT,
    cor TEXT DEFAULT '#2f5bea',
    blocos TEXT NOT NULL,
    descricao TEXT,
    ativo INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS escalas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    loja TEXT,
    inicio TEXT NOT NULL,
    fim TEXT NOT NULL,
    status TEXT DEFAULT 'rascunho',
    observacoes TEXT,
    erros INTEGER,
    alertas INTEGER,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    atualizado_em TEXT DEFAULT (datetime('now','localtime')),
    excluida_em TEXT
);
CREATE TABLE IF NOT EXISTS escala_funcionarios (
    escala_id INTEGER NOT NULL,
    funcionario_id INTEGER NOT NULL,
    ordem INTEGER DEFAULT 0,
    PRIMARY KEY (escala_id, funcionario_id)
);
CREATE TABLE IF NOT EXISTS escala_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    escala_id INTEGER NOT NULL,
    funcionario_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    tipo TEXT NOT NULL,
    turno_id INTEGER,
    blocos TEXT,
    obs TEXT,
    UNIQUE (escala_id, funcionario_id, data)
);
CREATE INDEX IF NOT EXISTS ix_itens_func_data ON escala_itens (funcionario_id, data);
CREATE TABLE IF NOT EXISTS escala_versoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    escala_id INTEGER NOT NULL,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    resumo TEXT,
    snapshot TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feriados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    abrangencia TEXT DEFAULT 'Nacional'
);
CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT
);
CREATE TABLE IF NOT EXISTS log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quando TEXT DEFAULT (datetime('now','localtime')),
    acao TEXT,
    entidade TEXT,
    entidade_id INTEGER,
    detalhe TEXT
);
"""

CONFIG_PADRAO = {
    "empresa": "Moura",
    "art386_mulheres": "1",       # CLT art. 386 — domingo quinzenal para mulheres
    "sumula118": "1",             # Súmula 118 TST — pausas extras não previstas em lei
    "cobertura": "1",             # Aviso de horários sem ninguém trabalhando
    "limite_semanal": "44",       # CF art. 7º, XIII
}


# ---------------------------------------------------------------- banco ----

def conectar():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def db():
    if "db" not in g:
        g.db = conectar()
    return g.db


@app.teardown_appcontext
def fechar_db(_exc):
    con = g.pop("db", None)
    if con is not None:
        con.close()


def linhas(rows):
    return [dict(r) for r in rows]


def registrar(acao, entidade, entidade_id=None, detalhe=""):
    db().execute(
        "INSERT INTO log (acao, entidade, entidade_id, detalhe) VALUES (?,?,?,?)",
        (acao, entidade, entidade_id, detalhe),
    )


def backup_diario():
    """Copia o banco uma vez por dia para dados/backups (mantém os últimos N)."""
    if not os.path.exists(DB_PATH):
        return
    pasta = os.path.join(os.path.dirname(DB_PATH), "backups")
    os.makedirs(pasta, exist_ok=True)
    destino = os.path.join(pasta, f"escala-{date.today():%Y%m%d}.db")
    if not os.path.exists(destino):
        origem = sqlite3.connect(DB_PATH)
        copia = sqlite3.connect(destino)
        origem.backup(copia)
        copia.close()
        origem.close()
    antigos = sorted(f for f in os.listdir(pasta) if f.startswith("escala-"))
    for nome in antigos[:-BACKUP_DIAS]:
        os.remove(os.path.join(pasta, nome))


def iniciar_banco():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    novo = not os.path.exists(DB_PATH)
    backup_diario()
    con = conectar()
    con.executescript(SCHEMA)
    for chave, valor in CONFIG_PADRAO.items():
        con.execute("INSERT OR IGNORE INTO config (chave, valor) VALUES (?,?)", (chave, valor))
    con.commit()
    if novo:
        from seed import popular
        popular(con)
        for r in con.execute("SELECT id FROM escalas").fetchall():
            snapshot(con, r["id"], "Importada da proposta inicial do RH")
        con.commit()
    con.close()


# --------------------------------------------------------------- helpers ----

def item_saida(row):
    d = dict(row)
    d["blocos"] = json.loads(d["blocos"] or "[]")
    return d


def melhor_por_dia(rows):
    """Quando o mesmo funcionário aparece em mais de uma escala no mesmo dia,
    vale a publicada; empatando, a atualizada mais recentemente."""
    escolhido = {}
    for r in rows:
        chave = (r["funcionario_id"], r["data"])
        peso = (1 if r["status"] == "publicada" else 0, r["atualizado_em"] or "")
        if chave not in escolhido or peso > escolhido[chave][0]:
            escolhido[chave] = (peso, r)
    return [v[1] for v in escolhido.values()]


def montar_contexto(fids, inicio, fim, excluir=None, dias=42):
    """Dias anteriores ao período (para interjornada, DSR e domingos) e
    sobreposições com outras escalas dentro do período."""
    if not fids:
        return {}, []
    marcadores = ",".join("?" * len(fids))
    desde = (date.fromisoformat(inicio) - timedelta(days=dias)).isoformat()
    sql = f"""
        SELECT i.*, e.status, e.titulo, e.atualizado_em
          FROM escala_itens i JOIN escalas e ON e.id = i.escala_id
         WHERE e.excluida_em IS NULL AND i.funcionario_id IN ({marcadores})
           AND i.data >= ? AND i.data <= ? AND e.id != ?
    """
    rows = db().execute(sql, (*fids, desde, fim, excluir or -1)).fetchall()
    contexto, sobreposicoes = {}, []
    for r in melhor_por_dia(rows):
        if r["data"] < inicio:
            contexto.setdefault(str(r["funcionario_id"]), {})[r["data"]] = {
                "tipo": r["tipo"], "turno_id": r["turno_id"],
                "blocos": json.loads(r["blocos"] or "[]"),
            }
        else:
            sobreposicoes.append({
                "funcionario_id": r["funcionario_id"], "data": r["data"],
                "escala_id": r["escala_id"], "titulo": r["titulo"], "status": r["status"],
            })
    return contexto, sobreposicoes


def gravar_itens(con, escala_id, funcionarios, itens):
    con.execute("DELETE FROM escala_funcionarios WHERE escala_id=?", (escala_id,))
    con.execute("DELETE FROM escala_itens WHERE escala_id=?", (escala_id,))
    for ordem, fid in enumerate(funcionarios):
        con.execute(
            "INSERT INTO escala_funcionarios (escala_id, funcionario_id, ordem) VALUES (?,?,?)",
            (escala_id, int(fid), ordem),
        )
    for it in itens:
        con.execute(
            """INSERT INTO escala_itens (escala_id, funcionario_id, data, tipo, turno_id, blocos, obs)
               VALUES (?,?,?,?,?,?,?)""",
            (escala_id, int(it["funcionario_id"]), it["data"], it["tipo"],
             it.get("turno_id"), json.dumps(it.get("blocos") or []), it.get("obs") or ""),
        )


def snapshot(con, escala_id, resumo):
    esc = dict(con.execute("SELECT * FROM escalas WHERE id=?", (escala_id,)).fetchone())
    funcs = [r["funcionario_id"] for r in con.execute(
        "SELECT funcionario_id FROM escala_funcionarios WHERE escala_id=? ORDER BY ordem", (escala_id,))]
    itens = [item_saida(r) for r in con.execute(
        "SELECT funcionario_id, data, tipo, turno_id, blocos, obs FROM escala_itens WHERE escala_id=?",
        (escala_id,))]
    dados = {"escala": esc, "funcionarios": funcs, "itens": itens}
    con.execute(
        "INSERT INTO escala_versoes (escala_id, resumo, snapshot) VALUES (?,?,?)",
        (escala_id, resumo, json.dumps(dados, ensure_ascii=False)),
    )


def erro(msg, status=400):
    return jsonify({"erro": msg}), status


# ------------------------------------------------------------------ rotas ----

@app.get("/")
def index():
    return send_from_directory(os.path.join(BASE, "static"), "index.html")


@app.get("/api/bootstrap")
def bootstrap():
    con = db()
    return jsonify({
        "funcionarios": linhas(con.execute("SELECT * FROM funcionarios ORDER BY ativo DESC, nome")),
        "turnos": [item_saida(r) for r in con.execute("SELECT * FROM turnos ORDER BY ativo DESC, nome")],
        "feriados": linhas(con.execute("SELECT * FROM feriados ORDER BY data")),
        "config": {r["chave"]: r["valor"] for r in con.execute("SELECT * FROM config")},
        "hoje": date.today().isoformat(),
    })


# --- funcionários

CAMPOS_FUNC = ["nome", "matricula", "cargo", "loja", "sexo", "admissao", "jornada_semanal", "ativo", "observacoes"]


@app.post("/api/funcionarios")
def criar_funcionario():
    d = request.get_json() or {}
    if not (d.get("nome") or "").strip():
        return erro("Informe o nome do funcionário.")
    d.setdefault("ativo", 1)
    d.setdefault("jornada_semanal", 44)
    con = db()
    cur = con.execute(
        f"INSERT INTO funcionarios ({','.join(CAMPOS_FUNC)}) VALUES ({','.join('?' * len(CAMPOS_FUNC))})",
        [d.get(c) for c in CAMPOS_FUNC],
    )
    registrar("Cadastro", "funcionario", cur.lastrowid, d["nome"].strip())
    con.commit()
    return jsonify(dict(con.execute("SELECT * FROM funcionarios WHERE id=?", (cur.lastrowid,)).fetchone()))


@app.put("/api/funcionarios/<int:fid>")
def editar_funcionario(fid):
    d = request.get_json() or {}
    if "nome" in d and not (d.get("nome") or "").strip():
        return erro("Informe o nome do funcionário.")
    campos = [c for c in CAMPOS_FUNC if c in d]
    if not campos:
        return erro("Nada para alterar.")
    con = db()
    con.execute(
        f"UPDATE funcionarios SET {','.join(c + '=?' for c in campos)} WHERE id=?",
        [d[c] for c in campos] + [fid],
    )
    nome = con.execute("SELECT nome FROM funcionarios WHERE id=?", (fid,)).fetchone()
    if nome is None:
        return erro("Funcionário não encontrado.", 404)
    acao = "Edição"
    if campos == ["ativo"]:
        acao = "Reativação" if d["ativo"] else "Inativação"
    registrar(acao, "funcionario", fid, nome["nome"])
    con.commit()
    return jsonify(dict(con.execute("SELECT * FROM funcionarios WHERE id=?", (fid,)).fetchone()))


@app.get("/api/funcionarios/<int:fid>/historico")
def historico_funcionario(fid):
    con = db()
    func = con.execute("SELECT * FROM funcionarios WHERE id=?", (fid,)).fetchone()
    if func is None:
        return erro("Funcionário não encontrado.", 404)
    rows = con.execute(
        """SELECT i.*, e.status, e.titulo, e.atualizado_em
             FROM escala_itens i JOIN escalas e ON e.id = i.escala_id
            WHERE e.excluida_em IS NULL AND i.funcionario_id=?
            ORDER BY i.data""", (fid,)).fetchall()
    itens = []
    for r in sorted(melhor_por_dia(rows), key=lambda r: r["data"]):
        d = item_saida(r)
        d["escala_titulo"] = r["titulo"]
        itens.append(d)
    escalas = linhas(con.execute(
        """SELECT e.id, e.titulo, e.inicio, e.fim, e.status, e.loja, e.atualizado_em
             FROM escalas e JOIN escala_funcionarios ef ON ef.escala_id = e.id
            WHERE e.excluida_em IS NULL AND ef.funcionario_id=?
            ORDER BY e.inicio DESC""", (fid,)))
    log = linhas(con.execute(
        "SELECT * FROM log WHERE entidade='funcionario' AND entidade_id=? ORDER BY id DESC LIMIT 30", (fid,)))
    return jsonify({"funcionario": dict(func), "itens": itens, "escalas": escalas, "log": log})


# --- turnos

@app.post("/api/turnos")
@app.put("/api/turnos/<int:tid>")
def salvar_turno(tid=None):
    d = request.get_json() or {}
    if not (d.get("nome") or "").strip():
        return erro("Informe o nome do turno.")
    if not d.get("blocos"):
        return erro("Informe ao menos um período de trabalho.")
    valores = (d["nome"].strip(), d.get("sigla"), d.get("cor") or "#2f5bea",
               json.dumps(d["blocos"]), d.get("descricao"), int(d.get("ativo", 1)))
    con = db()
    if tid is None:
        cur = con.execute(
            "INSERT INTO turnos (nome, sigla, cor, blocos, descricao, ativo) VALUES (?,?,?,?,?,?)", valores)
        tid = cur.lastrowid
        registrar("Cadastro", "turno", tid, d["nome"])
    else:
        con.execute(
            "UPDATE turnos SET nome=?, sigla=?, cor=?, blocos=?, descricao=?, ativo=? WHERE id=?", (*valores, tid))
        registrar("Edição", "turno", tid, d["nome"])
    con.commit()
    return jsonify(item_saida(con.execute("SELECT * FROM turnos WHERE id=?", (tid,)).fetchone()))


# --- escalas

@app.get("/api/escalas")
def listar_escalas():
    rows = db().execute(
        """SELECT e.*, (SELECT COUNT(*) FROM escala_funcionarios f WHERE f.escala_id = e.id) AS n_funcionarios
             FROM escalas e WHERE e.excluida_em IS NULL ORDER BY e.inicio DESC, e.id DESC""")
    return jsonify(linhas(rows))


@app.get("/api/escalas/<int:eid>")
def obter_escala(eid):
    con = db()
    esc = con.execute("SELECT * FROM escalas WHERE id=? AND excluida_em IS NULL", (eid,)).fetchone()
    if esc is None:
        return erro("Escala não encontrada.", 404)
    funcs = [r["funcionario_id"] for r in con.execute(
        "SELECT funcionario_id FROM escala_funcionarios WHERE escala_id=? ORDER BY ordem", (eid,))]
    itens = [item_saida(r) for r in con.execute(
        "SELECT funcionario_id, data, tipo, turno_id, blocos, obs FROM escala_itens WHERE escala_id=?", (eid,))]
    contexto, sobreposicoes = montar_contexto(funcs, esc["inicio"], esc["fim"], excluir=eid)
    return jsonify({"escala": dict(esc), "funcionarios": funcs, "itens": itens,
                    "contexto": contexto, "sobreposicoes": sobreposicoes})


@app.get("/api/contexto")
def contexto():
    fids = [int(x) for x in (request.args.get("fids") or "").split(",") if x.strip()]
    inicio, fim = request.args.get("inicio"), request.args.get("fim")
    if not inicio or not fim:
        return erro("Informe início e fim.")
    excluir = request.args.get("excluir", type=int)
    ctx, sob = montar_contexto(fids, inicio, fim, excluir=excluir)
    return jsonify({"contexto": ctx, "sobreposicoes": sob})


def validar_escala(d):
    if not (d.get("titulo") or "").strip():
        return "Informe o título da escala."
    try:
        ini, fim = date.fromisoformat(d["inicio"]), date.fromisoformat(d["fim"])
    except (KeyError, ValueError, TypeError):
        return "Período inválido."
    if fim < ini:
        return "A data final é anterior à inicial."
    if (fim - ini).days > 62:
        return "O período máximo de uma escala é de 9 semanas."
    return None


@app.post("/api/escalas")
def criar_escala():
    d = request.get_json() or {}
    msg = validar_escala(d)
    if msg:
        return erro(msg)
    resumo = d.get("resumo") or {}
    con = db()
    cur = con.execute(
        """INSERT INTO escalas (titulo, loja, inicio, fim, observacoes, erros, alertas)
           VALUES (?,?,?,?,?,?,?)""",
        (d["titulo"].strip(), d.get("loja"), d["inicio"], d["fim"], d.get("observacoes"),
         resumo.get("erros", 0), resumo.get("alertas", 0)))
    eid = cur.lastrowid
    gravar_itens(con, eid, d.get("funcionarios") or [], d.get("itens") or [])
    snapshot(con, eid, d.get("origem") or "Criação")
    registrar("Criação", "escala", eid, d["titulo"].strip())
    con.commit()
    return jsonify({"id": eid})


@app.put("/api/escalas/<int:eid>")
def salvar_escala(eid):
    d = request.get_json() or {}
    msg = validar_escala(d)
    if msg:
        return erro(msg)
    con = db()
    esc = con.execute("SELECT * FROM escalas WHERE id=? AND excluida_em IS NULL", (eid,)).fetchone()
    if esc is None:
        return erro("Escala não encontrada.", 404)
    if esc["status"] == "publicada":
        return erro("Escala publicada não pode ser alterada. Reabra para edição ou duplique.", 409)
    resumo = d.get("resumo") or {}
    con.execute(
        """UPDATE escalas SET titulo=?, loja=?, inicio=?, fim=?, observacoes=?, erros=?, alertas=?,
                  atualizado_em=datetime('now','localtime') WHERE id=?""",
        (d["titulo"].strip(), d.get("loja"), d["inicio"], d["fim"], d.get("observacoes"),
         resumo.get("erros", 0), resumo.get("alertas", 0), eid))
    gravar_itens(con, eid, d.get("funcionarios") or [], d.get("itens") or [])
    snapshot(con, eid, d.get("descricao_versao") or "Alteração")
    registrar("Alteração", "escala", eid, d["titulo"].strip())
    con.commit()
    return jsonify({"ok": True})


@app.post("/api/escalas/<int:eid>/status")
def mudar_status(eid):
    status = (request.get_json() or {}).get("status")
    if status not in ("rascunho", "publicada"):
        return erro("Status inválido.")
    con = db()
    esc = con.execute("SELECT titulo FROM escalas WHERE id=? AND excluida_em IS NULL", (eid,)).fetchone()
    if esc is None:
        return erro("Escala não encontrada.", 404)
    con.execute("UPDATE escalas SET status=?, atualizado_em=datetime('now','localtime') WHERE id=?", (status, eid))
    snapshot(con, eid, "Publicação" if status == "publicada" else "Reaberta para edição")
    registrar("Publicação" if status == "publicada" else "Reabertura", "escala", eid, esc["titulo"])
    con.commit()
    return jsonify({"ok": True})


@app.post("/api/escalas/<int:eid>/duplicar")
def duplicar_escala(eid):
    d = request.get_json() or {}
    con = db()
    esc = con.execute("SELECT * FROM escalas WHERE id=? AND excluida_em IS NULL", (eid,)).fetchone()
    if esc is None:
        return erro("Escala não encontrada.", 404)
    novo_inicio = date.fromisoformat(d.get("inicio") or esc["inicio"])
    desloc = novo_inicio - date.fromisoformat(esc["inicio"])
    novo_fim = date.fromisoformat(esc["fim"]) + desloc
    titulo = (d.get("titulo") or f"{esc['titulo']} (cópia)").strip()
    cur = con.execute(
        "INSERT INTO escalas (titulo, loja, inicio, fim, observacoes) VALUES (?,?,?,?,?)",
        (titulo, esc["loja"], novo_inicio.isoformat(), novo_fim.isoformat(), esc["observacoes"]))
    novo = cur.lastrowid
    funcs = [r["funcionario_id"] for r in con.execute(
        "SELECT funcionario_id FROM escala_funcionarios WHERE escala_id=? ORDER BY ordem", (eid,))]
    itens = []
    for r in con.execute("SELECT * FROM escala_itens WHERE escala_id=?", (eid,)):
        it = item_saida(r)
        it["data"] = (date.fromisoformat(r["data"]) + desloc).isoformat()
        itens.append(it)
    gravar_itens(con, novo, funcs, itens)
    snapshot(con, novo, f"Duplicada de “{esc['titulo']}”")
    registrar("Duplicação", "escala", novo, f"{titulo} ← {esc['titulo']}")
    con.commit()
    return jsonify({"id": novo})


@app.post("/api/escalas/<int:eid>/resumo")
def atualizar_resumo(eid):
    """Guarda a contagem de violações/alertas calculada no navegador (sem gerar versão)."""
    d = request.get_json() or {}
    con = db()
    con.execute("UPDATE escalas SET erros=?, alertas=? WHERE id=?",
                (int(d.get("erros", 0)), int(d.get("alertas", 0)), eid))
    con.commit()
    return jsonify({"ok": True})


@app.delete("/api/escalas/<int:eid>")
def excluir_escala(eid):
    """Exclusão lógica: some das listas, mas continua no banco."""
    con = db()
    esc = con.execute("SELECT titulo FROM escalas WHERE id=? AND excluida_em IS NULL", (eid,)).fetchone()
    if esc is None:
        return erro("Escala não encontrada.", 404)
    con.execute("UPDATE escalas SET excluida_em=datetime('now','localtime') WHERE id=?", (eid,))
    registrar("Exclusão", "escala", eid, esc["titulo"])
    con.commit()
    return jsonify({"ok": True})


@app.get("/api/escalas/<int:eid>/versoes")
def versoes(eid):
    return jsonify(linhas(db().execute(
        "SELECT id, criado_em, resumo FROM escala_versoes WHERE escala_id=? ORDER BY id DESC", (eid,))))


@app.get("/api/versoes/<int:vid>")
def versao(vid):
    r = db().execute("SELECT * FROM escala_versoes WHERE id=?", (vid,)).fetchone()
    if r is None:
        return erro("Versão não encontrada.", 404)
    d = dict(r)
    d["snapshot"] = json.loads(d["snapshot"])
    return jsonify(d)


# --- feriados, configuração e log

@app.post("/api/feriados")
def criar_feriado():
    d = request.get_json() or {}
    try:
        date.fromisoformat(d.get("data") or "")
    except ValueError:
        return erro("Data inválida.")
    if not (d.get("nome") or "").strip():
        return erro("Informe o nome do feriado.")
    con = db()
    try:
        cur = con.execute("INSERT INTO feriados (data, nome, abrangencia) VALUES (?,?,?)",
                          (d["data"], d["nome"].strip(), d.get("abrangencia") or "Nacional"))
    except sqlite3.IntegrityError:
        return erro("Já existe um feriado nessa data.")
    registrar("Cadastro", "feriado", cur.lastrowid, f"{d['data']} {d['nome']}")
    con.commit()
    return jsonify({"id": cur.lastrowid})


@app.delete("/api/feriados/<int:fid>")
def excluir_feriado(fid):
    con = db()
    r = con.execute("SELECT * FROM feriados WHERE id=?", (fid,)).fetchone()
    if r is None:
        return erro("Feriado não encontrado.", 404)
    con.execute("DELETE FROM feriados WHERE id=?", (fid,))
    registrar("Exclusão", "feriado", fid, f"{r['data']} {r['nome']}")
    con.commit()
    return jsonify({"ok": True})


@app.put("/api/config")
def salvar_config():
    d = request.get_json() or {}
    con = db()
    for chave, valor in d.items():
        if chave in CONFIG_PADRAO:
            con.execute("INSERT OR REPLACE INTO config (chave, valor) VALUES (?,?)", (chave, str(valor)))
    registrar("Alteração", "config", None, ", ".join(f"{k}={v}" for k, v in d.items()))
    con.commit()
    return jsonify({r["chave"]: r["valor"] for r in con.execute("SELECT * FROM config")})


@app.get("/api/log")
def ver_log():
    limite = min(request.args.get("limite", 200, type=int), 1000)
    return jsonify(linhas(db().execute("SELECT * FROM log ORDER BY id DESC LIMIT ?", (limite,))))


@app.errorhandler(404)
def nao_encontrado(_e):
    if request.path.startswith("/api/"):
        return erro("Rota não encontrada.", 404)
    return index()


iniciar_banco()

PORTA_OCUPADA = 3  # código de saída usado por servidor/iniciar.ps1 para não ficar tentando de novo


def porta_em_uso(porta):
    with socket.socket() as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", porta)) == 0


if __name__ == "__main__":
    # python app.py             → modo local: só este computador, servidor do Flask
    # python app.py --producao  → servidor da empresa: Waitress, aceita acesso da rede
    producao = "--producao" in sys.argv
    if porta_em_uso(PORT):
        print(f"ERRO: a porta {PORT} já está em uso.", file=sys.stderr)
        sys.exit(PORTA_OCUPADA)
    print(f"Banco: {DB_PATH}", flush=True)
    if producao:
        from waitress import serve
        print(f"Escutando na rede: http://{socket.gethostname()}:{PORT}", flush=True)
        serve(app, host="0.0.0.0", port=PORT, threads=8)
    else:
        print(f"Modo local: http://localhost:{PORT}", flush=True)
        app.run(host="127.0.0.1", port=PORT, debug=False)
