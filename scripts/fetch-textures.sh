#!/bin/bash
# Fetch CC0 PBR textures from ambientCG.com
# All textures are CC0 licensed (public domain)

DEST="$(cd "$(dirname "$0")/.." && pwd)/textures"
TMP="/tmp/xj-textures"
mkdir -p "$DEST" "$TMP"

ASSETS=(
  Bricks076
  Bricks090
  Concrete034
  Concrete042
  Wood072
  WoodFloor040
  WoodFloor051
  Metal038
  MetalPlates006
  PavingStones058
  PavingStones131
  Rock051
  Tiles074
  Tiles093
  Tiles101
  Ground037
  Ground054
  Grass004
  Sand005
  Marble006
  Plaster001
  Leather008
  Fabric048
  Asphalt004
)

TOTAL=${#ASSETS[@]}
COUNT=0

for ASSET in "${ASSETS[@]}"; do
  COUNT=$((COUNT + 1))
  echo "[$COUNT/$TOTAL] Downloading $ASSET..."

  # Skip if already downloaded
  if [ -f "$DEST/${ASSET}_Color.jpg" ]; then
    echo "  Already exists, skipping."
    continue
  fi

  ZIP="$TMP/${ASSET}.zip"
  URL="https://ambientcg.com/get?file=${ASSET}_1K-JPG.zip"

  wget -q --timeout=30 -O "$ZIP" "$URL" 2>/dev/null
  if [ $? -ne 0 ] || [ ! -s "$ZIP" ]; then
    echo "  FAILED to download $ASSET"
    rm -f "$ZIP"
    continue
  fi

  # Extract to temp dir
  EXTRACT_DIR="$TMP/${ASSET}_extract"
  mkdir -p "$EXTRACT_DIR"
  unzip -qo "$ZIP" -d "$EXTRACT_DIR" 2>/dev/null

  # Find and copy the maps we need
  COLOR=$(find "$EXTRACT_DIR" -iname "*_Color.*" -o -iname "*_Color_*" | head -1)
  NORMAL=$(find "$EXTRACT_DIR" -iname "*_NormalGL.*" -o -iname "*_NormalGL_*" | head -1)
  ROUGH=$(find "$EXTRACT_DIR" -iname "*_Roughness.*" -o -iname "*_Roughness_*" | head -1)

  if [ -n "$COLOR" ]; then
    cp "$COLOR" "$DEST/${ASSET}_Color.jpg"
    echo "  Color map OK"
  else
    echo "  WARNING: No color map found"
  fi

  if [ -n "$NORMAL" ]; then
    cp "$NORMAL" "$DEST/${ASSET}_Normal.jpg"
    echo "  Normal map OK"
  else
    echo "  WARNING: No normal map found"
  fi

  if [ -n "$ROUGH" ]; then
    cp "$ROUGH" "$DEST/${ASSET}_Roughness.jpg"
    echo "  Roughness map OK"
  else
    echo "  WARNING: No roughness map found"
  fi

  # Cleanup
  rm -rf "$EXTRACT_DIR" "$ZIP"
done

echo ""
echo "Done! Downloaded textures to $DEST"
ls -la "$DEST"/*.jpg 2>/dev/null | wc -l
echo "texture files total"
