#!/usr/bin/env bash
# Builds the Vendored Components - those upstream ships no prebuilt executable
# for on this platform - from pinned upstream source into vendor/<name>/.
#
#   scripts/vendor.sh [whisper|ffmpeg|all]
#
# A component whose vendor/<name>/VERSION already matches its pin is skipped,
# so CI can cache vendor/ and run this unconditionally.
set -euo pipefail

WHISPER_TAG="b5130"
WHISPER_SHA256="a9ad0f82f30cb6ac5b627874895f89571dd64f7c49d0df3a38550fdb9325fe9b"
FFMPEG_VERSION="8.1.2"
FFMPEG_SHA256="464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN)}"

require() {
  for tool in "$@"; do
    command -v "$tool" >/dev/null || { echo "vendor: $tool is required but not installed" >&2; exit 1; }
  done
}

up_to_date() {
  [[ -f "$VENDOR/$1/VERSION" && "$(cat "$VENDOR/$1/VERSION")" == "$2" ]]
}

fetch_source() {
  local url="$1" sha256="$2" dir="$3" archive="$3.tar"
  rm -rf "$dir" && mkdir -p "$dir"
  curl -fsSL -o "$archive" "$url"
  echo "$sha256  $archive" | shasum -a 256 -c --status || { echo "vendor: $url does not match its pinned SHA256" >&2; exit 1; }
  tar -xf "$archive" -C "$dir" --strip-components=1
}

build_whisper() {
  if up_to_date whisper "$WHISPER_TAG"; then echo "vendor: whisper $WHISPER_TAG up to date"; return; fi
  require cmake curl shasum
  local src="$VENDOR/.build/whisper" out="$VENDOR/whisper"
  fetch_source "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/$WHISPER_TAG.tar.gz" "$WHISPER_SHA256" "$src"
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
  echo "$WHISPER_TAG" > "$out/VERSION"
  echo "vendor: whisper $WHISPER_TAG built"
}

build_ffmpeg() {
  if up_to_date ffmpeg "$FFMPEG_VERSION"; then echo "vendor: ffmpeg $FFMPEG_VERSION up to date"; return; fi
  require make curl shasum
  local src="$VENDOR/.build/ffmpeg" out="$VENDOR/ffmpeg" asm=()
  # x86 assembly needs nasm; an audio-only build decodes fast enough without it.
  if [[ "$(uname -m)" == "x86_64" ]] && ! command -v nasm >/dev/null; then asm=(--disable-x86asm); fi
  fetch_source "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz" "$FFMPEG_SHA256" "$src"
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
  echo "$FFMPEG_VERSION" > "$out/VERSION"
  echo "vendor: ffmpeg $FFMPEG_VERSION built"
}

trap 'rm -rf "$VENDOR/.build"' EXIT

case "${1:-all}" in
  whisper) build_whisper ;;
  ffmpeg) build_ffmpeg ;;
  all) build_whisper; build_ffmpeg ;;
  *) echo "usage: scripts/vendor.sh [whisper|ffmpeg|all]" >&2; exit 2 ;;
esac
