#!/usr/bin/env bash
# v2.5.20 — gera os apps de Mac do Maximus (sem assinatura) a partir do repositório:
#   "Maximus Servidor.app"     instala/liga o servidor e mostra status + endereços
#   "Maximus Consultório.app"  abre a triagem numa janela de app, ligada ao servidor
# e um .zip de cada (arquivo único para copiar por AirDrop/pendrive).
# A Recepção do iPad não vira .app (o iPad não instala apps de fora da App Store):
# ela é instalada pelo Safari (Adicionar à Tela de Início) — veja /ipad no servidor.
#
#   scripts/criar_apps_mac.sh [pasta-de-saída]     (padrão: dist/apps)
# Ícones: scripts/icones/*.png (1024 px). Usa iconutil no Mac; fora dele, o Pillow.
# Nunca empacota banco_triagem.json, senhas.json, backups nem logs.
set -eu
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
SAIDA="${1:-$RAIZ/dist/apps}"
VERSAO="$(sed -n 's/.*data-versao="\([^"]*\)".*/\1/p' "$RAIZ/apps/triagem.html" | head -1)"
mkdir -p "$SAIDA"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/maximus-apps.XXXXXX")"; trap 'rm -rf "$TMP"' EXIT

icns(){  # png 1024 -> .icns
  local png="$1" out="$2"
  if command -v iconutil >/dev/null 2>&1 && command -v sips >/dev/null 2>&1; then
    local set="$TMP/$(basename "$out" .icns).iconset"; mkdir -p "$set"
    for s in 16 32 128 256 512; do
      sips -z $s $s "$png" --out "$set/icon_${s}x${s}.png" >/dev/null
      sips -z $((s*2)) $((s*2)) "$png" --out "$set/icon_${s}x${s}@2x.png" >/dev/null
    done
    iconutil -c icns "$set" -o "$out"
  else
    python3 -c "
import sys; from PIL import Image
Image.open(sys.argv[1]).convert('RGBA').save(sys.argv[2], sizes=[(16,16),(32,32),(64,64),(128,128),(256,256),(512,512),(1024,1024)])" "$png" "$out"
  fi
}

app(){  # nome, id, executavel, script, icone
  local nome="$1" id="$2" exe="$3" script="$4" icone="$5"
  local A="$SAIDA/$nome.app"
  rm -rf "$A"; mkdir -p "$A/Contents/MacOS" "$A/Contents/Resources"
  cp "$RAIZ/scripts/apps_mac/$script" "$A/Contents/MacOS/$exe"; chmod 755 "$A/Contents/MacOS/$exe"
  icns "$RAIZ/scripts/icones/$icone.png" "$A/Contents/Resources/AppIcon.icns"
  printf 'APPL????' > "$A/Contents/PkgInfo"
  cat > "$A/Contents/Info.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$nome</string>
  <key>CFBundleDisplayName</key><string>$nome</string>
  <key>CFBundleIdentifier</key><string>$id</string>
  <key>CFBundleExecutable</key><string>$exe</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSAO</string>
  <key>CFBundleVersion</key><string>$VERSAO</string>
  <key>CFBundleDevelopmentRegion</key><string>pt-BR</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppleEventsUsageDescription</key><string>O Maximus usa janelas do macOS para mostrar o status e pedir o endereço do servidor.</string>
</dict>
</plist>
PL
  command -v plutil >/dev/null 2>&1 && plutil -lint "$A/Contents/Info.plist" >/dev/null
  echo "$A"
}

S="$(app "Maximus Servidor" br.com.maximus.app.servidor maximus-servidor servidor.sh servidor)"
P="$S/Contents/Resources/maximus"
mkdir -p "$P/apps/icones" "$P/apps/vendor" "$P/scripts"
cp "$RAIZ/servidor_maximus.py" "$P/"
cp "$RAIZ"/apps/*.html "$P/apps/"
cp "$RAIZ"/apps/icones/*.png "$P/apps/icones/"
cp "$RAIZ"/apps/vendor/*.js "$P/apps/vendor/"
cp "$RAIZ/scripts/instalar_launchd.sh" "$P/scripts/"
C="$(app "Maximus Consultório" br.com.maximus.app.consultorio maximus-consultorio consultorio.sh consultorio)"
# trava: nada de dado de paciente ou senha dentro dos apps
if find "$SAIDA" \( -name 'banco_*.json' -o -name 'senhas.json' -o -name '*.log' -o -name 'backups' \) | grep -q .; then
  echo "ERRO: dado sensível dentro do app"; exit 1
fi
command -v xattr >/dev/null 2>&1 && xattr -cr "$S" "$C" 2>/dev/null || true
cd "$SAIDA"
for a in "Maximus Servidor" "Maximus Consultório"; do
  rm -f "$a.zip"
  if command -v ditto >/dev/null 2>&1; then ditto -c -k --keepParent "$a.app" "$a.zip"; else python3 -c "import shutil,sys; shutil.make_archive(sys.argv[1], 'zip', '.', sys.argv[2])" "$a" "$a.app"; fi
done
echo "apps $VERSAO em $SAIDA:"; ls -1 "$SAIDA"
