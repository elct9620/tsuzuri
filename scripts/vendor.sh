#!/usr/bin/env bash
# Builds the Vendored Components - those upstream ships no prebuilt executable
# for on this platform - from the source components.json pins into vendor/<name>/.
#
#   scripts/vendor.sh [whisper|ffmpeg|all]
#
# A component whose vendor/<name>/VERSION already matches its pin is skipped,
# so CI can cache vendor/ and run this unconditionally.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor"
MANIFEST="$ROOT/components.json"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN)}"

require() {
  for tool in "$@"; do
    command -v "$tool" >/dev/null || { echo "vendor: $tool is required but not installed" >&2; exit 1; }
  done
}

# The Build Manifest's <field> for component <name>.
pinned() {
  jq -er --arg name "$1" --arg field "$2" '.[$name][$field]' "$MANIFEST"
}

up_to_date() {
  [[ -f "$VENDOR/$1/VERSION" && "$(cat "$VENDOR/$1/VERSION")" == "$2" ]]
}

fetch_source() {
  local url sha256 dir="$2" archive="$2.tar"
  url="$(pinned "$1" source)"
  sha256="$(pinned "$1" sha256)"
  rm -rf "$dir" && mkdir -p "$dir"
  curl -fsSL -o "$archive" "$url"
  echo "$sha256  $archive" | shasum -a 256 -c --status || { echo "vendor: $url does not match its pinned SHA256" >&2; exit 1; }
  tar -xf "$archive" -C "$dir" --strip-components=1
}

build_whisper() {
  local version src="$VENDOR/.build/whisper" out="$VENDOR/whisper"
  version="$(pinned whisper version)"
  if up_to_date whisper "$version"; then echo "vendor: whisper $version up to date"; return; fi
  require cmake curl shasum
  fetch_source whisper "$src"
  # Static libraries and an embedded Metal library leave one self-contained executable.
  cmake -S "$src" -B "$src/build" \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF \
    -DGGML_METAL_EMBED_LIBRARY=ON \
    -DWHISPER_BUILD_TESTS=OFF \
    -DWHISPER_BUILD_SERVER=OFF
  cmake --build "$src/build" --config Release --target whisper-cli -j "$JOBS"
  rm -rf "$out" && mkdir -p "$out/bin"
  cp "$src/build/bin/whisper-cli" "$out/bin/"
  echo "$version" > "$out/VERSION"
  echo "vendor: whisper $version built"
}

build_ffmpeg() {
  local version src="$VENDOR/.build/ffmpeg" out="$VENDOR/ffmpeg" asm=()
  version="$(pinned ffmpeg version)"
  if up_to_date ffmpeg "$version"; then echo "vendor: ffmpeg $version up to date"; return; fi
  require make curl shasum
  # x86 assembly needs nasm; an audio-only build decodes fast enough without it.
  if [[ "$(uname -m)" == "x86_64" ]] && ! command -v nasm >/dev/null; then asm=(--disable-x86asm); fi
  fetch_source ffmpeg "$src"
  # LGPL, audio only: read the audio track of common video/audio containers and
  # write the 16 kHz mono PCM WAV whisper-cli expects. Nothing is autodetected,
  # so the result links no system library.
  (cd "$src" && ./configure \
    --prefix="$out" \
    --disable-everything --disable-autodetect --disable-network --disable-doc \
    --disable-programs --enable-ffmpeg \
    --disable-avdevice --disable-swscale \
    --enable-protocol=file,pipe \
    --enable-demuxer=mov,mp3,wav,matroska,ogg,flac,aac \
    --enable-decoder=aac,aac_latm,mp3,mp3float,opus,vorbis,flac,alac,pcm_s16le,pcm_s24le,pcm_f32le \
    --enable-parser=aac,mpegaudio,opus,vorbis,flac \
    --enable-encoder=pcm_s16le --enable-muxer=wav \
    --enable-filter=aresample,aformat,anull \
    --enable-swresample \
    ${asm[@]+"${asm[@]}"})
  make -C "$src" -j "$JOBS"
  rm -rf "$out" && mkdir -p "$out/bin"
  cp "$src/ffmpeg" "$out/bin/"
  echo "$version" > "$out/VERSION"
  echo "vendor: ffmpeg $version built"
}

require jq
trap 'rm -rf "$VENDOR/.build"' EXIT

case "${1:-all}" in
  whisper) build_whisper ;;
  ffmpeg) build_ffmpeg ;;
  all) build_whisper; build_ffmpeg ;;
  *) echo "usage: scripts/vendor.sh [whisper|ffmpeg|all]" >&2; exit 2 ;;
esac
