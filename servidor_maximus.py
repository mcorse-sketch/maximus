#!/usr/bin/env python3
"""
Servidor de triagem — Clinica Maximus Medicina Masculina

Roda no computador principal da clinica. Serve o app de triagem e guarda o
historico dos ciclos num arquivo JSON local.

COMO USAR
  1. Deixe este arquivo na raiz do repositorio, ao lado da pasta 'apps/'
  2. Instale o Python 3 (python.org) se ainda nao tiver
  3. Na primeira vez, defina a senha de cada perfil (uma por vez):
        python3 servidor_maximus.py --definir-senha medico
        python3 servidor_maximus.py --definir-senha recepcao
        python3 servidor_maximus.py --definir-senha financeiro
     ou a mesma senha para todos de uma vez:
        python3 servidor_maximus.py --definir-senha-todos
     Pessoas com senha propria dentro de um perfil:
        python3 servidor_maximus.py --adicionar-usuario dra.ana medico
        python3 servidor_maximus.py --listar-usuarios
        python3 servidor_maximus.py --remover-usuario dra.ana
  4. Abra a pasta e execute:   python3 servidor_maximus.py
  5. O terminal mostra o endereco. Use esse endereco nos outros consultorios.

ACESSO
  Cada app pede a senha do seu perfil ao abrir. O perfil define o que ele
  pode ler e gravar (tabela PERMISSOES abaixo). As senhas ficam em
  'senhas.json', so como hash — nunca em texto — e fora do git.

Nao precisa instalar nada alem do Python. Nao usa internet.
"""

import json, os, re, shutil, socket, sys, threading, datetime
import getpass, hashlib, hmac, secrets, subprocess, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

PORTA = 8080
PASTA = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(PASTA, "apps", "triagem.html")
BANCO = os.path.join(PASTA, "banco_triagem.json")
BACKUPS = os.path.join(PASTA, "backups")

SENHAS = os.path.join(PASTA, "senhas.json")

# copia diaria criptografada fora do computador, no iCloud Drive. A senha fica
# no Chaveiro do macOS (servico abaixo); sem ela o backup nao abre.
ICLOUD = os.path.expanduser("~/Library/Mobile Documents/com~apple~CloudDocs/Maximus backups")
CHAVEIRO = "maximus-backup"
BACKUP_DIAS = 60

_lock = threading.Lock()
COD_OK = re.compile(r"^[A-Z0-9._\-]{1,40}$")

# ---------------------------------------------------------------- acesso
PERFIS = ("medico", "recepcao", "financeiro")
SESSAO_HORAS = 12          # um dia de clinica; depois o app pede a senha de novo
TENTATIVAS = 5             # erros de senha seguidos por endereco...
BLOQUEIO_MIN = 5           # ...bloqueiam novas tentativas por este tempo
ITERACOES = 200000

# rota -> perfis que podem usa-la. Gravar ciclo tem regra extra para a
# recepcao em do_POST: ela so grava o proprio registro, nunca ciclo clinico.
PERMISSOES = {
    ("GET", "paciente"):       {"medico", "recepcao", "financeiro"},
    ("GET", "pacientes"):      {"medico", "recepcao"},
    ("GET", "historico"):      {"medico", "recepcao", "financeiro"},
    ("GET", "triagens-hoje"):  {"medico", "recepcao", "financeiro"},
    ("GET", "proximo-codigo"): {"medico", "recepcao"},
    ("GET", "export"):         {"medico"},
    ("POST", "ciclo"):         {"medico", "recepcao"},
    ("PUT", "nota"):           {"medico"},
    ("PUT", "atendido"):       {"medico", "recepcao"},
    ("PUT", "identificacao"):  {"medico"},
}

# v2.5-P (LGPD): nome completo e data de nascimento existem so para o pedido de
# exames e o cabecalho do medico. O perfil financeiro nunca os recebe.
CAMPOS_IDENTIDADE = ("nome", "nascimento")
NASC_OK = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def sem_identidade(obj, perfil):
    if perfil != "financeiro":
        return obj
    if isinstance(obj, list):
        return [sem_identidade(x, perfil) for x in obj]
    if isinstance(obj, dict):
        return {k: v for k, v in obj.items() if k not in CAMPOS_IDENTIDADE}
    return obj

_sessoes = {}              # token -> (perfil, expira_em)
_falhas = {}               # endereco -> (erros seguidos, bloqueado_ate)
_lock_sessoes = threading.Lock()


def _hash(senha, sal):
    return hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), bytes.fromhex(sal), ITERACOES).hex()


SENHA_MINIMA = 4           # decisao do Dr. Marco (28/09/2026): senha curta aceita;
                           # o bloqueio apos TENTATIVAS erros continua valendo
USUARIO_OK = re.compile(r"^[a-z0-9._\-]{2,32}$")


def _ler_senhas():
    if not os.path.exists(SENHAS):
        return {}
    with open(SENHAS, "r", encoding="utf-8") as f:
        return json.load(f)


def _gravar_senhas(dados):
    tmp = SENHAS + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dados, f, indent=1)
    os.chmod(tmp, 0o600)
    os.replace(tmp, SENHAS)


def carregar_senhas():
    return _ler_senhas().get("perfis", {})


def carregar_usuarios():
    """Usuarios nomeados: cada pessoa com a propria senha, dentro de um perfil."""
    return _ler_senhas().get("usuarios", {})


def definir_senha(perfil, senha):
    dados = _ler_senhas()
    sal = secrets.token_hex(16)
    dados.setdefault("perfis", {})[perfil] = {"sal": sal, "hash": _hash(senha, sal)}
    _gravar_senhas(dados)


def definir_senha_todos(senha):
    """Mesma senha para os tres perfis e para todos os usuarios nomeados ja cadastrados."""
    dados = _ler_senhas()
    for p in PERFIS:
        sal = secrets.token_hex(16)
        dados.setdefault("perfis", {})[p] = {"sal": sal, "hash": _hash(senha, sal)}
    for nome, reg in dados.get("usuarios", {}).items():
        sal = secrets.token_hex(16)
        reg["sal"], reg["hash"] = sal, _hash(senha, sal)
    _gravar_senhas(dados)
    return list(PERFIS) + sorted(dados.get("usuarios", {}))


def adicionar_usuario(nome, perfil, senha):
    if not USUARIO_OK.match(nome):
        raise ValueError("nome de usuario invalido (use letras minusculas, numeros, ponto, hifen)")
    if perfil not in PERFIS:
        raise ValueError("perfil invalido")
    dados = _ler_senhas()
    sal = secrets.token_hex(16)
    dados.setdefault("usuarios", {})[nome] = {"perfil": perfil, "sal": sal, "hash": _hash(senha, sal)}
    _gravar_senhas(dados)


def remover_usuario(nome):
    dados = _ler_senhas()
    if nome not in dados.get("usuarios", {}):
        return False
    del dados["usuarios"][nome]
    _gravar_senhas(dados)
    return True


