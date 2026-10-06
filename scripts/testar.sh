#!/usr/bin/env bash
# Bateria completa antes de publicar qualquer mudança.
# Uso: ./scripts/testar.sh [pacientes]   (padrão 100)
# v2.5-M: as etapas são independentes e rodam em paralelo (no máximo MAXIMUS_JOBS ao
# mesmo tempo; padrão = núcleos da máquina). A saída sai na ordem de sempre, etapa por
# etapa, assim que cada uma (e as anteriores) termina. MAXIMUS_JOBS=1 = uma de cada vez.
# Compatível com o bash 3.2 do macOS (/bin/bash): sem wait -n, sem "case" dentro de $( ),
# e conferido em toda bateria pela última etapa (tests/teste_bash32.sh).
# MAXIMUS_SECO=1 só percorre o roteiro, sem rodar as etapas (=falha: a primeira falha) —
# é o que o teste_bash32.sh usa para rodar este script inteiro no bash 3.2.
set -u
N="${1:-100}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
CLIN="$RAIZ/apps/triagem.html"
RECEP="$RAIZ/apps/recepcao.html"
FIN="$RAIZ/apps/financeiro.html"
cd "$RAIZ/tests" || exit 2
# v2.5-M: dependências dos testes (jsdom) ficam fora do git — sem elas, instala pelo package-lock
if [ ! -d node_modules/jsdom ]; then
  echo "dependências dos testes ausentes — npm ci"
  npm ci --no-audit --no-fund >/dev/null 2>&1 || { echo "FALHA: npm ci (precisa de internet na primeira vez)"; exit 2; }
fi
NUCLEOS="$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)"
JOBS="${MAXIMUS_JOBS:-$NUCLEOS}"
[ "$JOBS" -ge 1 ] 2>/dev/null || JOBS=1
TMPD="$(mktemp -d "${TMPDIR:-/tmp}/maximus-testar.XXXXXX")"
trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$TMPD"' EXIT
trap 'exit 130' INT TERM
INICIO=$(date +%s)
linha(){ printf '\n──────────── %s ────────────\n' "$1"; }

# ---- as etapas: título | comando (rodado em tests/) -------------------------------
TIT=(); CMD=()
etapa(){ TIT+=("$1"); CMD+=("$2"); }
etapa "1. sintaxe do JavaScript" "sintaxe"
etapa "2. app clínico — $N atendimentos sintéticos" "node teste100.js '$CLIN' '$N'"
etapa "3. recepção — $N questionários" "node teste_kiosk.js '$RECEP' '$N'"
etapa "4. rastreador de módulos nas oito linhas" "node teste_modulos.js '$CLIN' 12"
etapa "5. integração recepção → consultório" "node teste_integracao.js '$CLIN'"
etapa "6. regressão clínica — pacientes-limite contra a baseline" "node regressao.js '$CLIN'"
etapa "7. jornada do médico — lista, contato, nota, avisos, ficha, texto" "node teste_jornada.js '$CLIN'"
etapa "7b. nenhuma sigla sem o ativo ao lado" "node teste_siglas.js '$CLIN'"
etapa "7c. código do paciente novo — sempre o próximo livre, vazio não avança" "node teste_codigo.js '$CLIN' '$RECEP'"
etapa "7d. interface v2.3 — atalhos, tema, busca e ⌘↵ = caminho normal" "node teste_interface.js '$CLIN'"
etapa "7e. enviar ao paciente — receita só com fórmula/medicação; orientações pós-preenchimento" "node teste_envio.js"
etapa "7f. banco de teste fictício (data/banco_teste.json) confere com o app" "node banco_teste.js --conferir"
etapa "7g. retorno e questionários da recepção (v2.4) — nova queixa, ficha estável, evolução, confirmação" "node teste_retorno.js '$CLIN'"
etapa "7h. tela da conduta (v2.4) — situação de ondas/TEFI, racional curto e sem repetição" "node teste_conduta.js"
etapa "7i. correções v2.5 — retorno sem perguntas do passado, painel enxuto, intracavernosa, contato, envio" "node teste_v25.js"
etapa "7j. retorno oral DE/DUO (v2.5-L) — nível parte do anterior: mantém, sobe, teto, DUO, trava, intracavernosa" "node teste_retorno_oral.js"
etapa "8. tela de senha dos três apps" "node teste_sessao.js"
etapa "9. servidor — acesso por perfil e rotas" "servidor"
etapa "10. recepção — toque duplo avança uma tela só (v2.5-N)" "node teste_toque.js '$RECEP'"
etapa "11. scripts no bash 3.2 do macOS — testar.sh roda inteiro em /bin/bash" "bash teste_bash32.sh"

