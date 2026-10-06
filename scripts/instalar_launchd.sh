#!/usr/bin/env bash
# v2.5-M — servidor do Maximus pelo launchd (macOS): sobe sozinho no login do
# usuário e volta sozinho se cair (KeepAlive). É um LaunchAgent, não um daemon:
# roda na sessão do usuário, com acesso ao Chaveiro (senha do backup) e ao iCloud
# Drive. Para a clínica abrir sem ninguém mexer, o Mac precisa entrar sozinho no
# usuário (Ajustes > Usuários e Grupos > início de sessão automático) ou ficar logado.
#
#   scripts/instalar_launchd.sh            instala/atualiza e (re)inicia
#   scripts/instalar_launchd.sh --remover  para e remove
#   scripts/instalar_launchd.sh --status   mostra se está rodando
set -eu
ROTULO="br.com.maximus.servidor"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
DOM="gui/$(id -u)"
# o mesmo python do servidor manual: MAXIMUS_PYTHON, senão o do Homebrew, senão o do PATH
# (o /usr/bin/python3 da Apple funciona, mas pede permissões de novo e é outra versão)
PY="${MAXIMUS_PYTHON:-}"
[ -n "$PY" ] || for c in /opt/homebrew/bin/python3 /usr/local/bin/python3 "$(command -v python3 || true)"; do
  [ -n "$c" ] && [ -x "$c" ] && { PY="$c"; break; }
done

case "${1:-}" in
  --remover)
    launchctl bootout "$DOM/$ROTULO" 2>/dev/null || true
    rm -f "$PLIST"; echo "launchd removido. O servidor não sobe mais sozinho."; exit 0 ;;
  --status)
    launchctl print "$DOM/$ROTULO" 2>/dev/null | grep -E "state =|pid =|last exit code" || echo "não instalado"; exit 0 ;;
esac

[ -n "$PY" ] && [ -x "$PY" ] || { echo "python3 não encontrado"; exit 1; }
echo "python: $PY ($("$PY" --version 2>&1))"
# o log do launchd só cresce: guarda o anterior quando passa de 5 MB
LOG="$RAIZ/servidor.log"
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 5000000 ]; then mv -f "$LOG" "$LOG.1"; fi
# um servidor solto (nohup) na porta 8080 impediria o do launchd de subir
SOLTO="$(lsof -nP -iTCP:8080 -sTCP:LISTEN -t 2>/dev/null || true)"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ROTULO</string>
  <key>ProgramArguments</key>
  <array><string>$PY</string><string>-u</string><string>$RAIZ/servidor_maximus.py</string></array>
  <key>WorkingDirectory</key><string>$RAIZ</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>EnvironmentVariables</key>
  <dict><key>PYTHONUNBUFFERED</key><string>1</string><key>LANG</key><string>pt_BR.UTF-8</string></dict>
  <key>StandardOutPath</key><string>$RAIZ/servidor.log</string>
  <key>StandardErrorPath</key><string>$RAIZ/servidor.log</string>
</dict>
</plist>
PL
plutil -lint "$PLIST" >/dev/null
launchctl bootout "$DOM/$ROTULO" 2>/dev/null || true
if [ -n "$SOLTO" ]; then echo "parando o servidor solto na 8080 (pid $SOLTO)"; kill $SOLTO 2>/dev/null || true; sleep 2; fi
launchctl bootstrap "$DOM" "$PLIST"
launchctl enable "$DOM/$ROTULO"
sleep 3
launchctl print "$DOM/$ROTULO" | grep -E "state =|pid =" || true
curl -s -o /dev/null -w "porta 8080: HTTP %{http_code}\n" http://127.0.0.1:8080/api/health || echo "porta 8080 ainda não respondeu (veja $RAIZ/servidor.log)"
