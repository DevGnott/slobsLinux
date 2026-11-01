#!/usr/bin/env bash
# Builds the native backend of Streamlabs Desktop for Linux (x64):
#   1. libobs from the stream-labs/obs-studio fork (with scripts/linux/obs-studio.patch)
#   2. obs-studio-node (Linux port) against that libobs
# and installs the result into node_modules/obs-studio-node.
#
# Usage: scripts/linux/build-native.sh [work-dir]
# Environment overrides: OBS_TAG, OSN_REPO, OSN_BRANCH, JOBS
set -euo pipefail

DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="${1:-$HOME/slobs-linux-build}"
OBS_REPO="https://github.com/stream-labs/obs-studio.git"
OBS_TAG="${OBS_TAG:-32.1.1sl21}"
OSN_REPO="${OSN_REPO:-https://github.com/DevGnott/obs-studio-node.git}"
OSN_BRANCH="${OSN_BRANCH:-linux-port}"
JOBS="${JOBS:-$(nproc)}"

LIBOBS_PREFIX="$WORK_DIR/libobs-install"
OSN_TARGET="$DESKTOP_DIR/node_modules/obs-studio-node"

mkdir -p "$WORK_DIR"

echo "==> libobs $OBS_TAG"
if [ ! -d "$WORK_DIR/obs-studio" ]; then
  git clone --depth 1 --branch "$OBS_TAG" --recurse-submodules --shallow-submodules \
    "$OBS_REPO" "$WORK_DIR/obs-studio"
  git -C "$WORK_DIR/obs-studio" apply "$DESKTOP_DIR/scripts/linux/obs-studio.patch"
fi

cmake -S "$WORK_DIR/obs-studio" -B "$WORK_DIR/obs-studio/build_linux" -G Ninja \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo \
  -DCMAKE_INSTALL_PREFIX="$LIBOBS_PREFIX" \
  -DENABLE_RELOCATABLE=ON \
  -DENABLE_FRONTEND=OFF -DENABLE_UI=OFF -DENABLE_SCRIPTING=OFF -DENABLE_BROWSER=OFF \
  -DENABLE_WEBRTC=OFF -DENABLE_AJA=OFF -DENABLE_QSV11=OFF -DENABLE_NVENC=OFF \
  -DENABLE_DECKLINK=OFF -DENABLE_WAYLAND=ON -DENABLE_PIPEWIRE=ON -DENABLE_VLC=ON
cmake --build "$WORK_DIR/obs-studio/build_linux" --parallel "$JOBS"
cmake --install "$WORK_DIR/obs-studio/build_linux"

echo "==> obs-studio-node ($OSN_BRANCH)"
if [ ! -d "$WORK_DIR/obs-studio-node" ]; then
  git clone --branch "$OSN_BRANCH" --recurse-submodules "$OSN_REPO" "$WORK_DIR/obs-studio-node"
fi
(cd "$WORK_DIR/obs-studio-node" && yarn install --mode=skip-build)

# Install into a fresh directory: cmake --install skips files whose size and
# timestamp did not change, which hides RUNPATH-only changes of libobs.
STAGE="$WORK_DIR/osn-dist"
rm -rf "$STAGE"
cmake -S "$WORK_DIR/obs-studio-node" -B "$WORK_DIR/obs-studio-node/build_linux" -G Ninja \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo -DBUILD_TESTING=OFF \
  -DOSN_LIBOBS_PREFIX="$LIBOBS_PREFIX" \
  -DCMAKE_INSTALL_PREFIX="$STAGE"
cmake --build "$WORK_DIR/obs-studio-node/build_linux" --parallel "$JOBS"
cmake --install "$WORK_DIR/obs-studio-node/build_linux"

echo "==> Installing into $OSN_TARGET"
mkdir -p "$OSN_TARGET"
rm -rf "$OSN_TARGET/bin" "$OSN_TARGET/lib" "$OSN_TARGET/data" "$OSN_TARGET/obs-plugins" \
  "$OSN_TARGET"/obs_studio_client.node*
cp -a "$STAGE"/. "$OSN_TARGET"/

echo "Done. Start the app with: yarn compile && yarn start"
