#!/bin/bash
# Maximus Consultorio.app — abre a triagem numa janela de app, ligada ao servidor da clinica.
# Ordem: servidor salvo -> este Mac (localhost) -> pergunta o IP uma vez e lembra.
# Segure a tecla Option ao abrir para trocar o servidor.
set -u
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
TITULO="Maximus Consultório"; ICONE="$RES/AppIcon.icns"
CONFD="${MAXIMUS_CONF_DIR:-$HOME/Library/Application Support/Maximus}"
CONF="$CONFD/consultorio.conf"
PORTA_PADRAO=8080
SEMDLG="${MAXIMUS_SEM_DIALOGO:-0}"
esc(){ printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
ok(){ curl -s --max-time 2 "http://$1/api/health" 2>/dev/null | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; }
salvo(){ [ -f "$CONF" ] && sed -n 's/^SERVIDOR=//p' "$CONF" | head -1; }
salva(){ mkdir -p "$CONFD" && printf 'SERVIDOR=%s\n' "$1" > "$CONF"; }
normaliza(){  # "192.168.0.10" -> "192.168.0.10:8080"; tira http:// e barra final
  local s="${1#http://}"; s="${s#https://}"; s="${s%%/*}"; s="$(echo "$s" | tr -d ' ')"
  case "$s" in *:*) echo "$s" ;; "") echo "" ;; *) echo "$s:$PORTA_PADRAO" ;; esac
}
option_apertado(){
  [ "$SEMDLG" = 1 ] && { [ "${MAXIMUS_OPTION:-0}" = 1 ]; return; }
  local f; f="$(osascript -l JavaScript -e 'ObjC.import("AppKit"); $.NSEvent.modifierFlags' 2>/dev/null || echo 0)"
  [ $(( ${f:-0} & 524288 )) -ne 0 ]
}
pergunta(){
  if [ "$SEMDLG" = 1 ]; then echo "${MAXIMUS_RESPOSTA:-}"; return; fi
  osascript -e "text returned of (display dialog \"$(esc "$1")\" with title \"$TITULO\" default answer \"$(esc "$2")\" buttons {\"Cancelar\",\"Conectar\"} default button \"Conectar\" with icon POSIX file \"$(esc "$ICONE")\")" 2>/dev/null
}
abre_app(){
  local url="http://$1/"
  if [ "$SEMDLG" = 1 ]; then echo "ABRIR $url"; return; fi
  for nav in "Google Chrome" "Microsoft Edge" "Brave Browser"; do
    if [ -d "/Applications/$nav.app" ] || [ -d "$HOME/Applications/$nav.app" ]; then
      open -na "$nav" --args --app="$url" --window-size=1440,900 && return
    fi
  done
  open -a Safari "$url" 2>/dev/null || open "$url"
}

ALVO=""; S="$(salvo)"; TROCAR=0
option_apertado && TROCAR=1
if [ "$TROCAR" = 0 ]; then
  if [ -n "$S" ] && ok "$S"; then ALVO="$S"
  elif ok "localhost:$PORTA_PADRAO"; then ALVO="localhost:$PORTA_PADRAO"
  fi
fi
MSG="Qual é o endereço do Mac servidor da clínica?

Veja no app «Maximus Servidor» daquele Mac (ex.: 192.168.0.20)."
[ "$TROCAR" = 0 ] && [ -n "$S" ] && MSG="Não encontrei o servidor em $S.
Confira se o Mac servidor está ligado e no mesmo Wi‑Fi, ou digite o endereço novo."
while [ -z "$ALVO" ]; do
  r="$(pergunta "$MSG" "${S%:$PORTA_PADRAO}")" || exit 0
  n="$(normaliza "$r")"; [ -n "$n" ] || exit 0
  if ok "$n"; then ALVO="$n"; else
    MSG="Não consegui falar com $n.
Confira o endereço, o Wi‑Fi e se o servidor está no ar."; S="$n"
    [ "$SEMDLG" = 1 ] && { echo "SEM SERVIDOR $n"; exit 1; }
  fi
done
# localhost achado sozinho nao apaga um servidor remoto salvo (so vale nesta abertura)
if [ "$ALVO" != "$(salvo)" ]; then
  if [ "$ALVO" != "localhost:$PORTA_PADRAO" ] || [ -z "$(salvo)" ] || [ "$TROCAR" = 1 ]; then salva "$ALVO"; fi
fi
abre_app "$ALVO"
