#!/bin/bash
# Maximus Servidor.app — executavel do app (Contents/MacOS/maximus-servidor).
# Clique duplo: se o servidor ainda nao esta instalado neste Mac, instala em ~/Maximus
# (programa, senhas, launchd); depois mostra o status e os enderecos da clinica.
# Nunca traz banco nem senhas dentro do app; nunca sobrescreve banco_triagem.json.
#
#   --simular            mostra o que faria, sem mudar nada (MAXIMUS_SIMULAR=1 tambem)
#   MAXIMUS_DESTINO=...  pasta de instalacao (padrao ~/Maximus)
#   MAXIMUS_SEM_DIALOGO=1 + MAXIMUS_SENHA=...  modo de teste, sem janelas do macOS
set -u
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
PACOTE="$RES/maximus"
DEST="${MAXIMUS_DESTINO:-$HOME/Maximus}"
ROTULO="br.com.maximus.servidor"
PORTA="${MAXIMUS_PORTA:-8080}"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
DOM="gui/$(id -u)"
SIM=0; [ "${1:-}" = "--simular" ] && SIM=1; ACAO=""; [ "${1:-}" = "--acao" ] && ACAO="${2:-}"; [ "${MAXIMUS_SIMULAR:-0}" = "1" ] && SIM=1
SEMDLG="${MAXIMUS_SEM_DIALOGO:-0}"
TITULO="Maximus Servidor"
ICONE="$RES/AppIcon.icns"

log(){ echo "[servidor.app] $*" >&2; }
faz(){ if [ "$SIM" = 1 ]; then log "SIMULAR: $*"; else "$@"; fi; }
esc(){ printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# dialogo: msg, botoes (lista AppleScript), padrao -> imprime o botao clicado ("" = cancelou)
dialogo(){
  if [ "$SEMDLG" = 1 ]; then  # teste: MAXIMUS_CONFIRMA vale se for um dos botoes; senao MAXIMUS_RESPOSTA
    log "DIALOGO: $1"
    case "$2" in *"\"${MAXIMUS_CONFIRMA:-//}\""*) echo "$MAXIMUS_CONFIRMA" ;; *) echo "${MAXIMUS_RESPOSTA:-$3}" ;; esac; return; fi
  osascript -e "button returned of (display dialog \"$(esc "$1")\" with title \"$TITULO\" buttons {$2} default button \"$3\" with icon POSIX file \"$(esc "$ICONE")\")" 2>/dev/null
}
aviso(){ dialogo "$1" '"OK"' "OK" >/dev/null; }
pede_senha(){
  if [ "$SEMDLG" = 1 ]; then echo "${MAXIMUS_SENHA:-}"; return; fi
  osascript -e "text returned of (display dialog \"$(esc "$1")\" with title \"$TITULO\" default answer \"\" with hidden answer buttons {\"Cancelar\",\"OK\"} default button \"OK\" with icon POSIX file \"$(esc "$ICONE")\")" 2>/dev/null
}

acha_python(){
  PY="${MAXIMUS_PYTHON:-}"
  [ -n "$PY" ] && [ -x "$PY" ] && return 0
  for c in /opt/homebrew/bin/python3 /usr/local/bin/python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3; do
    [ -x "$c" ] && { PY="$c"; return 0; }
  done
  # o /usr/bin/python3 da Apple so existe de verdade com as Ferramentas de Linha de Comando
  if [ -x /usr/bin/python3 ] && { [ "$(uname)" != Darwin ] || xcode-select -p >/dev/null 2>&1; }; then PY=/usr/bin/python3; return 0; fi
  PY=""; return 1
}

saude(){ curl -s --max-time 2 "http://127.0.0.1:$PORTA/api/health" 2>/dev/null; }
no_ar(){ saude | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; }
ip_rede(){
  local ip=""
  for i in en0 en1 en2; do ip="$(ipconfig getifaddr "$i" 2>/dev/null || true)"; [ -n "$ip" ] && break; done
  [ -n "$ip" ] || ip="$("${PY:-python3}" -c "import socket;s=socket.socket(2,2);s.connect(('10.255.255.255',1));print(s.getsockname()[0])" 2>/dev/null || true)"
  echo "${ip:-127.0.0.1}"
}
versao_de(){ sed -n 's/.*data-versao="\([^"]*\)".*/\1/p' "$1/apps/triagem.html" 2>/dev/null | head -1; }
senhas_ok(){
  [ -f "$DEST/senhas.json" ] && "$PY" -c "
import json,sys
p=(json.load(open(sys.argv[1],encoding='utf-8')).get('perfis') or {})
sys.exit(0 if all(x in p for x in ('medico','recepcao','financeiro')) else 1)" "$DEST/senhas.json" 2>/dev/null
}

