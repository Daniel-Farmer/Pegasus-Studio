#!/bin/bash
# ============================================================
# setup.sh — Download assets and generate model catalog
# ============================================================
# Downloads:
#   - 6 Kenney model packs (CC0) → models/kenney-*/
#   - PBR textures from AmbientCG (CC0) → textures/
#   - Generates models/catalog.json
#
# Usage:  bash scripts/setup.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODELS_DIR="$PROJECT_DIR/models"
TMP_DIR="/tmp/pegasus-studio-setup"

mkdir -p "$MODELS_DIR" "$TMP_DIR"

# ── Kenney Model Packs (CC0 — kenney.nl) ─────────────────────

# Pack name → kenney.nl asset slug
declare -A PACKS=(
  ["kenney-car-kit"]="car-kit"
  ["kenney-city-kit-suburban"]="city-kit-suburban"
  ["kenney-fantasy-town-kit"]="fantasy-town-kit"
  ["kenney-furniture-kit"]="furniture-kit"
  ["kenney-nature-kit"]="nature-kit"
  ["kenney-pirate-kit"]="pirate-kit"
)

echo "=== Pegasus Studio — Asset Setup ==="
echo ""

PACK_COUNT=0
PACK_TOTAL=${#PACKS[@]}

for DIR_NAME in "${!PACKS[@]}"; do
  SLUG="${PACKS[$DIR_NAME]}"
  PACK_COUNT=$((PACK_COUNT + 1))
  DEST="$MODELS_DIR/$DIR_NAME"

  # Skip if already downloaded
  GLB_COUNT=$(find "$DEST" -name "*.glb" 2>/dev/null | wc -l)
  if [ "$GLB_COUNT" -gt 0 ]; then
    echo "[$PACK_COUNT/$PACK_TOTAL] $DIR_NAME — already exists ($GLB_COUNT models), skipping."
    continue
  fi

  echo "[$PACK_COUNT/$PACK_TOTAL] Downloading $DIR_NAME..."

  ZIP="$TMP_DIR/$DIR_NAME.zip"
  EXTRACT="$TMP_DIR/$DIR_NAME"

  # Kenney.nl direct download URL
  URL="https://kenney.nl/media/pages/assets/$SLUG/*/$(echo $SLUG).zip"

  # Try downloading from kenney.nl
  if wget -q --timeout=60 -O "$ZIP" "https://kenney.nl/media/pages/assets/$SLUG/$(echo $SLUG).zip" 2>/dev/null && [ -s "$ZIP" ]; then
    echo "  Downloaded from kenney.nl"
  else
    # Fallback: try the assets download page pattern
    echo "  Direct download failed."
    echo "  Please download manually from: https://kenney.nl/assets/$SLUG"
    echo "  Extract GLB files to: $DEST/"
    rm -f "$ZIP"
    continue
  fi

  # Extract GLB files
  mkdir -p "$EXTRACT" "$DEST"
  unzip -qo "$ZIP" -d "$EXTRACT" 2>/dev/null

  # Find and copy all .glb files
  find "$EXTRACT" -iname "*.glb" -exec cp {} "$DEST/" \;
  GLB_FOUND=$(find "$DEST" -name "*.glb" | wc -l)
  echo "  Extracted $GLB_FOUND models → $DIR_NAME/"

  # Copy textures if present
  if [ -d "$EXTRACT/Textures" ]; then
    cp -r "$EXTRACT/Textures" "$DEST/Textures" 2>/dev/null || true
  fi

  rm -rf "$EXTRACT" "$ZIP"
done

echo ""

# ── PBR Textures (CC0 — AmbientCG) ───────────────────────────

echo "=== Downloading PBR Textures ==="
TEXTURES_SCRIPT="$SCRIPT_DIR/fetch-textures.sh"

if [ -f "$TEXTURES_SCRIPT" ]; then
  bash "$TEXTURES_SCRIPT"
else
  echo "  WARNING: scripts/fetch-textures.sh not found, skipping textures."
fi

echo ""

# ── Generate Model Catalog ────────────────────────────────────

echo "=== Generating Model Catalog ==="

if command -v node &> /dev/null; then
  node "$SCRIPT_DIR/build-catalog.js"
else
  echo "  WARNING: Node.js not found. Run 'node scripts/build-catalog.js' manually."
fi

echo ""

# ── Summary ───────────────────────────────────────────────────

TOTAL_MODELS=$(find "$MODELS_DIR" -name "*.glb" 2>/dev/null | wc -l)
TOTAL_TEXTURES=$(find "$PROJECT_DIR/textures" -name "*.jpg" 2>/dev/null | wc -l)

echo "=== Setup Complete ==="
echo "  Models:   $TOTAL_MODELS GLB files"
echo "  Textures: $TOTAL_TEXTURES texture maps"
echo ""
echo "Start the server:  node server.js"
echo "Open in browser:   http://localhost:2003"

# Cleanup
rm -rf "$TMP_DIR"
