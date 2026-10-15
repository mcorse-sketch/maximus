#!/usr/bin/env python3
"""Painel do "Maximus Servidor.app" — janela de status (HTML) servida SO em 127.0.0.1,
com token aleatorio por abertura. Funciona com o servidor ligado ou desligado. As acoes
(reiniciar, parar, ligar, atualizar...) chamam o proprio executavel do app com --acao.
Encerra sozinho ~90 s depois que a janela fecha (sem ping)."""
import json, os, re, secrets, socket, subprocess, sys, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

A = dict(a.split("=", 1) for a in sys.argv[1:] if "=" in a)
EXE, DEST, RES = A["--exe"], A["--dest"], A["--res"]
PORTA_SRV = int(A.get("--porta-servidor", "8080"))
TOKEN = secrets.token_urlsafe(18)
ACOES = {"reiniciar", "parar", "ligar", "guia", "folha", "consultorio", "log", "atualizar"}
ultimo_ping = [time.time() + 60]

def versao(pasta):
    try:
        t = open(os.path.join(pasta, "apps", "triagem.html"), encoding="utf-8").read(400000)
        m = re.search(r'data-versao="([^"]+)"', t)
        return m.group(1) if m else ""
    except OSError:
        return ""

def ip_rede():
    for i in ("en0", "en1", "en2"):
        try:
            ip = subprocess.run(["ipconfig", "getifaddr", i], capture_output=True, text=True, timeout=2).stdout.strip()
            if ip:
                return ip
        except Exception:
            pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]; s.close(); return ip
    except Exception:
        return "127.0.0.1"

def estado():
    saude = None
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d/api/health" % PORTA_SRV, timeout=2) as r:
            saude = json.loads(r.read())
    except Exception:
        pass
    vi, vp = versao(DEST), versao(os.path.join(RES, "maximus"))
    return {"ligado": bool(saude and saude.get("ok")), "versao": vi or "?", "versaoPacote": vp,
            "atualizar": bool(vp and vi and vp != vi), "ip": ip_rede(), "porta": PORTA_SRV, "pasta": DEST,
            "alertas": [a.get("texto") for a in (saude or {}).get("alertas", [])][:3]}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _ok_origem(self):
        host = (self.headers.get("Host") or "").split(":")[0]
        if host not in ("127.0.0.1", "localhost") or self.client_address[0] not in ("127.0.0.1", "::1"):
            self.send_error(403); return False
        return True

    def _resp(self, corpo, tipo, st=200):
        self.send_response(st)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers(); self.wfile.write(corpo)

    def _json(self, o, st=200):
        self._resp(json.dumps(o, ensure_ascii=False).encode(), "application/json; charset=utf-8", st)

    def _token_ok(self):
        if self.headers.get("X-Token") != TOKEN:
            self._json({"erro": "token"}, 403); return False
        return True

    def do_GET(self):
        if not self._ok_origem():
            return
        c = self.path.split("?")[0]
        if c == "/":
            if ("t=" + TOKEN) not in self.path:
                return self._resp("Abra pelo app Maximus Servidor.".encode(), "text/plain; charset=utf-8", 403)
            html = open(os.path.join(RES, "painel.html"), encoding="utf-8").read()
            return self._resp(html.encode(), "text/html; charset=utf-8")
        arqs = {"/qrcode.js": (os.path.join(RES, "maximus", "apps", "vendor", "qrcode.js"), "application/javascript"),
                "/icone.png": (os.path.join(RES, "icone-256.png"), "image/png")}
        if c in arqs:
            with open(arqs[c][0], "rb") as f:
                return self._resp(f.read(), arqs[c][1])
        if c == "/api/estado":
            if self._token_ok():
                ultimo_ping[0] = time.time()
                self._json(estado())
            return
        self.send_error(404)

    def do_POST(self):
        if not self._ok_origem() or not self._token_ok():
            return
        try:
            n = int(self.headers.get("Content-Length", 0))
            acao = json.loads(self.rfile.read(n) if 0 < n < 1000 else b"{}").get("acao")
        except Exception:
            acao = None
        if acao not in ACOES:
            return self._json({"erro": "acao invalida"}, 400)
        p = subprocess.run([EXE, "--acao", acao], capture_output=True, text=True, timeout=60)
        self._json({"ok": p.returncode == 0, "saida": (p.stdout + p.stderr)[-400:]})

def vigia(srv):
    while True:
        time.sleep(5)
        if time.time() - ultimo_ping[0] > 90:
            srv.shutdown(); return

if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", int(A.get("--porta", "0"))), H)
    print("http://127.0.0.1:%d/?t=%s" % (srv.server_address[1], TOKEN), flush=True)
    threading.Thread(target=vigia, args=(srv,), daemon=True).start()
    srv.serve_forever()
