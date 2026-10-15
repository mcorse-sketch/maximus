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
echo; echo "=== APPS DE MAC ==="; echo "falhas: $F"; [ "$F" = 0 ]
