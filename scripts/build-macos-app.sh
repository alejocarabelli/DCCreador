#!/bin/zsh
set -euo pipefail

ROOT_DIR="${0:A:h:h}"
BUILD_DIR="/private/tmp/diseno-sistemas-macos-build"
APP_BUNDLE="$BUILD_DIR/Modelador de Sistemas.app"
CONTENTS_DIR="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
DELIVERY_DIR="$ROOT_DIR/build"
DELIVERY_ZIP="$DELIVERY_DIR/Modelador-de-Sistemas-macOS.zip"
DELIVERY_DMG="$DELIVERY_DIR/Modelador-de-Sistemas-macOS.dmg"

cd "$ROOT_DIR"
npm run build

rm -rf "$BUILD_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR/WebApp" "$DELIVERY_DIR"
cp "$ROOT_DIR/macos/Info.plist" "$CONTENTS_DIR/Info.plist"
ditto --norsrc --noextattr --noqtn --noacl "$ROOT_DIR/dist" "$RESOURCES_DIR/WebApp"

clang -O2 -fobjc-arc \
  -arch arm64 \
  -arch x86_64 \
  -mmacosx-version-min=11.3 \
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

if [[ "${SKIP_DMG:-0}" != "1" ]]; then
DMG_STAGING="$BUILD_DIR/dmg-staging"
mkdir -p "$DMG_STAGING"
ditto --norsrc --noextattr --noqtn --noacl "$APP_BUNDLE" "$DMG_STAGING/Modelador de Sistemas.app"
ln -s /Applications "$DMG_STAGING/Aplicaciones"
rm -f "$DELIVERY_DMG"
hdiutil create \
  -volname "Modelador de Sistemas" \
  -srcfolder "$DMG_STAGING" \
  -ov \
  -format UDZO \
  "$DELIVERY_DMG" >/dev/null

fi

echo "$APP_BUNDLE"
echo "$DELIVERY_ZIP"
if [[ "${SKIP_DMG:-0}" != "1" ]]; then echo "$DELIVERY_DMG"; fi