copia_programa(){  # so codigo: servidor, apps, scripts. Banco/senhas/backups nunca vem no app.
  faz mkdir -p "$DEST/apps" "$DEST/scripts"
  faz cp -f "$PACOTE/servidor_maximus.py" "$DEST/"
  faz cp -Rf "$PACOTE/apps/." "$DEST/apps/"
  faz cp -Rf "$PACOTE/scripts/." "$DEST/scripts/"
  faz chmod +x "$DEST/scripts/instalar_launchd.sh"
}

define_senhas(){
  while :; do
    local s1 s2
    s1="$(pede_senha "Crie a senha de acesso do Maximus (médico, recepção e financeiro usam a mesma; dá para trocar depois por perfil). Mínimo 4 caracteres.")" || return 1
    [ -n "$s1" ] || return 1
    if [ "$SEMDLG" = 1 ]; then s2="$s1"; else s2="$(pede_senha "Repita a senha:")" || return 1; fi
    if [ "$s1" != "$s2" ]; then aviso "As senhas não conferem. Tente de novo."; continue; fi
    if [ "${#s1}" -lt 4 ]; then aviso "Senha muito curta (mínimo 4 caracteres)."; continue; fi
    if [ "$SIM" = 1 ]; then log "SIMULAR: gravar senha dos tres perfis em $DEST/senhas.json"; return 0; fi
    printf '%s\n' "$s1" | (cd "$DEST" && "$PY" servidor_maximus.py --definir-senha-todos-stdin) >/dev/null && return 0
    aviso "Não consegui gravar a senha. Veja o Terminal: $PY servidor_maximus.py --definir-senha-todos"; return 1
  done
}

instala_launchd(){ if [ "$SIM" = 1 ]; then log "SIMULAR: instalar launchd ($DEST/scripts/instalar_launchd.sh)"; else env MAXIMUS_PYTHON="$PY" "$DEST/scripts/instalar_launchd.sh" >>"$DEST/instalacao.log" 2>&1; fi; }
liga(){ if [ -f "$PLIST" ]; then faz launchctl bootstrap "$DOM" "$PLIST" 2>/dev/null; faz launchctl kickstart "$DOM/$ROTULO" 2>/dev/null; else instala_launchd; fi; }
reinicia(){ faz launchctl kickstart -k "$DOM/$ROTULO" 2>/dev/null || liga; }
para(){ faz launchctl bootout "$DOM/$ROTULO" 2>/dev/null; }
espera(){ [ "$SIM" = 1 ] && return 0; for _ in $(seq 1 15); do no_ar && return 0; sleep 1; done; return 1; }

guia(){  # COMO ACESSAR.txt com o IP de hoje
  local ip="$1" arq="$DEST/COMO ACESSAR.txt"
  if [ "$SIM" = 1 ]; then log "SIMULAR: gravar $arq"; return; fi
  cat > "$arq" <<TXT
COMO ACESSAR O MAXIMUS NESTA CLÍNICA
====================================
Servidor neste Mac · pasta: $DEST
Versão: $(versao_de "$DEST") · porta: $PORTA · IP na rede: $ip
Gerado em: $(date '+%d/%m/%Y %H:%M')

CONSULTÓRIO (médico)
  Neste Mac:        app «Maximus Consultório» ou http://localhost:$PORTA/
  Outros Macs:      app «Maximus Consultório» (pede o IP $ip na primeira vez)
                    ou http://$ip:$PORTA/

RECEPÇÃO (iPad do paciente)
  Safari do iPad:   http://$ip:$PORTA/recepcao
  Instalar o ícone: Compartilhar > Adicionar à Tela de Início
  Folha com QR:     http://localhost:$PORTA/ipad  (imprima e deixe na recepção)

PRIMEIRA VEZ QUE ABRIR UM APP DO MAXIMUS NUM MAC
  Os apps não são da App Store, então o macOS bloqueia o clique duplo na
  primeira vez. Clique com o botão direito no app > Abrir > Abrir.
  (Ou: Ajustes do Sistema > Privacidade e Segurança > «Abrir Mesmo Assim».)
  Depois disso ele abre normalmente.

SENHAS
  Trocar (no Terminal):
    cd "$DEST"
    python3 servidor_maximus.py --definir-senha medico
    python3 servidor_maximus.py --definir-senha recepcao
  Depois de trocar, use «Reiniciar servidor» no app Maximus Servidor.

SERVIDOR
  Abra o app «Maximus Servidor» para ver o status, reiniciar ou parar.
  Ele sobe sozinho quando este usuário entra no Mac (launchd $ROTULO).
  Log: $DEST/servidor.log

Se o iPad não abrir: mesmo Wi‑Fi? Firewall do Mac permite Python? O IP mudou?
(peça ao roteador um IP fixo para este Mac.)
TXT
  cp -f "$arq" "$HOME/Desktop/COMO ACESSAR Maximus.txt" 2>/dev/null || true
}

abre(){ if [ "$SIM" = 1 ] || [ "$SEMDLG" = 1 ]; then log "ABRIR: $*"; else open "$@"; fi; }

