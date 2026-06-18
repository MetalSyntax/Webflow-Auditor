#!/usr/bin/env bash
# =============================================================
# Webflow Auditor — Build & Package Script
# Uso: ./build.sh
# =============================================================
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

ROOT="$(cd "$(dirname "$0")" && pwd)"
DOCS="$ROOT/docs"
DOWNLOADS="$DOCS/downloads"
KEYS_DIR="$ROOT/.keys"
PEM_FILE="$KEYS_DIR/extension.pem"

echo -e "${BOLD}${BLUE}"
echo "╔══════════════════════════════════════╗"
echo "║    Webflow Auditor — Build Script    ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Leer versión actual ───────────────────────────────────
CURRENT=$(python3 -c "import json; print(json.load(open('$ROOT/manifest.json'))['version'])")
echo -e "Versión actual: ${YELLOW}v$CURRENT${NC}"
echo ""

IFS='.' read -ra P <<< "$CURRENT"
MAJ="${P[0]}"; MIN="${P[1]}"; PAT="${P[2]}"

echo "¿Qué tipo de release?"
echo -e "  ${BOLD}1)${NC} Patch  →  $MAJ.$MIN.$((PAT + 1))   (bug fixes)"
echo -e "  ${BOLD}2)${NC} Minor  →  $MAJ.$((MIN + 1)).0      (nuevas features)"
echo -e "  ${BOLD}3)${NC} Major  →  $((MAJ + 1)).0.0         (breaking changes)"
echo -e "  ${BOLD}4)${NC} Custom →  ingresar manualmente"
echo ""
read -rp "Opción [1-4]: " CHOICE

case $CHOICE in
  1) NEW_VERSION="$MAJ.$MIN.$((PAT + 1))" ;;
  2) NEW_VERSION="$MAJ.$((MIN + 1)).0" ;;
  3) NEW_VERSION="$((MAJ + 1)).0.0" ;;
  4) read -rp "Nueva versión (formato X.Y.Z): " NEW_VERSION ;;
  *) echo -e "${RED}Opción inválida.${NC}"; exit 1 ;;
esac

echo ""
echo -e "Nueva versión: ${GREEN}${BOLD}v$NEW_VERSION${NC}"
read -rp "¿Confirmar? (s/N): " CONFIRM
[[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]] && echo "Cancelado." && exit 0

mkdir -p "$DOWNLOADS" "$KEYS_DIR"

# ── 2. Actualizar manifest.json ──────────────────────────────
python3 - << PYEOF
import json
with open('$ROOT/manifest.json') as f:
    m = json.load(f)
m['version'] = '$NEW_VERSION'
with open('$ROOT/manifest.json', 'w') as f:
    json.dump(m, f, indent=2)
    f.write('\n')
PYEOF
echo -e "${GREEN}✓${NC} manifest.json → v$NEW_VERSION"

# ── 3. Crear ZIP ─────────────────────────────────────────────
ZIP_VER="$DOWNLOADS/webflow-auditor-v$NEW_VERSION.zip"
ZIP_LATEST="$DOWNLOADS/webflow-auditor-latest.zip"

cd "$ROOT"
zip -r "$ZIP_VER" manifest.json popup.html popup.js content.js styles.css icons/ \
  --exclude "*.DS_Store" -q

cp "$ZIP_VER" "$ZIP_LATEST"
echo -e "${GREEN}✓${NC} ZIP → $(basename "$ZIP_VER")"

# ── 4. Crear CRX con Chrome ──────────────────────────────────
CHROME_BIN=""
CHROME_PATHS=(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
  "/usr/bin/google-chrome"
  "/usr/bin/chromium-browser"
  "/usr/bin/chromium"
)
for p in "${CHROME_PATHS[@]}"; do
  [[ -x "$p" ]] && CHROME_BIN="$p" && break
done

CRX_VER="$DOWNLOADS/webflow-auditor-v$NEW_VERSION.crx"
CRX_LATEST="$DOWNLOADS/webflow-auditor-latest.crx"

