#!/bin/zsh
set -euo pipefail

if [[ -d "/Library/Developer/CommandLineTools" ]]; then
  export DEVELOPER_DIR="/Library/Developer/CommandLineTools"
fi

ROOT_DIR="${0:A:h:h}"
# Beta 2.0: nombre, ejecutable, carpeta de compilación y ruta de instalación
# propios, para convivir con /Applications/Modelador de Sistemas.app (v1).
APP_NAME="Modelador de Sistemas 2.0 Beta"
EXECUTABLE="ModeladorBeta"
BUILD_DIR="/private/tmp/modelador-sistemas-v2-beta-build"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"
INSTALL_PATH="/Applications/$APP_NAME.app"
CONTENTS_DIR="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
DELIVERY_DIR="$ROOT_DIR/build"
DELIVERY_ZIP="$DELIVERY_DIR/Modelador-de-Sistemas-2.0-Beta-macOS.zip"
DELIVERY_DMG="$DELIVERY_DIR/Modelador-de-Sistemas-2.0-Beta-macOS.dmg"

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
  -o "$MACOS_DIR/$EXECUTABLE"

APP_ARCHITECTURES="$(lipo -archs "$MACOS_DIR/$EXECUTABLE")"
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

# Nunca toca la v1: solo reemplaza una beta instalada antes en su propia ruta.
if [[ "${SKIP_INSTALL:-0}" != "1" ]] && [[ -w "/Applications" || -w "$INSTALL_PATH" ]]; then
  rm -rf "$INSTALL_PATH"
  ditto --norsrc --noextattr --noqtn --noacl "$APP_BUNDLE" "$INSTALL_PATH"
  echo "Instalado/Actualizado en $INSTALL_PATH"
fi

if [[ "${SKIP_DMG:-0}" != "1" ]]; then
DMG_STAGING="$BUILD_DIR/dmg-staging"
mkdir -p "$DMG_STAGING"
ditto --norsrc --noextattr --noqtn --noacl "$APP_BUNDLE" "$DMG_STAGING/$APP_NAME.app"
ln -s /Applications "$DMG_STAGING/Aplicaciones"
rm -f "$DELIVERY_DMG"
hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$DMG_STAGING" \
  -ov \
  -format UDZO \
  "$DELIVERY_DMG" >/dev/null

fi

echo "$APP_BUNDLE"
echo "$DELIVERY_ZIP"
if [[ "${SKIP_DMG:-0}" != "1" ]]; then echo "$DELIVERY_DMG"; fi
