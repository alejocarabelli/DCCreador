#!/bin/zsh
set -euo pipefail

ROOT_DIR="${0:A:h:h}"
BUILD_DIR="/private/tmp/diseno-sistemas-macos-build"
APP_BUNDLE="$BUILD_DIR/Diseño de Sistemas.app"
CONTENTS_DIR="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
DELIVERY_DIR="$ROOT_DIR/build"
DELIVERY_ZIP="$DELIVERY_DIR/Diseno-de-Sistemas-macOS.zip"

cd "$ROOT_DIR"
npm run build

rm -rf "$BUILD_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR/WebApp" "$DELIVERY_DIR"
cp "$ROOT_DIR/macos/Info.plist" "$CONTENTS_DIR/Info.plist"
ditto --norsrc --noextattr --noqtn --noacl "$ROOT_DIR/dist" "$RESOURCES_DIR/WebApp"

clang -O2 -fobjc-arc \
  -arch arm64 \
  -arch x86_64 \
  -mmacosx-version-min=12.0 \
  -framework AppKit \
  -framework WebKit \
  "$ROOT_DIR/macos/AppMain.m" \
  -o "$MACOS_DIR/DisenoDeSistemas"

APP_ARCHITECTURES="$(lipo -archs "$MACOS_DIR/DisenoDeSistemas")"
[[ "$APP_ARCHITECTURES" == *"arm64"* && "$APP_ARCHITECTURES" == *"x86_64"* ]] || {
  echo "El ejecutable no es universal: $APP_ARCHITECTURES" >&2
  exit 1
}

clang -O2 -fobjc-arc -framework AppKit "$ROOT_DIR/macos/CreateIcon.m" -o "$BUILD_DIR/CreateIcon"
"$BUILD_DIR/CreateIcon" "$BUILD_DIR/AppIcon-1024.png"
cp "$BUILD_DIR/AppIcon-1024.png" "$RESOURCES_DIR/AppIcon.png"

xattr -cr "$APP_BUNDLE"
codesign --force --deep --sign - "$APP_BUNDLE"
codesign --verify --deep --strict "$APP_BUNDLE"

rm -f "$DELIVERY_ZIP"
ditto -c -k --norsrc --noextattr --noqtn --noacl --keepParent "$APP_BUNDLE" "$DELIVERY_ZIP"

echo "$APP_BUNDLE"
echo "$DELIVERY_ZIP"