def confere_senha(perfil, senha):
    """Devolve quem entrou: o proprio perfil (senha do perfil) ou o nome do
    usuario desse perfil cuja senha confere. None se nada confere."""
    reg = carregar_senhas().get(perfil)
    if reg and hmac.compare_digest(_hash(senha, reg["sal"]), reg["hash"]):
        return perfil
    for nome, u in sorted(carregar_usuarios().items()):
        if u.get("perfil") == perfil and hmac.compare_digest(_hash(senha, u["sal"]), u["hash"]):
            return nome
    return None


def abre_sessao(perfil):
    token = secrets.token_urlsafe(32)
    with _lock_sessoes:
        agora = time.time()
        for t in [t for t, (_, exp) in _sessoes.items() if exp < agora]:
            del _sessoes[t]
        _sessoes[token] = (perfil, agora + SESSAO_HORAS * 3600)
    return token


def perfil_do_token(token):
    with _lock_sessoes:
        s = _sessoes.get(token or "")
        if not s:
            return None
        if s[1] < time.time():
            del _sessoes[token]
            return None
        return s[0]


class BancoIlegivel(Exception):
    """v2.5-M: o banco existe mas nao abre. O servidor PARA de ler e gravar (falha fechada)
    ate o arquivo ser restaurado — antes ele seguia com um banco vazio e a primeira consulta
    gravada sobrescrevia o historico inteiro."""


# estado mostrado em /api/health e no aviso dos tres apps
_estado = {"banco": None, "backup_local": None, "backup_icloud": None}
_lock_estado = threading.Lock()
def _arq_estado():
    # calculado na hora: segue BACKUPS (os testes apontam BACKUPS para uma pasta temporaria)
    return os.path.join(BACKUPS, "estado_backup.json")


ICLOUD_RETENTA = 3600   # segundos entre novas tentativas do iCloud no mesmo dia


