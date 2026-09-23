#!/usr/bin/env bash
# Bateria completa antes de publicar qualquer mudança.
# Uso: ./scripts/testar.sh [pacientes]   (padrão 100)
set -u
N="${1:-100}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
CLIN="$RAIZ/apps/triagem.html"
RECEP="$RAIZ/apps/recepcao.html"
FIN="$RAIZ/apps/financeiro.html"
cd "$RAIZ/tests" || exit 2
falhas=0
linha(){ printf '\n──────────── %s ────────────\n' "$1"; }

linha "1. sintaxe do JavaScript"
for f in "$CLIN" "$RECEP" "$FIN"; do
  node -e "
    const fs=require('fs');
    const s=fs.readFileSync('$f','utf8');
    const js=[...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
    fs.writeFileSync('/tmp/check.js', js[js.length-1]);
  " && node --check /tmp/check.js && echo "  ok  $(basename "$f")" || { echo "  FALHA $(basename "$f")"; falhas=$((falhas+1)); }
done

linha "2. app clínico — $N atendimentos sintéticos"
node teste100.js "$CLIN" "$N" || falhas=$((falhas+1))

linha "3. recepção — $N questionários"
node teste_kiosk.js "$RECEP" "$N" || falhas=$((falhas+1))

linha "4. rastreador de módulos nas oito linhas"
node teste_modulos.js "$CLIN" 12 || falhas=$((falhas+1))

linha "5. integração recepção → consultório"
node teste_integracao.js "$CLIN" || falhas=$((falhas+1))

linha "6. regressão clínica — pacientes-limite contra a baseline"
node regressao.js "$CLIN" || falhas=$((falhas+1))

linha "resumo"
if [ "$falhas" -eq 0 ]; then
  echo "tudo verde — revise no navegador antes de publicar."
  echo "teste automatizado nao enxerga layout quebrado."
else
  echo "$falhas etapa(s) com falha — nao publique."
fi
exit "$falhas"
