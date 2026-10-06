#!/usr/bin/env bash
# v2.5-O — os scripts precisam rodar no bash 3.2 do macOS (/bin/bash do Mac da clínica).
# O "bash -n" do 3.2 não basta: ele só lê o que está dentro de $( ) na hora de rodar
# (foi assim que o testar.sh quebrou na 2.5.14 com um "case" dentro de $( )). Então:
#  1. procura construções do bash 4+ nos scripts;
#  2. bash -n em todos os scripts, com o bash 3.2;
#  3. roda o testar.sh INTEIRO no bash 3.2, a seco (MAXIMUS_SECO), em três jeitos.
# Acha o bash 3.2 em MAXIMUS_BASH32, /bin/bash (macOS), bash3.2 no PATH ou /usr/local/bin.
# Sem bash 3.2 na máquina, faz só a parte 1 e avisa.
set -u
cd "$(dirname "$0")/.." || exit 2
falhas=0
ok(){ if [ "$1" -eq 0 ]; then echo "  ok     $2"; else echo "  FALHA  $2"; [ -n "${3:-}" ] && echo "$3" | sed 's/^/         /' | head -8; falhas=$((falhas+1)); fi; }

B32=""
for c in "${MAXIMUS_BASH32:-}" /bin/bash "$(command -v bash3.2 2>/dev/null)" /usr/local/bin/bash3.2; do
  [ -n "$c" ] && [ -x "$c" ] || continue
  case "$("$c" -c 'echo $BASH_VERSION' 2>/dev/null)" in 3.*) B32="$c"; break ;; esac
done

SCRIPTS="$(ls scripts/*.sh tests/*.sh 2>/dev/null)"
# 1. bash 4+ (comentários fora). wait -n, arrays associativos, ${x,,}/${x^^}, mapfile,
#    &>>, |&, índice negativo, coproc, ;;& e ;&, ${x@Q}
achados=""
for f in $SCRIPTS; do
  a="$(sed 's/^[[:space:]]*#.*//' "$f" | grep -nE 'wait -n|declare -A|local -A|typeset -A|mapfile|readarray|&>>|\|&|\$\{[A-Za-z_][A-Za-z_0-9]*(,,?|\^\^?)\}|\[-[0-9]+\]\}|coproc|;;&|;&|\$\{[A-Za-z_][A-Za-z_0-9]*@[QEPAa]\}|\$\{!?[A-Za-z_]+\[@\]:-?[0-9]' | grep -v 'teste_bash32.sh')"
  [ -n "$a" ] && achados="$achados$f: $a
"
done
[ -z "$achados" ]; ok $? "nenhuma construção só do bash 4+ em scripts/ e tests/" "$achados"

if [ -z "$B32" ]; then
  echo "  aviso  sem bash 3.2 nesta máquina (defina MAXIMUS_BASH32) — só a checagem estática"
else
  echo "  bash 3.2: $B32 ($("$B32" -c 'echo $BASH_VERSION'))"
  # 2. sintaxe
  for f in $SCRIPTS; do
    e="$("$B32" -n "$f" 2>&1)"; [ -z "$e" ]; ok $? "bash 3.2 -n $f" "$e"
  done
  # 3. testar.sh inteiro, a seco: tudo verde; com uma etapa sozinha e uma de cada vez; com falha
  roda(){ # $1 = descrição, $2 = código esperado, $3 = texto esperado; resto = env
    local desc="$1" esperado="$2" texto="$3"; shift 3
    local saida rc tmp pid k=0 ruim=""
    tmp="$(mktemp "${TMPDIR:-/tmp}/teste_bash32.XXXXXX")"
    # em segundo plano, com prazo: o testar.sh quebrado da 2.5.14 ficava esperando para sempre
    env "$@" "$B32" scripts/testar.sh 3 > "$tmp" 2>&1 &
    pid=$!
    while kill -0 "$pid" 2>/dev/null && [ "$k" -lt 900 ]; do sleep 0.1; k=$((k+1)); done
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null; sleep 1; pkill -P "$pid" 2>/dev/null; kill -9 "$pid" 2>/dev/null
      ruim="travou (mais de 90 s)"
    fi
    wait "$pid"; rc=$?
    saida="$(cat "$tmp")"; rm -f "$tmp"
    [ "$rc" -eq "$esperado" ] || ruim="saiu com $rc (esperado $esperado)"
    local err; err="$(echo "$saida" | grep -m1 -E 'syntax error|unbound variable|command not found|bad substitution|unexpected')"
    [ -n "$err" ] && ruim="$ruim; erro do bash: $err"
    echo "$saida" | grep -q "$texto" || ruim="$ruim; faltou \"$texto\""
    n="$(echo "$saida" | grep -c '^──────────── ')"
    [ "$n" -ge 12 ] || ruim="$ruim; só $n etapas na saída"
    [ -z "$ruim" ]; ok $? "$desc" "$ruim
$(echo "$saida" | tail -4)"
  }
  roda "testar.sh roda inteiro no bash 3.2 (a seco, em paralelo)" 0 "tudo verde" MAXIMUS_SECO=1
  roda "… com a etapa 3 sozinha antes e uma etapa de cada vez" 0 "tudo verde" MAXIMUS_SECO=1 MAXIMUS_SOZINHAS=" 2 " MAXIMUS_JOBS=1
  roda "… e uma etapa com falha dá saída 1 e \"1 etapa(s) com falha\"" 1 "1 etapa(s) com falha" MAXIMUS_SECO=falha
fi
echo
echo "=== BASH 3.2 ==="
echo "falhas: $falhas"
exit $falhas