def _avisa_mac(titulo, texto):
    """Notificacao do macOS (Central de Notificacoes); em outro sistema, nada."""
    if sys.platform != "darwin":
        return
    try:
        script = 'display notification "%s" with title "%s" sound name "Basso"' % (
            texto.replace('"', "'"), titulo.replace('"', "'"))
        subprocess.Popen(["osascript", "-e", script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def _ha_backup_com_conteudo():
    try:
        return any(f.startswith("banco_") and os.path.getsize(os.path.join(BACKUPS, f)) > 20
                   for f in os.listdir(BACKUPS))
    except OSError:
        return False


def carregar():
    if not os.path.exists(BANCO):
        return {"pacientes": {}}
    try:
        mtime = os.path.getmtime(BANCO)
    except OSError:
        mtime = None
    with _lock_estado:
        ruim = _estado["banco"]
    # mesmo arquivo que ja falhou: nem tenta de novo (e nao gera outra copia)
    if ruim and ruim.get("mtime") == mtime:
        raise BancoIlegivel(ruim["erro"])
    try:
        with open(BANCO, "r", encoding="utf-8") as f:
            texto = f.read()
        # arquivo vazio (0 bytes): banco novo — a nao ser que ja exista backup com dados,
        # caso em que o vazio e perda, nao comeco (v2.5-M)
        if not texto.strip():
            if _ha_backup_com_conteudo():
                raise ValueError("arquivo vazio, mas ha backups com dados")
            dados = {"pacientes": {}}
        else:
            dados = json.loads(texto)
        if not isinstance(dados, dict):
            raise ValueError("banco nao e um objeto")
        dados.setdefault("pacientes", {})
        if not isinstance(dados["pacientes"], dict):
            raise ValueError("'pacientes' nao e um objeto")
        if ruim:
            with _lock_estado:
                _estado["banco"] = None
            print("  banco legivel de novo — leitura e gravacao liberadas")
        return dados
    except Exception as e:
        quebrado = BANCO + ".corrompido-" + datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        try:
            shutil.copy2(BANCO, quebrado)
        except OSError:
            quebrado = None
        erro = "banco ilegivel (%s)" % (str(e)[:120] or type(e).__name__)
        with _lock_estado:
            _estado["banco"] = {"erro": erro, "copia": quebrado, "mtime": mtime,
                                "em": datetime.datetime.now().isoformat(timespec="seconds")}
        print("!! " + erro + (" — copia em " + quebrado if quebrado else ""))
        print("!! LEITURA E GRAVACAO SUSPENSAS. Nada sera gravado ate restaurar o banco:")
        print("!!   python3 scripts/conferir_restauracao.py   (confere o ultimo backup)")
        _avisa_mac("Maximus — banco ilegível", "Gravação suspensa. Restaure o banco a partir do backup.")
        raise BancoIlegivel(erro)


def gravar(dados):
    """Grava em arquivo temporario e renomeia: nunca deixa o banco pela metade."""
    tmp = BANCO + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, BANCO)


def backup_do_dia():
    if not os.path.exists(BANCO):
        return
    os.makedirs(BACKUPS, exist_ok=True)
    hoje = datetime.date.today().isoformat()
    alvo = os.path.join(BACKUPS, "banco_" + hoje + ".json")
    if not os.path.exists(alvo):
        try:
            shutil.copy2(BANCO, alvo)
            _registra_backup("backup_local", None)
        except OSError as e:
            _registra_backup("backup_local", "copia local falhou: %s" % e)
            return
        _tenta_icloud(alvo, hoje)
        # mantem os 60 backups mais recentes (so os arquivos banco_*)
        arqs = sorted(f for f in os.listdir(BACKUPS) if re.match(r"^banco_\d{4}-\d{2}-\d{2}\.json$", f))
        for velho in arqs[:-60]:
            try:
                os.remove(os.path.join(BACKUPS, velho))
            except OSError:
                pass
    else:
        # v2.5-M: o iCloud falhou hoje (ou nunca rodou hoje)? tenta de novo, no maximo 1x/hora
        with _lock_estado:
            ic = _estado.get("backup_icloud") or {}
        if not (ic.get("ok") and ic.get("dia") == hoje):
            try:
                ultima = datetime.datetime.fromisoformat(ic.get("em")).timestamp() if ic.get("em") else 0
            except (TypeError, ValueError):
                ultima = 0
            if time.time() - ultima >= ICLOUD_RETENTA:
                _tenta_icloud(alvo, hoje)


def _tenta_icloud(alvo, hoje):
    with _lock_estado:
        antes = (_estado.get("backup_icloud") or {}).get("motivo")
    motivo = backup_fora(alvo, hoje)
    _registra_backup("backup_icloud", motivo)
    print("  backup do dia no iCloud: " + ("ok" if not motivo else "NAO FEITO — " + motivo))
    if motivo and motivo != antes:     # notifica a falha nova, nao a mesma a cada hora
        _avisa_mac("Maximus — backup do iCloud NÃO feito", motivo)


def _registra_backup(qual, motivo):
    """Guarda o resultado do ultimo backup (local ou iCloud) em memoria e em disco,
    para o aviso dos apps sobreviver a um reinicio do servidor."""
    reg = {"ok": not motivo, "motivo": motivo, "em": datetime.datetime.now().isoformat(timespec="seconds"),
           "dia": datetime.date.today().isoformat()}
    with _lock_estado:
        _estado[qual] = reg
        tudo = {k: _estado[k] for k in ("backup_local", "backup_icloud")}
    try:
        os.makedirs(BACKUPS, exist_ok=True)
        tmp = _arq_estado() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(tudo, f, ensure_ascii=False, indent=1)
        os.replace(tmp, _arq_estado())
    except OSError:
        pass


def _le_estado_backup():
    try:
        with open(_arq_estado(), "r", encoding="utf-8") as f:
            d = json.load(f)
        with _lock_estado:
            for k in ("backup_local", "backup_icloud"):
                if isinstance(d.get(k), dict) and not _estado.get(k):
                    _estado[k] = d[k]
    except (OSError, ValueError):
        pass


def _ultimo_dia(pasta, padrao):
    try:
        dias = sorted(m.group(1) for m in (re.match(padrao, f) for f in os.listdir(pasta)) if m)
        return dias[-1] if dias else None
    except OSError:
        return None


def _versao_app():
    """Versao do triagem.html servido (data-versao do cabecalho) — confere o build no Mac."""
    try:
        with open(APP, "r", encoding="utf-8") as f:
            m = re.search(r'id="versaoApp" data-versao="([^"]+)"', f.read(200000))
        return m.group(1) if m else None
    except OSError:
        return None


def saude():
    """v2.5-M: o que /api/health devolve — banco legivel? backups em dia? Sem caminhos nem dados
    de paciente (a rota e aberta, como antes). 'alertas' vira o aviso no topo dos tres apps."""
    alertas = []
    with _lock_estado:
        banco, bl, bi = _estado["banco"], _estado["backup_local"], _estado["backup_icloud"]
    if banco:
        alertas.append({"nivel": "grave", "texto": "Banco ilegível — leitura e gravação suspensas para não perder o histórico. "
                        "Nada desta tela será gravado. Restaurar o banco a partir do backup (scripts/conferir_restauracao.py)."})
    hoje = datetime.date.today().isoformat()
    dia_banco = None
    try:
        dia_banco = datetime.date.fromtimestamp(os.path.getmtime(BANCO)).isoformat() if os.path.exists(BANCO) else None
    except OSError:
        pass
    ult_local = _ultimo_dia(BACKUPS, r"^banco_(\d{4}-\d{2}-\d{2})\.json$")
    if bl and not bl.get("ok"):
        alertas.append({"nivel": "grave", "texto": "Backup local de " + bl.get("dia", "?") + " falhou: " + str(bl.get("motivo"))})
    elif dia_banco and ult_local and dia_banco > ult_local:
        alertas.append({"nivel": "aviso", "texto": "Backup local atrasado: o último é de " + ult_local + "."})
    icloud_ok = os.path.isdir(os.path.dirname(ICLOUD))
    if not icloud_ok:
        alertas.append({"nivel": "aviso", "texto": "Backup do iCloud inativo: iCloud Drive não encontrado neste Mac."})
    elif bi and not bi.get("ok"):
        alertas.append({"nivel": "grave", "texto": "Backup do iCloud de " + bi.get("dia", "?") + " NÃO foi feito: " + str(bi.get("motivo"))})
    else:
        ult_ic = _ultimo_dia(ICLOUD, r"^banco_(\d{4}-\d{2}-\d{2})\.json\.enc$")
        if dia_banco and (not ult_ic or dia_banco > ult_ic) and ult_local and ult_local >= (ult_ic or ""):
            alertas.append({"nivel": "aviso", "texto": "Backup do iCloud atrasado: o último é de " + (ult_ic or "nunca") + "."})
    return {"banco": "ilegivel" if banco else "ok", "app": _versao_app(),
            "backupLocal": {"ultimo": ult_local, "ok": (bl or {}).get("ok", True)},
            "backupIcloud": {"ativo": icloud_ok, "ok": (bi or {}).get("ok", True),
                             "ultimo": _ultimo_dia(ICLOUD, r"^banco_(\d{4}-\d{2}-\d{2})\.json\.enc$") if icloud_ok else None},
            "hoje": hoje, "alertas": alertas}


def carregar_demo(origem):
    """Converte data/banco_demonstracao.json (formato do modo Claude, com as
    colecoes pacientes/<COD>/ciclos, recepcao e codigos) para o formato deste
    servidor, com a fila de demonstracao trazida para hoje. Nunca sobrescreve
    um banco existente: demonstracao e dado real nao se misturam."""
    if os.path.exists(BANCO):
        raise SystemExit("Ja existe um banco em %s. A demonstracao so e carregada num banco vazio;\n"
                         "mova o banco atual para outra pasta antes, se for o caso." % BANCO)
    with open(origem, "r", encoding="utf-8") as f:
        demo = json.load(f)
    hoje = datetime.date.today().isoformat()
    pacientes = {}
    for cod, v in demo.get("pacientes", {}).items():
        pacientes[cod] = list(v.get("ciclos", []) if isinstance(v, dict) else v)
    for r in demo.get("recepcao", []):
        r = dict(r)
        hora = r.get("hora") or "08:00"
        r["dataLocal"] = hoje
        r["data"] = "%sT%s:00" % (hoje, hora)
        pacientes.setdefault(r["codigo"], []).append(r)
    for ciclos in pacientes.values():
        ciclos.sort(key=lambda c: str(c.get("data", "")))
    gravar({"pacientes": pacientes})
    return len(pacientes)


def senha_backup():
    # MAXIMUS_SENHA_BACKUP serve aos testes e a quem restaura em outro Mac
    s = os.environ.get("MAXIMUS_SENHA_BACKUP")
    if s:
        return s
    try:
        r = subprocess.run(["security", "find-generic-password", "-s", CHAVEIRO, "-a", "backup", "-w"],
                           capture_output=True, text=True, timeout=15)
        return r.stdout.rstrip("\n") if r.returncode == 0 and r.stdout.strip() else None
    except Exception:
        return None


def _openssl(decifrar, senha, entrada, saida):
    cmd = ["openssl", "enc"] + (["-d"] if decifrar else ["-salt"]) + [
        "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-in", entrada, "-out", saida, "-pass", "stdin"]
    try:
        r = subprocess.run(cmd, input=senha + "\n", capture_output=True, text=True, timeout=300)
        return r.returncode == 0
    except Exception:
        return False


def backup_fora(origem, dia):
    """Copia criptografada de 'origem' para o iCloud. Devolve None se deu certo,
    ou o motivo. Nunca levanta excecao: backup falho nao pode travar a gravacao."""
    try:
        if not os.path.isdir(os.path.dirname(ICLOUD)):
            return "iCloud Drive nao encontrado neste Mac"
        senha = senha_backup()
        if not senha:
            return "senha do backup nao definida (python3 servidor_maximus.py --definir-senha-backup)"
        os.makedirs(ICLOUD, exist_ok=True)
        alvo = os.path.join(ICLOUD, "banco_%s.json.enc" % dia)
        tmp = alvo + ".tmp"
        if not _openssl(False, senha, origem, tmp):
            if os.path.exists(tmp):
                os.remove(tmp)
            return "falha ao criptografar (openssl)"
        os.replace(tmp, alvo)
        antigos = sorted(f for f in os.listdir(ICLOUD) if re.match(r"^banco_\d{4}-\d{2}-\d{2}\.json\.enc$", f))
        for velho in antigos[:-BACKUP_DIAS]:
            try:
                os.remove(os.path.join(ICLOUD, velho))
            except OSError:
                pass
        return None
    except Exception as e:
        return "erro inesperado: %s" % e


def restaurar_backup(arquivo, destino, senha):
    """Decifra um backup do iCloud para 'destino' e confere que e um banco valido."""
    if os.path.exists(destino):
        raise SystemExit("%s ja existe. Escolha outro destino; a restauracao nunca sobrescreve." % destino)
    tmp = destino + ".tmp"
    ok = _openssl(True, senha, arquivo, tmp)
    try:
        with open(tmp, "r", encoding="utf-8") as f:
            dados = json.load(f) if ok else None
    except Exception:
        dados = None
    if not isinstance(dados, dict) or "pacientes" not in dados:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise SystemExit("Nao foi possivel abrir o backup: senha errada ou arquivo danificado.")
    os.replace(tmp, destino)
    return len(dados["pacientes"])


def _itens(total, n_itens, teto, minimo_primeiro):
    base, resto = divmod(total, n_itens)
    v = [min(teto, base + (1 if k < resto else 0)) for k in range(n_itens)]
    v[0] = max(minimo_primeiro, v[0])
    return v


def fila_ficticia(n, sorteio=None):
    """Poe n pacientes ficticios (demo) na fila da recepcao de hoje, como se
    tivessem acabado de responder o questionario no tablet."""
    import random
    sorteio = sorteio or random.Random()
    hoje = datetime.date.today()
    with _lock:
        dados = carregar()
        ja = {c.get("codigo") for v in dados["pacientes"].values() for c in v
              if c.get("tipo") == "recepcao" and c.get("dataLocal") == hoje.isoformat()}
        candidatos = [cod for cod, v in dados["pacientes"].items()
                      if cod not in ja and v and all(c.get("demo") for c in v)]
        if len(candidatos) < n:
            raise SystemExit("Ha so %d pacientes ficticios fora da fila de hoje." % len(candidatos))
        escolhidos = sorteio.sample(sorted(candidatos), n)
        linha_para_queixa = {"DE": "de", "EP": "ep", "DUO": "ambos", "hipogonadismo": "libido",
                             "preenchimento": "preench", "uro": "clinica", "emagrecimento": "emag"}
        for k, cod in enumerate(escolhidos):
            ciclos = dados["pacientes"][cod]
            rec_ant = [c for c in ciclos if c.get("tipo") == "recepcao"]
            clin = [c for c in ciclos if c.get("tipo") != "recepcao"]
            ult = clin[-1] if clin else {}
            queixa = (rec_ant[-1].get("queixaRecepcao") if rec_ant else None) or \
                linha_para_queixa.get(ult.get("linha"), "de")
            quando = datetime.datetime.combine(hoje, datetime.time(8, 0)) + datetime.timedelta(minutes=35 * k)
            reg = {"codigo": cod, "tipo": "recepcao", "linha": "recepcao", "demo": True,
                   "data": quando.isoformat(), "dataLocal": hoje.isoformat(), "dataBR": hoje.strftime("%d/%m/%Y"),
                   "hora": quando.strftime("%H:%M"), "queixaRecepcao": queixa, "retorno": True,
                   "diasDesdeUltima": (hoje - datetime.date.fromisoformat(str(ult.get("dataLocal") or hoje))).days,
                   "usoRelatado": sorteio.choice(["total", "total", "parcial", "baixa"]),
                   "efeitoRelatado": sorteio.choice(["nao", "nao", "leve", "atrap"]),
                   "satisfRelatada": sorteio.randint(3, 10), "revisar": sorteio.random() < 0.15,
                   "dificuldade": None, "leuTermo": False, "retornoPreench": None, "adam": [],
                   "iief": None, "pedt": None, "respostas": {}}
            for campo in ("iniciais", "telefone", "email", "medidas", "nome", "nascimento"):
                reg[campo] = rec_ant[-1].get(campo) if rec_ant else None
            if queixa in ("de", "ambos", "libido"):
                t = sorteio.randint(8, 22)
                reg["iief"] = t
                reg["respostas"].update(zip(["i0", "i1", "i2", "i3", "i4"], _itens(t, 5, 5, 1)))
            if queixa in ("ep", "ambos"):
                t = sorteio.randint(5, 17)
                reg["pedt"] = t
                reg["respostas"].update(zip(["p0", "p1", "p2", "p3", "p4"], _itens(t, 5, 4, 0)))
            ciclos.append(reg)
        gravar(dados)
    return escolhidos


def apagar_ficticios():
    """Remove todo registro com demo:true e os pacientes que ficarem vazios.
    Guarda uma copia do banco antes, ao lado dele."""
    with _lock:
        dados = carregar()
        shutil.copy2(BANCO, BANCO + ".antes-de-apagar-ficticios")
        removidos = 0
        for cod in list(dados["pacientes"]):
            antes = len(dados["pacientes"][cod])
            dados["pacientes"][cod] = [c for c in dados["pacientes"][cod] if not c.get("demo")]
            removidos += antes - len(dados["pacientes"][cod])
            if not dados["pacientes"][cod]:
                del dados["pacientes"][cod]
        gravar(dados)
    return removidos, len(dados["pacientes"])


def so_ficticio(ciclos):
    """Paciente cujos registros sao todos ficticios (demo:true)."""
    return bool(ciclos) and all(c.get("demo") for c in ciclos)


def _desloca(reg, dias):
    """Traz as datas de um registro do banco de teste para perto de hoje."""
    reg = dict(reg)
    delta = datetime.timedelta(days=dias)
    d = reg.get("data")
    if isinstance(d, str) and d:
        try:
            utc = d.endswith("Z")
            x = datetime.datetime.fromisoformat(d[:-1] if utc else d) + delta
            reg["data"] = x.isoformat(timespec="milliseconds") + ("Z" if utc else "")
        except ValueError:
            pass
    dl = reg.get("dataLocal")
    if isinstance(dl, str) and len(dl) == 10:
        try:
            x = datetime.date.fromisoformat(dl) + delta
            reg["dataLocal"] = x.isoformat()
            reg["dataBR"] = x.strftime("%d/%m/%Y")
        except ValueError:
            pass
    return reg


def carregar_teste(origem):
    """Carrega o banco de TESTE ficticio (data/banco_teste.json) no banco atual.

    - copia o banco atual antes (banco_triagem.json.antes-carregar-teste-AAAAMMDDHHMM);
    - MESCLA: nenhum registro real e apagado ou alterado;
    - recusa tudo se algum codigo do teste ja tiver registro real;
    - substitui os registros ficticios desses mesmos codigos (recarregar e seguro);
    - traz as datas para hoje: a fila da recepcao do teste vira a fila de hoje;
    - todo registro carregado leva demo:true (sai com --apagar-ficticios)."""
    with open(origem, "r", encoding="utf-8") as f:
        teste = json.load(f)
    ref = datetime.date.fromisoformat(teste["referencia"])
    dias = (datetime.date.today() - ref).days
    copia = None
    with _lock:
        dados = carregar()
        conflito = sorted(cod for cod in teste["pacientes"]
                          if any(not c.get("demo") for c in dados["pacientes"].get(cod, [])))
        if conflito:
            raise SystemExit("Nada foi carregado: estes codigos ja tem registros REAIS no banco: %s.\n"
                             "O banco de teste usa MX9101-MX9140; renomeie no arquivo de teste se precisar."
                             % ", ".join(conflito))
        if os.path.exists(BANCO):
            copia = BANCO + ".antes-carregar-teste-" + datetime.datetime.now().strftime("%Y%m%d%H%M%S")
            shutil.copy2(BANCO, copia)
        reais = sum(1 for v in dados["pacientes"].values() if v and not so_ficticio(v))
        for cod, regs in teste["pacientes"].items():
            novos = []
            for r in regs:
                r = _desloca(r, dias)
                r["demo"] = True
                novos.append(r)
            novos.sort(key=lambda c: str(c.get("data", "")))
            dados["pacientes"][cod] = novos
        gravar(dados)
    hoje = datetime.date.today().isoformat()
    fila = sorted(cod for cod, regs in teste["pacientes"].items()
                  if any(r.get("tipo") == "recepcao" and _desloca(r, dias).get("dataLocal") == hoje for r in regs))
    return {"pacientes": len(teste["pacientes"]), "registros": sum(len(v) for v in teste["pacientes"].values()),
            "fila": fila, "reais": reais, "copia": copia, "dias": dias}


def ip_da_rede():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


class Handler(BaseHTTPRequestHandler):
    server_version = "TriagemMaximus/1.0"

    def log_message(self, fmt, *args):
        # args[0] e a linha do pedido, ou o codigo numerico quando vem de send_error
        if "/api/" in (str(args[0]) if args else ""):
            sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        # CORS aberto e seguro aqui: o acesso depende do token no cabecalho,
        # que outro site nao tem como ler. Serve ao app aberto de arquivo local.
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")

    def _json(self, obj, codigo=200):
        corpo = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(corpo)

    def _protegido(self, fn):
        """v2.5-M: banco ilegivel vira 503 com o motivo, em qualquer rota — nunca resposta vazia
        que o app confunda com "paciente sem historico"."""
        try:
            fn()
        except BancoIlegivel as e:
            try:
                self._json({"erro": str(e) + " — leitura e gravacao suspensas", "banco": "ilegivel"}, 503)
            except Exception:
                pass

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _corpo_json(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            if n <= 0 or n > 200000:
                raise ValueError
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return None

    def _token(self):
        cab = self.headers.get("Authorization", "")
        return cab[7:].strip() if cab.startswith("Bearer ") else ""

    def _autoriza(self, metodo, rota):
        """Devolve o perfil da sessao, ou responde 401/403 e devolve None."""
        perfil = perfil_do_token(self._token())
        if not perfil:
            self._json({"erro": "senha necessaria"}, 401)
            return None
        if perfil not in PERMISSOES.get((metodo, rota), set()):
            self._json({"erro": "perfil sem acesso a esta funcao"}, 403)
            return None
        return perfil

    def _login(self):
        ip = self.client_address[0]
        with _lock_sessoes:
            erros, ate = _falhas.get(ip, (0, 0))
        if ate > time.time():
            self._json({"erro": "muitas tentativas; aguarde alguns minutos"}, 429)
            return
        corpo = self._corpo_json() or {}
        perfil = str(corpo.get("perfil", ""))
        senha = str(corpo.get("senha", ""))
        quem = confere_senha(perfil, senha) if (perfil in PERFIS and senha) else None
        if quem:
            with _lock_sessoes:
                _falhas.pop(ip, None)
            token = abre_sessao(perfil)
            print("  entrada: %s (%s)" % (perfil if quem == perfil else "%s / %s" % (perfil, quem), ip))
            self._json({"ok": True, "token": token, "perfil": perfil, "horas": SESSAO_HORAS})
            return
        with _lock_sessoes:
            erros += 1
            _falhas[ip] = (erros, time.time() + BLOQUEIO_MIN * 60 if erros >= TENTATIVAS else 0)
        print("  senha errada: %s (%s), tentativa %d" % (perfil or "?", ip, erros))
        self._json({"erro": "senha incorreta"}, 401)

    def _pagina(self, nome):
        alvo = os.path.join(PASTA, nome)
        if not os.path.exists(alvo):
            self.send_error(404, nome + " nao encontrado")
            return
        with open(alvo, "rb") as f:
            corpo = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        self._protegido(self._do_GET)

    def _do_GET(self):
        caminho = self.path.split("?")[0]

        if caminho in ("/recepcao", "/recepcao.html"):
            return self._pagina(os.path.join("apps", "recepcao.html"))
        if caminho in ("/financeiro", "/financeiro.html"):
            return self._pagina(os.path.join("apps", "financeiro.html"))
        if caminho in ("/", "/index.html", "/app"):
            if not os.path.exists(APP):
                self.send_error(404, "apps/triagem.html nao encontrado")
                return
            with open(APP, "rb") as f:
                corpo = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(corpo)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(corpo)
            return

        if caminho == "/api/health":
            # v2.5-M: continua 200 mesmo com o banco ilegivel — os apps entram e mostram o aviso
            self._json(dict({"ok": True, "versao": 2, "senha": True}, **saude()))
            return

        if caminho == "/api/sessao":
            perfil = perfil_do_token(self._token())
            if perfil:
                self._json({"ok": True, "perfil": perfil})
            else:
                self._json({"erro": "senha necessaria"}, 401)
            return

        perfil_get = None
        if caminho.startswith("/api/") and not caminho.startswith("/api/triagem/"):
            rota = caminho[len("/api/"):].split("/")[0]
            if ("GET", rota) in PERMISSOES:
                perfil_get = self._autoriza("GET", rota)
                if not perfil_get:
                    return

        if caminho.startswith("/api/paciente/"):
            cod = caminho[len("/api/paciente/"):].upper()
            if not COD_OK.match(cod):
                self._json({"erro": "codigo invalido"}, 400)
                return
            with _lock:
                dados = carregar()
            ciclos = dados["pacientes"].get(cod, [])
            if not ciclos:
                self._json({"ciclo": None, "total": 0}, 404)
                return
            self._json({"ciclo": sem_identidade(ciclos[-1], perfil_get), "total": len(ciclos),
                        "ultimaData": ciclos[-1].get("data")})
            return

        if caminho.startswith("/api/historico/"):
            cod = caminho[len("/api/historico/"):].upper()
            if not COD_OK.match(cod):
                self._json({"erro": "codigo invalido"}, 400)
                return
            with _lock:
                dados = carregar()
            self._json({"ciclos": sem_identidade(dados["pacientes"].get(cod, []), perfil_get)})
            return

        if caminho == "/api/triagens-hoje":
            with _lock:
                dados = carregar()
            hoje = datetime.date.today().isoformat()
            fila = []
            for cod, ciclos in dados["pacientes"].items():
                for c in ciclos:
                    if c.get("tipo") != "recepcao":
                        continue
                    # o cliente grava dataLocal; registros antigos caem no ISO
                    dia = c.get("dataLocal") or str(c.get("data", ""))[:10]
                    if dia == hoje:
                        fila.append(c)
            fila.sort(key=lambda x: x.get("data", ""))
            self._json({"triagens": sem_identidade(fila, perfil_get)})
            return

        if caminho == "/api/pacientes":
            # lista para escolher o paciente no retorno: codigo, iniciais mais
            # recentes, data do ultimo registro e quantos ciclos clinicos tem
            with _lock:
                dados = carregar()
            lista = []
            for cod, ciclos in dados["pacientes"].items():
                ord_ = sorted(ciclos, key=lambda c: str(c.get("data", "")))
                ini = next((c.get("iniciais") for c in reversed(ord_) if c.get("iniciais")), None)
                clin = [c for c in ord_ if c.get("tipo") != "recepcao" and c.get("linha") != "recepcao"]
                lista.append({"codigo": cod, "iniciais": ini, "clinicos": len(clin),
                              "ultimaData": ord_[-1].get("data") if ord_ else None,
                              "ficticio": so_ficticio(ciclos)})
            lista.sort(key=lambda p: p["codigo"])
            self._json({"pacientes": lista})
            return

        if caminho == "/api/proximo-codigo":
            with _lock:
                dados = carregar()
            # paciente so com registros ficticios (banco de teste, fila
            # ficticia) nao empurra a numeracao dos reais, mas o codigo dele
            # continua ocupado: o proximo nunca colide
            maior = 0
            for cod, ciclos in dados["pacientes"].items():
                m = re.search(r"(\d+)\s*$", cod)
                if m and not so_ficticio(ciclos):
                    maior = max(maior, int(m.group(1)))
            prox = maior + 1
            while ("MX%04d" % prox) in dados["pacientes"]:
                prox += 1
            self._json({"codigo": "MX%04d" % prox})
            return

        if caminho == "/api/export":
            with _lock:
                dados = carregar()
            self._json(dados)
            return

        self.send_error(404)

    def _put_atendido(self, cod):
        """PUT /api/triagem/<codigo>/atendido — marca (ou desmarca) como
        atendido o registro de recepcao de HOJE daquele paciente. Corpo:
        {"atendido": true|false, "recepcao": "opcional — data do registro",
         "ciclo": "opcional — data do ciclo clinico gravado"}.
        Nunca apaga nada: so acrescenta os campos atendido/atendidoEm e uma
        linha em atendimentoLog. Desmarcar (atendido=false) devolve a fila."""
        perfil = self._autoriza("PUT", "atendido")
        if not perfil:
            return
        cod = cod.upper()
        if not COD_OK.match(cod):
            self._json({"erro": "codigo invalido"}, 400)
            return
        corpo = self._corpo_json()
        if not isinstance(corpo, dict):
            self._json({"erro": "corpo invalido"}, 400)
            return
        marca = corpo.get("atendido", True)
        if not isinstance(marca, bool):
            self._json({"erro": "atendido deve ser true ou false"}, 400)
            return
        hoje = datetime.date.today().isoformat()
        with _lock:
            dados = carregar()
            ciclos = dados["pacientes"].get(cod) or []
            do_dia = [c for c in ciclos if c.get("tipo") == "recepcao"
                      and (c.get("dataLocal") or str(c.get("data", ""))[:10]) == hoje]
            alvo = None
            if corpo.get("recepcao"):
                alvo = next((c for c in do_dia if c.get("data") == corpo["recepcao"]), None)
            elif do_dia:
                # o mais recente ainda no estado oposto; senao o mais recente
                pend = [c for c in do_dia if bool(c.get("atendido")) != marca]
                alvo = (pend or do_dia)[-1]
            if alvo is None:
                self._json({"erro": "sem registro da recepcao de hoje para este paciente"}, 404)
                return
            backup_do_dia()
            agora = datetime.datetime.now().isoformat()
            alvo["atendido"] = marca
            if marca:
                alvo["atendidoEm"] = agora
                if corpo.get("ciclo"):
                    alvo["atendidoCiclo"] = str(corpo["ciclo"])
            else:
                alvo["devolvidoEm"] = agora
            log = alvo.get("atendimentoLog") or []
            log.append({"atendido": marca, "em": agora, "perfil": perfil})
            alvo["atendimentoLog"] = log
            gravar(dados)
        print("  %s: %s" % ("atendido" if marca else "devolvido a fila", cod))
        self._json({"ok": True, "codigo": cod, "atendido": marca, "recepcao": alvo.get("data")})

    def _put_identificacao(self, cod):
        """PUT /api/triagem/<codigo>/identificacao — v2.5-P. O medico informa
        nome completo e/ou data de nascimento (AAAA-MM-DD) depois de gravada a
        conduta, no pedido de exames. Entra no registro clinico mais recente
        (ou no mais recente de qualquer tipo). So grava campo preenchido;
        nunca apaga."""
        if not self._autoriza("PUT", "identificacao"):
            return
        cod = cod.upper()
        if not COD_OK.match(cod):
            self._json({"erro": "codigo invalido"}, 400)
            return
        corpo = self._corpo_json()
        if not isinstance(corpo, dict):
            self._json({"erro": "corpo invalido"}, 400)
            return
        novo = {}
        nome = corpo.get("nome")
        if isinstance(nome, str) and nome.strip():
            novo["nome"] = " ".join(nome.split())[:120]
        nasc = corpo.get("nascimento")
        if isinstance(nasc, str) and nasc.strip():
            if not NASC_OK.match(nasc.strip()):
                self._json({"erro": "nascimento deve ser AAAA-MM-DD"}, 400)
                return
            novo["nascimento"] = nasc.strip()
        if not novo:
            self._json({"erro": "nada para gravar"}, 400)
            return
        with _lock:
            dados = carregar()
            ciclos = dados["pacientes"].get(cod) or []
            if not ciclos:
                self._json({"erro": "paciente nao encontrado"}, 404)
                return
            clin = [c for c in ciclos if c.get("tipo") != "recepcao"]
            alvo = (clin or ciclos)[-1]
            backup_do_dia()
            alvo.update(novo)
            gravar(dados)
        print("  identificacao: %s (%s)" % (cod, ", ".join(sorted(novo))))
        self._json({"ok": True, "codigo": cod, "gravado": sorted(novo)})

    def do_PUT(self):
        self._protegido(self._do_PUT)

    def _do_PUT(self):
        """PUT /api/triagem/<codigo>/nota  — anexa ou substitui a nota medica
        do ciclo mais recente daquele paciente. Corpo: {"nota": "...",
        "autor": "opcional", "ciclo": "opcional — id do ciclo"}
        PUT /api/triagem/<codigo>/atendido — ver _put_atendido."""
        caminho = self.path.split("?")[0]
        ma = re.match(r"^/api/triagem/([^/]+)/atendido$", caminho)
        if ma:
            self._put_atendido(ma.group(1))
            return
        mi = re.match(r"^/api/triagem/([^/]+)/identificacao$", caminho)
        if mi:
            self._put_identificacao(mi.group(1))
            return
        m = re.match(r"^/api/triagem/([^/]+)/nota$", caminho)
        if not m:
            self.send_error(404)
            return
        if not self._autoriza("PUT", "nota"):
            return
        cod = m.group(1).upper()
        if not COD_OK.match(cod):
            self._json({"erro": "codigo invalido"}, 400)
            return
        corpo = self._corpo_json()
        if not isinstance(corpo, dict):
            self._json({"erro": "corpo invalido"}, 400)
            return
        nota = str(corpo.get("nota", "")).strip()
        if not nota:
            self._json({"erro": "nota vazia"}, 400)
            return

        with _lock:
            dados = carregar()       # v2.5-M: le (e falha fechado) antes de copiar
            backup_do_dia()
            ciclos = dados["pacientes"].get(cod)
            if not ciclos:
                self._json({"erro": "paciente sem registros"}, 404)
                return
            # por padrao, o ciclo clinico mais recente; nunca um registro de recepcao
            alvo = None
            if corpo.get("ciclo"):
                for c in ciclos:
                    if c.get("data") == corpo["ciclo"]:
                        alvo = c
                        break
                if alvo is None:
                    self._json({"erro": "ciclo nao encontrado"}, 404)
                    return
            else:
                for c in reversed(ciclos):
                    if c.get("tipo") != "recepcao":
                        alvo = c
                        break
                if alvo is None:
                    alvo = ciclos[-1]
            historico = alvo.get("notasMedicas") or []
            historico.append({
                "texto": nota,
                "autor": str(corpo.get("autor", "")) or None,
                "em": datetime.datetime.now().isoformat(),
            })
            alvo["notasMedicas"] = historico
            gravar(dados)
        print("  nota medica anexada: %s (%d nota(s))" % (cod, len(historico)))
        self._json({"ok": True, "codigo": cod, "notas": len(historico),
                    "ciclo": alvo.get("data")})

    def do_POST(self):
        self._protegido(self._do_POST)

    def _do_POST(self):
        caminho = self.path.split("?")[0]
        if caminho == "/api/login":
            return self._login()
        if caminho == "/api/logout":
            with _lock_sessoes:
                _sessoes.pop(self._token(), None)
            self._json({"ok": True})
            return
        if caminho != "/api/ciclo":
            self.send_error(404)
            return
        perfil = self._autoriza("POST", "ciclo")
        if not perfil:
            return
        reg = self._corpo_json()
        if not isinstance(reg, dict):
            self._json({"erro": "corpo invalido"}, 400)
            return
        if perfil == "recepcao" and not (reg.get("tipo") == "recepcao" and reg.get("linha") == "recepcao"):
            self._json({"erro": "a recepcao grava apenas o registro de recepcao"}, 403)
            return

        cod = str(reg.get("codigo", "")).upper()
        if not COD_OK.match(cod):
            self._json({"erro": "codigo invalido"}, 400)
            return
        reg["codigo"] = cod
        reg.setdefault("data", datetime.datetime.now().isoformat())

        with _lock:
            dados = carregar()       # v2.5-M: le (e falha fechado) antes de copiar
            backup_do_dia()
            # atender um paciente ficticio (da fila de teste) gera registro
            # ficticio: sai junto com --apagar-ficticios e nao vira paciente real
            if so_ficticio(dados["pacientes"].get(cod)):
                reg["demo"] = True
            # v2.5-M: reenvio da fila do navegador (a resposta se perdeu, mas o servidor ja
            # tinha gravado) nao duplica o atendimento
            op = reg.get("opId")
            if op and any(c.get("opId") == op for c in dados["pacientes"].get(cod, [])):
                total = len(dados["pacientes"][cod])
                self._json({"ok": True, "total": total, "repetido": True})
                return
            dados["pacientes"].setdefault(cod, []).append(reg)
            gravar(dados)
            total = len(dados["pacientes"][cod])
        print("  ciclo salvo: %s (ciclo n. %d)" % (cod, total))
        self._json({"ok": True, "total": total})


def _pede_senha(rotulo):
    """Pede a senha duas vezes no terminal (nunca pela linha de comando)."""
    senha = getpass.getpass(rotulo)
    if len(senha) < SENHA_MINIMA:
        print("A senha precisa de pelo menos %d caracteres. Nada foi alterado." % SENHA_MINIMA)
        sys.exit(2)
    if getpass.getpass("Repita a senha: ") != senha:
        print("As senhas nao conferem. Nada foi alterado.")
        sys.exit(2)
    if len(senha) < 8:
        print("Aviso: senha curta. O bloqueio de %d minutos apos %d erros continua ativo;" % (BLOQUEIO_MIN, TENTATIVAS))
        print("use o servidor apenas na rede interna da clinica.")
    return senha


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--definir-senha":
        perfil = sys.argv[2]
        if perfil not in PERFIS:
            print("Perfil invalido. Use: " + ", ".join(PERFIS))
            sys.exit(2)
        senha = _pede_senha("Nova senha para '%s': " % perfil)
        definir_senha(perfil, senha)
        print("Senha de '%s' gravada. Quem estiver conectado com esse perfil continua" % perfil)
        print("ate a sessao expirar; reinicie o servidor para desconectar todos agora.")
        return
    if len(sys.argv) == 2 and sys.argv[1] == "--definir-senha-todos":
        senha = _pede_senha("Nova senha para TODOS os perfis e usuarios: ")
        quem = definir_senha_todos(senha)
        print("Senha trocada para: " + ", ".join(quem) + ".")
        print("Reinicie o servidor para desconectar quem ainda esta com a senha antiga.")
        return
    if len(sys.argv) == 4 and sys.argv[1] == "--adicionar-usuario":
        nome, perfil = sys.argv[2].strip().lower(), sys.argv[3]
        if perfil not in PERFIS or not USUARIO_OK.match(nome):
            print("Uso: --adicionar-usuario <nome> <perfil>  (perfil: " + ", ".join(PERFIS) + ";")
            print("     nome em minusculas, sem espaco, ex.: dra.ana)")
            sys.exit(2)
        senha = _pede_senha("Senha de '%s' (%s): " % (nome, perfil))
        adicionar_usuario(nome, perfil, senha)
        print("Usuario '%s' gravado no perfil '%s'. Ele entra no app do perfil com a propria senha." % (nome, perfil))
        return
    if len(sys.argv) == 3 and sys.argv[1] == "--remover-usuario":
        print("Usuario removido." if remover_usuario(sys.argv[2].strip().lower()) else "Usuario nao encontrado.")
        return
    if len(sys.argv) == 2 and sys.argv[1] == "--listar-usuarios":
        print("Perfis com senha: " + (", ".join(p for p in PERFIS if p in carregar_senhas()) or "nenhum"))
        us = carregar_usuarios()
        print("Usuarios: " + (", ".join("%s (%s)" % (n, u["perfil"]) for n, u in sorted(us.items())) or "nenhum"))
        return
    if len(sys.argv) == 2 and sys.argv[1] == "--definir-senha-backup":
        print("A senha do backup fica no Chaveiro deste Mac e o servidor a usa sozinho.")
        print("ANOTE-A FORA DO COMPUTADOR: sem ela, nenhum backup do iCloud abre —")
        print("nem para restaurar num Mac novo se este quebrar.\n")
        # o proprio 'security' pede a senha no terminal: ela nao passa por este programa
        r = subprocess.call(["security", "add-generic-password", "-U", "-s", CHAVEIRO, "-a", "backup",
                             "-l", "Maximus — backup do banco", "-w"])
        print("Senha do backup gravada no Chaveiro." if r == 0 else "Nada foi gravado.")
        return
    if len(sys.argv) == 2 and sys.argv[1] == "--backup-agora":
        if not os.path.exists(BANCO):
            raise SystemExit("Nao ha banco para copiar em %s." % BANCO)
        motivo = backup_fora(BANCO, datetime.date.today().isoformat())
        print("Backup criptografado gravado em %s" % ICLOUD if not motivo else "Backup NAO feito: " + motivo)
        sys.exit(1 if motivo else 0)
    if len(sys.argv) == 4 and sys.argv[1] == "--restaurar-backup":
        senha = senha_backup() or getpass.getpass("Senha do backup: ")
        n = restaurar_backup(sys.argv[2], sys.argv[3], senha)
        print("Backup restaurado em %s: %d pacientes. Confira antes de usar como banco." % (sys.argv[3], n))
        return
    if len(sys.argv) == 3 and sys.argv[1] == "--fila-ficticia":
        cods = fila_ficticia(int(sys.argv[2]))
        print("Fila da recepcao de hoje: %s" % ", ".join(cods))
        return
    if len(sys.argv) == 2 and sys.argv[1] == "--apagar-ficticios":
        if not os.path.exists(BANCO):
            raise SystemExit("Nao ha banco em %s." % BANCO)
        n, restam = apagar_ficticios()
        print("%d registros ficticios apagados; restam %d pacientes reais." % (n, restam))
        print("Copia do banco anterior: %s.antes-de-apagar-ficticios" % BANCO)
        return
    if len(sys.argv) in (2, 3) and sys.argv[1] == "--carregar-teste":
        origem = sys.argv[2] if len(sys.argv) == 3 else os.path.join(PASTA, "data", "banco_teste.json")
        r = carregar_teste(origem)
        print("Banco de teste carregado em %s:" % BANCO)
        print("  %d pacientes ficticios (MX9101-MX9140), %d registros; datas trazidas %d dia(s) para hoje."
              % (r["pacientes"], r["registros"], r["dias"]))
        print("  Fila da recepcao de hoje: %d pacientes (%s)." % (len(r["fila"]), ", ".join(r["fila"])))
        print("  Pacientes reais preservados: %d." % r["reais"])
        if r["copia"]:
            print("  Copia do banco anterior: %s" % r["copia"])
        print("Para remover so os ficticios depois: python3 servidor_maximus.py --apagar-ficticios")
        return
    if len(sys.argv) == 2 and sys.argv[1] == "--carregar-demo":
        n = carregar_demo(os.path.join(PASTA, "data", "banco_demonstracao.json"))
        print("Banco de demonstracao criado em %s: %d pacientes, fila da recepcao com data de hoje." % (BANCO, n))
        return
    faltam = [p for p in PERFIS if p not in carregar_senhas()]
    if faltam:
        print("O servidor so abre com senha definida para os tres perfis.")
        print("Falta definir: " + ", ".join(faltam) + ". Para cada um, rode:")
        for p in faltam:
            print("    python3 servidor_maximus.py --definir-senha " + p)
        sys.exit(1)
    if not os.path.exists(APP):
        print("ATENCAO: 'apps/triagem.html' nao encontrado.")
        print("         O banco funciona, mas o app nao sera servido.\n")
    _le_estado_backup()
    try:
        carregar()
    except BancoIlegivel as e:
        print("!" * 62)
        print(" ATENCAO: %s." % e)
        print(" O servidor sobe para os apps mostrarem o aviso, mas NAO le nem grava")
        print(" nada ate o banco ser restaurado (scripts/conferir_restauracao.py).")
        print("!" * 62)
    ip = ip_da_rede()
    print("=" * 62)
    print(" Triagem Maximus — servidor em execucao")
    print("=" * 62)
    print(" Neste computador:      http://localhost:%d" % PORTA)
    print(" Nos outros consultorios: http://%s:%d" % (ip, PORTA))
    print(" Recepcao (tablet do paciente):  http://%s:%d/recepcao" % (ip, PORTA))
    print(" Financeiro:                     http://%s:%d/financeiro" % (ip, PORTA))
    print()
    print(" Banco:   %s" % BANCO)
    print(" Backups: %s (diario, 60 dias)" % BACKUPS)
    if not os.path.isdir(os.path.dirname(ICLOUD)):
        print(" iCloud:  INATIVO — iCloud Drive nao encontrado neste Mac")
    elif not senha_backup():
        print(" iCloud:  INATIVO — defina a senha: python3 servidor_maximus.py --definir-senha-backup")
    else:
        print(" iCloud:  %s (criptografado, diario, %d dias)" % (ICLOUD, BACKUP_DIAS))
    print()
    if os.environ.get("XPC_SERVICE_NAME", "").startswith("br.com.maximus"):
        print(" Rodando pelo launchd: sobe sozinho no login e volta se cair.")
        print(" Para parar: launchctl bootout gui/$(id -u)/br.com.maximus.servidor")
    else:
        print(" Deixe esta janela aberta. Fechar derruba o servico.")
        print(" Para parar: Ctrl+C  (ou instale o launchd: scripts/instalar_launchd.sh)")
    print("=" * 62)
    try:
        ThreadingHTTPServer(("0.0.0.0", PORTA), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nservidor encerrado")


if __name__ == "__main__":
    main()