sintaxe(){
  local f t ok=0
  for f in "$CLIN" "$RECEP" "$FIN"; do
    t="$TMPD/check-$(basename "$f").js"
    node -e "
      const fs=require('fs');
      const s=fs.readFileSync(process.argv[1],'utf8');
      const js=[...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
      fs.writeFileSync(process.argv[2], js[js.length-1]);
    " "$f" "$t" && node --check "$t" && echo "  ok  $(basename "$f")" || { echo "  FALHA $(basename "$f")"; ok=1; }
  done
  return $ok
}
servidor(){
  # pycache numa pasta temporária: não suja o repositório nem disputa com outra etapa
  PYTHONPYCACHEPREFIX="$TMPD/pycache" python3 teste_servidor.py > "$TMPD/srv.txt" 2>&1; local rc=$?
  tail -3 "$TMPD/srv.txt"; return $rc
}

# ---- ordem de largada: as mais demoradas primeiro (tempo medido na última execução) ----
TEMPOS="$RAIZ/tests/.tempos_testar"
NT=${#TIT[@]}
ORDEM="$(for i in $(seq 0 $((NT-1))); do
  t=$(awk -F'\t' -v k="$i" '$1==k{print $2}' "$TEMPOS" 2>/dev/null); echo "${t:-999} $i"; done | sort -rn | awk '{print $2}')"

roda_etapa(){   # $1 = índice
  local i=$1 t0 rc
  t0=$(date +%s)
  if [ -n "${MAXIMUS_SECO:-}" ]; then
    rc=0; [ "$MAXIMUS_SECO" = falha ] && [ "$i" -eq 0 ] && rc=1
    echo "  (seco) ${CMD[$i]}" > "$TMPD/$i.out"; echo "$rc 0" > "$TMPD/$i.rc"; return
  fi
  if [ "${CMD[$i]}" = sintaxe ] || [ "${CMD[$i]}" = servidor ]; then "${CMD[$i]}" > "$TMPD/$i.out" 2>&1; rc=$?
  else eval "${CMD[$i]}" > "$TMPD/$i.out" 2>&1; rc=$?; fi
  echo "$rc $(( $(date +%s) - t0 ))" > "$TMPD/$i.rc"
}

proximo=0; falhas=0
mostra_prontas(){   # imprime, na ordem original, as etapas já terminadas
  while [ "$proximo" -lt "$NT" ] && [ -f "$TMPD/$proximo.rc" ]; do
    linha "${TIT[$proximo]}"
    cat "$TMPD/$proximo.out"
    set -- $(cat "$TMPD/$proximo.rc")
    [ "$1" -eq 0 ] || falhas=$((falhas+1))
    proximo=$((proximo+1))
  done
}
# etapas que precisam rodar sozinhas, antes das outras (índice a partir de 0, entre espaços).
# Até a v2.5-M o kiosk (" 2 ") rodava sozinho: o teste tocava de novo antes do avanço de
# 160 ms e dependia do relógio. Na v2.5-N ele espera a tela trocar e roda junto.
SOZINHAS="${MAXIMUS_SOZINHAS:-}"
for i in $SOZINHAS; do roda_etapa "$i"; done
# bash 3.2: o ")" de um padrão de "case" dentro de $( ) fecha a substituição antes da hora
# ("syntax error near unexpected token `newline'"). Por isso o filtro fica numa função.
tira_sozinhas(){ local i; for i in $ORDEM; do case "$SOZINHAS" in *" $i "*) ;; *) echo "$i" ;; esac; done; }
ORDEM="$(tira_sozinhas)"
lancadas=0
rodando(){ echo $(( lancadas - $(ls "$TMPD" | grep -c '\.rc$') + $(echo $SOZINHAS | wc -w) )); }   # sem "jobs": igual no bash 3.2
for i in $ORDEM; do
  while [ "$(rodando)" -ge "$JOBS" ]; do sleep 0.2; mostra_prontas; done
  roda_etapa "$i" &
  lancadas=$((lancadas+1))
done
# se alguma etapa não largou (roteiro quebrado), avisa e sai em vez de esperar para sempre
if [ $(( lancadas + $(echo $SOZINHAS | wc -w) )) -ne "$NT" ]; then
  echo "ERRO no testar.sh: largaram $(( lancadas + $(echo $SOZINHAS | wc -w) )) de $NT etapas — roteiro quebrado (ORDEM='$(echo $ORDEM)')"
  exit 3
fi
while [ "$proximo" -lt "$NT" ]; do sleep 0.2; mostra_prontas; done
wait
rm -rf "$RAIZ/__pycache__" "$RAIZ/tests/__pycache__"
# guarda os tempos para a próxima largada (a rodada seca não mede nada)
[ -n "${MAXIMUS_SECO:-}" ] || for i in $(seq 0 $((NT-1))); do set -- $(cat "$TMPD/$i.rc"); printf '%s\t%s\n' "$i" "$2"; done > "$TEMPOS" 2>/dev/null

linha "resumo"
echo "tempo total: $(( $(date +%s) - INICIO ))s · $JOBS etapa(s) ao mesmo tempo · por etapa: $(for i in $(seq 0 $((NT-1))); do set -- $(cat "$TMPD/$i.rc"); printf '%s=%ss ' "$(echo "${TIT[$i]}" | cut -d. -f1)" "$2"; done)"
if [ "$falhas" -eq 0 ]; then
  echo "tudo verde — revise no navegador antes de publicar."
  echo "teste automatizado nao enxerga layout quebrado."
else
  echo "$falhas etapa(s) com falha — nao publique."
fi
exit "$falhas"
