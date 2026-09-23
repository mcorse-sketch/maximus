#!/usr/bin/env python3
"""
Servidor de triagem — Clinica Maximus Medicina Masculina

Roda no computador principal da clinica. Serve o app de triagem e guarda o
historico dos ciclos num arquivo JSON local.

COMO USAR
  1. Deixe este arquivo na raiz do repositorio, ao lado da pasta 'apps/'
  2. Instale o Python 3 (python.org) se ainda nao tiver
  3. Abra a pasta e execute:   python servidor_maximus.py
  4. O terminal mostra o endereco. Use esse endereco nos outros consultorios.

Nao precisa instalar nada alem do Python. Nao usa internet.
"""

import json, os, re, shutil, socket, sys, threading, datetime
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

PORTA = 8080
PASTA = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(PASTA, "apps", "triagem.html")
BANCO = os.path.join(PASTA, "banco_triagem.json")
BACKUPS = os.path.join(PASTA, "backups")

_lock = threading.Lock()
COD_OK = re.compile(r"^[A-Z0-9._\-]{1,40}$")


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
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
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
            self._json({"ok": True, "versao": 1})
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
        cod = m.group(1).upper()
        if not COD_OK.match(cod):
            self._json({"erro": "codigo invalido"}, 400)
            return
        try:
            n = int(self.headers.get("Content-Length", 0))
            if n <= 0 or n > 200000:
                raise ValueError
            corpo = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
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
        if self.path.split("?")[0] != "/api/ciclo":
            self.send_error(404)
            return
        try:
            n = int(self.headers.get("Content-Length", 0))
            if n <= 0 or n > 200000:
                raise ValueError
            reg = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            self._json({"erro": "corpo invalido"}, 400)
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