if [[ -n "$CHROME_BIN" ]]; then
  echo -e "${BLUE}Empaquetando CRX con Chrome...${NC}"

  # Chrome crea el .crx en el directorio PADRE de la extensión,
  # así que usamos una copia temporal.
  TMP_EXT=$(mktemp -d)
  cp -r "$ROOT"/{manifest.json,popup.html,popup.js,content.js,styles.css,icons} "$TMP_EXT/"

  PEM_FLAG=""
  [[ -f "$PEM_FILE" ]] && PEM_FLAG="--pack-extension-key=$PEM_FILE"

  "$CHROME_BIN" \
    --pack-extension="$TMP_EXT" \
    $PEM_FLAG \
    --no-message-box 2>/dev/null || true

  GENERATED_CRX="${TMP_EXT}.crx"
  GENERATED_PEM="${TMP_EXT}.pem"

  if [[ -f "$GENERATED_CRX" ]]; then
    cp "$GENERATED_CRX" "$CRX_VER"
    cp "$GENERATED_CRX" "$CRX_LATEST"
    echo -e "${GREEN}✓${NC} CRX  → $(basename "$CRX_VER")"

    # Guardar la clave privada solo la primera vez
    if [[ -f "$GENERATED_PEM" && ! -f "$PEM_FILE" ]]; then
      cp "$GENERATED_PEM" "$PEM_FILE"
      echo -e "${GREEN}✓${NC} Clave privada guardada en ${YELLOW}.keys/extension.pem${NC}"
      echo -e "  ${YELLOW}⚠  Haz un backup de esta clave — sin ella no puedes re-empaquetar la misma extensión.${NC}"
    fi

    rm -f "$GENERATED_CRX" "$GENERATED_PEM"
  else
    echo -e "${YELLOW}⚠  Chrome no generó el CRX. Revisa permisos o prueba manualmente.${NC}"
  fi
  rm -rf "$TMP_EXT"
else
  echo -e "${YELLOW}⚠  Chrome no encontrado. Solo se generó el ZIP.${NC}"
  echo -e "   Instala Chrome o agrega su ruta al script para generar CRX."
fi

# ── 5. Actualizar docs/update.xml ───────────────────────────
# Leer el appid y la base URL desde el update.xml existente
EXT_ID=$(grep -o 'appid="[^"]*"' "$DOCS/update.xml" 2>/dev/null | head -1 | cut -d'"' -f2)
EXT_ID="${EXT_ID:-EXTENSION_ID_AQUI}"

BASE_URL=$(grep -o 'codebase="[^"]*"' "$DOCS/update.xml" 2>/dev/null | head -1 | sed 's|codebase="||;s|/downloads/.*||;s|"||')
BASE_URL="${BASE_URL:-https://TU-USUARIO.github.io/webflow-auditor}"

cat > "$DOCS/update.xml" << XMLEOF
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='$EXT_ID'>
    <updatecheck
      codebase='$BASE_URL/downloads/webflow-auditor-latest.crx'
      version='$NEW_VERSION' />
  </app>
</gupdate>
XMLEOF
echo -e "${GREEN}✓${NC} update.xml → v$NEW_VERSION"

# ── 6. Actualizar versión en index.html ──────────────────────
if [[ -f "$DOCS/index.html" ]]; then
  sed -i.bak "s/v[0-9]\+\.[0-9]\+\.[0-9]\+/v$NEW_VERSION/g" "$DOCS/index.html"
  rm -f "$DOCS/index.html.bak"
  echo -e "${GREEN}✓${NC} index.html → v$NEW_VERSION"
fi

# ── 7. Resumen ───────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Build completo: v$NEW_VERSION${NC}"
echo ""
echo "Archivos generados:"
ls -lh "$DOWNLOADS/"
echo ""
echo -e "${BOLD}Próximos pasos:${NC}"
echo "  git add -A"
echo "  git commit -m \"release: v$NEW_VERSION\""
echo "  git tag v$NEW_VERSION"
echo "  git push && git push --tags"
