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
SIM=0; [ "${1:-}" = "--simular" ] && SIM=1; [ "${MAXIMUS_SIMULAR:-0}" = "1" ] && SIM=1
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

# ---------------------------------------------------------------- 3) status
while :; do
  IP="$(ip_rede)"
  VI="$(versao_de "$DEST")"; VP="$(versao_de "$PACOTE")"
  if no_ar; then EST="● No ar  (versão ${VI:-?})"; LIGA="Parar servidor"; else EST="○ Parado — os computadores e o iPad não conseguem entrar"; LIGA="Ligar servidor"; fi
  [ "$SIM" = 1 ] && EST="$EST  [SIMULAÇÃO]"
  MSG="$EST

Consultório (outros Macs):  http://$IP:$PORTA/
Recepção (iPad):  http://$IP:$PORTA/recepcao
Neste Mac:  http://localhost:$PORTA/

Pasta: $DEST"
  r="$(dialogo "$MSG" '"Fechar","Mais opções…","Abrir Consultório"' "Abrir Consultório")"
  case "$r" in
    "Abrir Consultório")
      if [ -d "/Applications/Google Chrome.app" ]; then abre -na "Google Chrome" --args --app="http://localhost:$PORTA/"; else abre "http://localhost:$PORTA/"; fi
      exit 0 ;;
    "Mais opções…")
      OPC='"Abrir COMO ACESSAR","Folha do iPad (QR code)","Copiar endereço da Recepção","Reiniciar servidor","'"$LIGA"'","Ver log"'
      [ -n "$VP" ] && [ "$VP" != "$VI" ] && OPC="$OPC"',"Atualizar programa ('"$VI"' → '"$VP"')"'
      if [ "$SEMDLG" = 1 ]; then e="${MAXIMUS_OPCAO:-}"; log "OPCOES: $OPC -> $e"; else
        e="$(osascript -e "set r to choose from list {$OPC} with title \"$TITULO\" with prompt \"O que deseja fazer?\" OK button name \"Escolher\" cancel button name \"Voltar\"" -e 'if r is false then return ""' -e 'return item 1 of r' 2>/dev/null)"; fi
      case "$e" in
        "Abrir COMO ACESSAR") guia "$IP"; abre -a TextEdit "$DEST/COMO ACESSAR.txt" ;;
        "Folha do iPad (QR code)") abre "http://localhost:$PORTA/ipad" ;;
        "Copiar endereço da Recepção") printf 'http://%s:%s/recepcao' "$IP" "$PORTA" | pbcopy 2>/dev/null; aviso "Copiado: http://$IP:$PORTA/recepcao" ;;
        "Reiniciar servidor") reinicia; espera || aviso "O servidor não respondeu. Veja o log em $DEST/servidor.log" ;;
        "Parar servidor") r2="$(dialogo "Parar o servidor agora? Ninguém consegue usar o Maximus até ligar de novo (ele também volta sozinho no próximo login)." '"Voltar","Parar"' "Voltar")"; [ "$r2" = "Parar" ] && para ;;
        "Ligar servidor") liga; espera || aviso "O servidor não respondeu. Veja o log em $DEST/servidor.log" ;;
        "Ver log") abre -a Console "$DEST/servidor.log" ;;
        "Atualizar programa"*)
          r2="$(dialogo "Atualizar o programa de $VI para $VP? Os pacientes, senhas e backups ficam como estão (é feita uma cópia do banco antes)." '"Voltar","Atualizar"' "Atualizar")"
          if [ "$r2" = "Atualizar" ]; then
            [ -f "$DEST/banco_triagem.json" ] && faz cp -p "$DEST/banco_triagem.json" "$HOME/banco_triagem.backup-antes-$VP-$(date +%Y%m%d-%H%M%S).json"
            copia_programa; reinicia; espera || true
          fi ;;
      esac
      [ "$SEMDLG" = 1 ] && exit 0 ;;
    *) exit 0 ;;
  esac
done
