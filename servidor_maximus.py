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
  4. Abra a pasta e execute:   python3 servidor_maximus.py
  5. O terminal mostra o endereco. Use esse endereco nos outros consultorios.

ACESSO
  Cada app pede a senha do seu perfil ao abrir. O perfil define o que ele
  pode ler e gravar (tabela PERMISSOES abaixo). As senhas ficam em
  'senhas.json', so como hash — nunca em texto — e fora do git.

Nao precisa instalar nada alem do Python. Nao usa internet.
"""

import json, os, re, shutil, socket, sys, threading, datetime
import getpass, hashlib, hmac, secrets, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

PORTA = 8080
PASTA = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(PASTA, "apps", "triagem.html")
BANCO = os.path.join(PASTA, "banco_triagem.json")
BACKUPS = os.path.join(PASTA, "backups")

SENHAS = os.path.join(PASTA, "senhas.json")

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
    ("GET", "historico"):      {"medico", "recepcao", "financeiro"},
    ("GET", "triagens-hoje"):  {"medico", "recepcao", "financeiro"},
    ("GET", "proximo-codigo"): {"medico", "recepcao"},
    ("GET", "export"):         {"medico"},
    ("POST", "ciclo"):         {"medico", "recepcao"},
    ("PUT", "nota"):           {"medico"},
}

_sessoes = {}              # token -> (perfil, expira_em)
_falhas = {}               # endereco -> (erros seguidos, bloqueado_ate)
_lock_sessoes = threading.Lock()


def _hash(senha, sal):
    return hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), bytes.fromhex(sal), ITERACOES).hex()


def carregar_senhas():
    if not os.path.exists(SENHAS):
        return {}
    with open(SENHAS, "r", encoding="utf-8") as f:
        return json.load(f).get("perfis", {})


def definir_senha(perfil, senha):
    perfis = carregar_senhas()
    sal = secrets.token_hex(16)
    perfis[perfil] = {"sal": sal, "hash": _hash(senha, sal)}
    tmp = SENHAS + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"perfis": perfis}, f, indent=1)
    os.chmod(tmp, 0o600)
    os.replace(tmp, SENHAS)


def confere_senha(perfil, senha):
    reg = carregar_senhas().get(perfil)
    if not reg:
        return False
    return hmac.compare_digest(_hash(senha, reg["sal"]), reg["hash"])


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


def carregar():
    if not os.path.exists(BANCO):
        return {"pacientes": {}}
    try:
        with open(BANCO, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        quebrado = BANCO + ".corrompido-" + datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        shutil.copy2(BANCO, quebrado)
        print("!! banco ilegivel, copiado para", quebrado, "- comecando vazio")
        return {"pacientes": {}}


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
        shutil.copy2(BANCO, alvo)
        # mantem os 60 backups mais recentes
        arqs = sorted(os.listdir(BACKUPS))
        for velho in arqs[:-60]:
            try:
                os.remove(os.path.join(BACKUPS, velho))
            except OSError:
                pass


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
        if perfil in PERFIS and senha and confere_senha(perfil, senha):
            with _lock_sessoes:
                _falhas.pop(ip, None)
            token = abre_sessao(perfil)
            print("  entrada: %s (%s)" % (perfil, ip))
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
            self._json({"ok": True, "versao": 2, "senha": True})
            return

        if caminho == "/api/sessao":
            perfil = perfil_do_token(self._token())
            if perfil:
                self._json({"ok": True, "perfil": perfil})
            else:
                self._json({"erro": "senha necessaria"}, 401)
            return

        if caminho.startswith("/api/") and not caminho.startswith("/api/triagem/"):
            rota = caminho[len("/api/"):].split("/")[0]
            if ("GET", rota) in PERMISSOES and not self._autoriza("GET", rota):
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
            self._json({"ciclo": ciclos[-1], "total": len(ciclos),
                        "ultimaData": ciclos[-1].get("data")})
            return

        if caminho.startswith("/api/historico/"):
            cod = caminho[len("/api/historico/"):].upper()
            if not COD_OK.match(cod):
                self._json({"erro": "codigo invalido"}, 400)
                return
            with _lock:
                dados = carregar()
            self._json({"ciclos": dados["pacientes"].get(cod, [])})
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
            self._json({"triagens": fila})
            return

        if caminho == "/api/proximo-codigo":
            with _lock:
                dados = carregar()
            maior = 0
            for cod in dados["pacientes"]:
                m = re.search(r"(\d+)\s*$", cod)
                if m:
                    maior = max(maior, int(m.group(1)))
            self._json({"codigo": "MX%04d" % (maior + 1)})
            return

        if caminho == "/api/export":
            with _lock:
                dados = carregar()
            self._json(dados)
            return

        self.send_error(404)

    def do_PUT(self):
        """PUT /api/triagem/<codigo>/nota  — anexa ou substitui a nota medica
        do ciclo mais recente daquele paciente. Corpo: {"nota": "...",
        "autor": "opcional", "ciclo": "opcional — id do ciclo"}"""
        caminho = self.path.split("?")[0]
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
            backup_do_dia()
            dados = carregar()
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
            backup_do_dia()
            dados = carregar()
            dados["pacientes"].setdefault(cod, []).append(reg)
            gravar(dados)
            total = len(dados["pacientes"][cod])
        print("  ciclo salvo: %s (ciclo n. %d)" % (cod, total))
        self._json({"ok": True, "total": total})


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--definir-senha":
        perfil = sys.argv[2]
        if perfil not in PERFIS:
            print("Perfil invalido. Use: " + ", ".join(PERFIS))
            sys.exit(2)
        senha = getpass.getpass("Nova senha para '%s': " % perfil)
        if len(senha) < 8:
            print("A senha precisa de pelo menos 8 caracteres. Nada foi alterado.")
            sys.exit(2)
        if getpass.getpass("Repita a senha: ") != senha:
            print("As senhas nao conferem. Nada foi alterado.")
            sys.exit(2)
        definir_senha(perfil, senha)
        print("Senha de '%s' gravada. Quem estiver conectado com esse perfil continua" % perfil)
        print("ate a sessao expirar; reinicie o servidor para desconectar todos agora.")
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
    print()
    print(" Deixe esta janela aberta. Fechar derruba o servico.")
    print(" Para parar: Ctrl+C")
    print("=" * 62)
    try:
        ThreadingHTTPServer(("0.0.0.0", PORTA), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nservidor encerrado")


if __name__ == "__main__":
    main()