# ---------------------------------------------------------------- 1) python
if ! acha_python; then
  r="$(dialogo "Este Mac ainda não tem o Python 3, que o servidor do Maximus precisa.

Instale pelo site oficial (python.org > Downloads > macOS), ou no Terminal: xcode-select --install

Depois abra o Maximus Servidor de novo." '"Fechar","Abrir python.org"' "Abrir python.org")"
  [ "$r" = "Abrir python.org" ] && abre "https://www.python.org/downloads/macos/"
  exit 1
fi
log "python: $PY"

abre_consultorio(){
  if [ -d "/Applications/Maximus Consultório.app" ]; then abre "/Applications/Maximus Consultório.app"
  elif [ -d "/Applications/Google Chrome.app" ]; then abre -na "Google Chrome" --args --app="http://localhost:$PORTA/"
  else abre "http://localhost:$PORTA/"; fi
}
atualiza_programa(){
  VI="$(versao_de "$DEST")"; VP="$(versao_de "$PACOTE")"
  [ -n "$VP" ] && [ "$VP" != "$VI" ] || return 0
  [ -f "$DEST/banco_triagem.json" ] && faz cp -p "$DEST/banco_triagem.json" "$HOME/banco_triagem.backup-antes-$VP-$(date +%Y%m%d-%H%M%S).json"
  copia_programa; reinicia; espera || true
}
# acoes do painel (botoes da janela de status): sem dialogos, so executam
if [ -n "$ACAO" ]; then
  case "$ACAO" in
    reiniciar) reinicia; espera ;;
    parar) para ;;
    ligar) liga; espera ;;
    guia) guia "$(ip_rede)"; abre -a TextEdit "$DEST/COMO ACESSAR.txt" ;;
    folha) abre "http://localhost:$PORTA/ipad" ;;
    consultorio) abre_consultorio ;;
    log) abre -a Console "$DEST/servidor.log" ;;
    atualizar) atualiza_programa ;;
    *) echo "acao desconhecida: $ACAO"; exit 2 ;;
  esac
  exit $?
fi

# ---------------------------------------------------------------- 2) instalacao (so se falta)
NOVO=0
if [ ! -f "$DEST/servidor_maximus.py" ]; then
  r="$(dialogo "Instalar o servidor do Maximus neste Mac?

Pasta: $DEST
Ele vai ligar sozinho sempre que este usuário entrar no Mac. Este Mac precisa ficar ligado e no Wi‑Fi da clínica durante o atendimento." '"Cancelar","Instalar"' "Instalar")"
  [ "$r" = "Instalar" ] || exit 0
  copia_programa; NOVO=1
fi
if ! senhas_ok; then define_senhas || { aviso "Sem senha o servidor não abre. Abra o Maximus Servidor de novo quando quiser."; exit 1; }; fi
if [ ! -f "$PLIST" ]; then instala_launchd; espera || true; NOVO=1
elif ! no_ar; then liga; espera || true; fi
IP="$(ip_rede)"
if [ "$NOVO" = 1 ]; then guia "$IP"; fi

# ---------------------------------------------------------------- 3) janela de status
# painel HTML so em 127.0.0.1 (token por abertura), numa janela de app do Chrome/Edge/Brave
# ou no Safari; se o painel nao subir, cai no dialogo simples do macOS.
URLF="$(mktemp "${TMPDIR:-/tmp}/maximus-painel.XXXXXX")"
nohup "$PY" "$RES/painel_servidor.py" "--exe=$(cd "$(dirname "$0")" && pwd)/$(basename "$0")" "--dest=$DEST" "--res=$RES" "--porta-servidor=$PORTA" >"$URLF" 2>/dev/null &
URL=""; for _ in $(seq 1 30); do URL="$(head -1 "$URLF" 2>/dev/null)"; [ -n "$URL" ] && break; sleep 0.2; done
rm -f "$URLF"
if [ -n "$URL" ]; then
  if [ "$SIM" = 1 ] || [ "$SEMDLG" = 1 ]; then log "PAINEL: $URL"; echo "$URL"; exit 0; fi
  for nav in "Google Chrome" "Microsoft Edge" "Brave Browser"; do
    if [ -d "/Applications/$nav.app" ]; then open -na "$nav" --args --app="$URL" --window-size=560,760 && exit 0; fi
  done
  open -a Safari "$URL" && exit 0
fi
IP="$(ip_rede)"
if no_ar; then EST="● Ligado (versão $(versao_de "$DEST"))"; else EST="○ Desligado"; fi
r="$(dialogo "$EST

Consultório:  http://$IP:$PORTA/
Recepção (iPad):  http://$IP:$PORTA/recepcao" '"Fechar","Abrir Consultório"' "Abrir Consultório")"
[ "$r" = "Abrir Consultório" ] && abre_consultorio
exit 0
