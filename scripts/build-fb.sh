#!/bin/bash
# Build script: creates a zip ready for Facebook Instant Games upload
# Usage: bash scripts/build-fb.sh  (run from project root)
# Builds the 3D version (index-3d.html) as the entry point

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

DIST_DIR="dist"
ZIP_NAME="pegasus-studio-fb.zip"

rm -rf "$DIST_DIR" "$ZIP_NAME"
mkdir -p "$DIST_DIR"

# Copy 3D entry point as index.html (FB requires index.html)
cp views/index-3d.html "$DIST_DIR/index.html"

# Copy JS modules
mkdir -p "$DIST_DIR/js/lib"
cp js/lib/three.min.js "$DIST_DIR/js/lib/"
cp js/constants.js "$DIST_DIR/js/"
cp js/controls.js "$DIST_DIR/js/"
cp js/collision.js "$DIST_DIR/js/"
cp js/geometry.js "$DIST_DIR/js/"
cp js/world.js "$DIST_DIR/js/"
cp js/main.js "$DIST_DIR/js/"

# Copy FB config
cp fbapp-config.json "$DIST_DIR/"

# Create zip
cd "$DIST_DIR"
zip -r "../$ZIP_NAME" .
cd ..

# Report size
ZIP_SIZE=$(du -h "$ZIP_NAME" | cut -f1)
echo ""
echo "Built: $ZIP_NAME ($ZIP_SIZE)"
echo "Upload this zip at: https://developers.facebook.com/apps/YOUR_APP_ID/instant-games/hosting/"
