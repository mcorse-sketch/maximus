#!/usr/bin/env bash
# v2.5.20 — apps de Mac: monta os .app, confere estrutura, ausência de dados sensíveis,
# --simular sem efeito e o Consultório escolhendo o servidor (sem janelas: MAXIMUS_SEM_DIALOGO=1).
set -u
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/maximus-apps-teste.XXXXXX")"; trap 'rm -rf "$T"' EXIT
F=0; ok(){ echo "  ok     $1"; }; ko(){ echo "  FALHA  $1"; F=$((F+1)); }
chk(){ if eval "$2"; then ok "$1"; else ko "$1"; fi; }
"$RAIZ/scripts/criar_apps_mac.sh" "$T/apps" >/dev/null 2>&1 || ko "criar_apps_mac.sh roda"
S="$T/apps/Maximus Servidor.app"; C="$T/apps/Maximus Consultório.app"
for A in "$S" "$C"; do
  n="$(basename "$A")"
  chk "$n: Info.plist, executável e ícone" '[ -f "$A/Contents/Info.plist" ] && [ -s "$A/Contents/Resources/AppIcon.icns" ] && [ -x "$A/Contents/MacOS/$(sed -n "/CFBundleExecutable/{s/.*<string>\(.*\)<\/string>.*/\1/p;}" "$A/Contents/Info.plist")" ]'
done
chk "zip de cada app" '[ -s "$T/apps/Maximus Servidor.zip" ] && [ -s "$T/apps/Maximus Consultório.zip" ]'
chk "servidor + apps dentro do Servidor.app" '[ -f "$S/Contents/Resources/maximus/servidor_maximus.py" ] && [ -f "$S/Contents/Resources/maximus/apps/recepcao.html" ] && [ -f "$S/Contents/Resources/maximus/scripts/instalar_launchd.sh" ]'
chk "nenhum banco/senha/log/backup dentro dos apps" '! find "$T/apps" \( -name "banco_*" -o -name "senhas.json" -o -name "*.log" -o -name backups \) | grep -q .'
mkdir -p "$T/home"
HOME="$T/home" MAXIMUS_DESTINO="$T/home/Maximus" MAXIMUS_SEM_DIALOGO=1 MAXIMUS_SENHA=teste123 MAXIMUS_PORTA=1 MAXIMUS_RESPOSTA=Instalar \
  "$S/Contents/MacOS/maximus-servidor" --simular >"$T/sim.txt" 2>&1
chk "--simular não cria nada" '[ ! -e "$T/home/Maximus" ] && [ ! -e "$T/home/Library" ]'
chk "--simular mostra o que faria" 'grep -q "SIMULAR: cp" "$T/sim.txt" && grep -q "SIMULAR: gravar senha" "$T/sim.txt"'
E="$C/Contents/MacOS/maximus-consultorio"
r="$(MAXIMUS_SEM_DIALOGO=1 MAXIMUS_CONF_DIR="$T/conf" MAXIMUS_OPTION=1 MAXIMUS_RESPOSTA="http://127.0.0.1:1/" "$E" 2>&1)"
chk "Consultório: servidor fora do ar não abre nem salva" 'echo "$r" | grep -q "SEM SERVIDOR 127.0.0.1:1" && [ ! -f "$T/conf/consultorio.conf" ]'
chk "painel e ícone dentro do Servidor.app" '[ -f "$S/Contents/Resources/painel_servidor.py" ] && [ -f "$S/Contents/Resources/painel.html" ] && [ -s "$S/Contents/Resources/icone-256.png" ]'
# painel: so 127.0.0.1, token obrigatorio, Host checado
PYB="$(command -v python3)"
"$PYB" "$S/Contents/Resources/painel_servidor.py" "--exe=/bin/true" "--dest=$T/home/Maximus" "--res=$S/Contents/Resources" "--porta-servidor=1" >"$T/painel.url" 2>/dev/null &
PP=$!; for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$T/painel.url" ] && break; sleep 0.3; done
U="$(head -1 "$T/painel.url")"; B0="${U%%/?t=*}"; TK="${U##*t=}"
chk "painel escuta só em 127.0.0.1" 'case "$U" in http://127.0.0.1:*) true ;; *) false ;; esac'
chk "painel: página abre com o token" '[ "$(curl -s -o /dev/null -w "%{http_code}" "$U")" = 200 ]'
chk "painel: sem token = 403" '[ "$(curl -s -o /dev/null -w "%{http_code}" "$B0/")" = 403 ] && [ "$(curl -s -o /dev/null -w "%{http_code}" "$B0/api/estado")" = 403 ]'
chk "painel: Host de fora = 403 (DNS rebinding)" '[ "$(curl -s -o /dev/null -w "%{http_code}" -H "Host: exemplo.com" "$U")" = 403 ]'
chk "painel: estado desligado" 'curl -s -H "X-Token: $TK" "$B0/api/estado" | grep -q "\"ligado\": false"'
chk "painel: ação desconhecida recusada" '[ "$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "X-Token: $TK" -d "{\"acao\":\"rm\"}" "$B0/api/acao")" = 400 ]'
kill $PP 2>/dev/null
mkdir -p "$T/conf2"; echo "SERVIDOR=10.255.255.1:8080" > "$T/conf2/consultorio.conf"
python3 -c "import http.server,socketserver,json
class H(http.server.BaseHTTPRequestHandler):
  def do_GET(s): b=json.dumps({'ok':True}).encode(); s.send_response(200); s.send_header('Content-Type','application/json'); s.end_headers(); s.wfile.write(b)
  def log_message(s,*a): pass
socketserver.TCPServer(('127.0.0.1',8080),H).serve_forever()" 2>/dev/null &
FP=$!; sleep 1
if curl -s -m 2 http://localhost:8080/api/health | grep -q ok; then
  r2="$(MAXIMUS_SEM_DIALOGO=1 MAXIMUS_CONF_DIR="$T/conf2" "$E" 2>&1)"
  chk "Consultório: usa localhost mas não apaga o servidor remoto salvo" 'echo "$r2" | grep -q "ABRIR http://localhost:8080/" && grep -q "SERVIDOR=10.255.255.1:8080" "$T/conf2/consultorio.conf"'
fi
kill $FP 2>/dev/null
echo; echo "=== APPS DE MAC ==="; echo "falhas: $F"; [ "$F" = 0 ]
