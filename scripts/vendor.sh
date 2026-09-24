#!/usr/bin/env bash
# Builds the Vendored Components from the source components.json pins into
# vendor/<name>/, one Variant each: the one named, or the first components.json
# lists for this platform.
#
#   scripts/vendor.sh [whisper|llama|ffmpeg|all] [variant]
#
# A component whose vendor/<name>/VERSION already matches its pin and Variant is
# skipped, so CI can cache vendor/ and run this unconditionally.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor"
MANIFEST="$ROOT/components.json"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc)}"

require() {
  for tool in "$@"; do
    command -v "$tool" >/dev/null || { echo "vendor: $tool is required but not installed" >&2; exit 1; }
  done
}

# The Build Manifest's <field> for component <name>.
pinned() {
  jq -er --arg name "$1" --arg field "$2" '.[$name][$field]' "$MANIFEST"
}

platform() {
  case "$(uname -s)" in
    Darwin) echo macos ;;
    Linux) echo linux ;;
    MINGW*) echo windows ;;
    *) echo "vendor: $(uname -s) is not a platform components.json lists" >&2; exit 1 ;;
  esac
}

# The Variant named, if components.json lists it for this platform; else the first one listed.
variant_for() {
  local name="$1" requested="$2" platform listed
  platform="$(platform)"
  listed="$(jq -r --arg name "$name" --arg platform "$platform" '.[$name].variants[$platform][]?' "$MANIFEST")"
  if [[ -z "$requested" ]]; then
    requested="${listed%%$'\n'*}"
  fi
  if [[ -z "$requested" ]] || ! grep -qxF -- "$requested" <<<"$listed"; then
    echo "vendor: $name has no Variant ${requested:-at all} on $platform; components.json lists: ${listed//$'\n'/ }" >&2
    exit 1
  fi
  echo "$requested"
}

# Windows executables carry .exe; everywhere else they carry nothing.
exe() {
  if [[ "$(platform)" == windows ]]; then echo "$1.exe"; else echo "$1"; fi
}

# Copies the MSYS2 UCRT64 DLLs an executable loads next to it, so it runs outside MSYS2.
# Linux and macOS executables rely on the system's libraries instead.
bundle_runtime() {
  [[ "$(platform)" == windows ]] || return 0
  ldd "$1" | awk '$3 ~ "^/ucrt64/" { print $3 }' | while read -r dll; do cp "$dll" "$(dirname "$1")/"; done
}

sha256_matches() {
  if command -v sha256sum >/dev/null; then
    echo "$1  $2" | sha256sum -c --status
  else
    echo "$1  $2" | shasum -a 256 -c --status
  fi
}

up_to_date() {
  [[ -f "$VENDOR/$1/VERSION" && "$(cat "$VENDOR/$1/VERSION")" == "$2" ]]
}

fetch_source() {
  local url sha256 dir="$2" archive="$2.tar"
  require curl
  url="$(pinned "$1" source)"
  sha256="$(pinned "$1" sha256)"
  rm -rf "$dir" && mkdir -p "$dir"
  curl -fsSL -o "$archive" "$url"
  sha256_matches "$sha256" "$archive" || { echo "vendor: $url does not match its pinned SHA256" >&2; exit 1; }
  tar -xf "$archive" -C "$dir" --strip-components=1
}

build() {
  local name="$1" variant version stamp src="$VENDOR/.build/$1" staged="$VENDOR/.build/$1-out"
  variant="$(variant_for "$name" "${2:-}")"
  version="$(pinned "$name" version)"
  stamp="$version $variant"
  if up_to_date "$name" "$stamp"; then echo "vendor: $name $stamp up to date"; return; fi
  fetch_source "$name" "$src"
  # Staged first, so a failed build leaves the previous vendor/<name> usable.
  rm -rf "$staged" && mkdir -p "$staged/bin"
  "compile_$name" "$src" "$variant" "$staged/bin"
  echo "$stamp" > "$staged/VERSION"
  rm -rf "${VENDOR:?}/$name" && mv "$staged" "$VENDOR/$name"
  echo "vendor: $name $stamp built"
}

# whisper.cpp and llama.cpp share ggml, so a Variant selects the same ggml backend in both.
# ggml links statically and targets no host-specific instructions, so the executable
# needs only the libraries its backend loads (OpenBLAS, the Vulkan loader).
compile_ggml() {
  local src="$1" variant="$2" bin="$3" target="$4" backend=() generator=()
  shift 4
  require cmake
  # Ninja is single-config, so the executable lands in build/bin as it does with Make.
  if [[ "$(platform)" == windows ]]; then generator=(-G Ninja); fi
  case "$variant" in
    cpu) ;;
    openblas) backend=(-DGGML_BLAS=ON -DGGML_BLAS_VENDOR=OpenBLAS) ;;
    vulkan) backend=(-DGGML_VULKAN=ON) ;;
    metal) backend=(-DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON) ;;
    *) echo "vendor: no ggml backend is known for Variant $variant" >&2; exit 1 ;;
  esac
  cmake -S "$src" -B "$src/build" ${generator[@]+"${generator[@]}"} \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF \
    -DGGML_NATIVE=OFF \
    ${backend[@]+"${backend[@]}"} \
    "$@"
  cmake --build "$src/build" --config Release --target "$target" -j "$JOBS"
  cp "$src/build/bin/$(exe "$target")" "$bin/"
  bundle_runtime "$bin/$(exe "$target")"
}

compile_whisper() {
  compile_ggml "$@" whisper-cli -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF
}

# Tsuzuri talks to llama-server over localhost only: no Web UI, no HTTPS.
# The build number is given because git would describe Tsuzuri's checkout, not llama.cpp's.
compile_llama() {
  local version
  version="$(pinned llama version)"
  compile_ggml "$@" llama-server \
    -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF \
    -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF -DLLAMA_OPENSSL=OFF \
    -DLLAMA_BUILD_NUMBER="${version#b}" -DLLAMA_BUILD_COMMIT="$version"
}

compile_ffmpeg() {
  local src="$1" bin="$3" asm=()
  require make
  # x86 assembly needs nasm; an audio-only build decodes fast enough without it.
  if [[ "$(uname -m)" == "x86_64" ]] && ! command -v nasm >/dev/null; then asm=(--disable-x86asm); fi
  # LGPL, audio only: read the audio track of common video/audio containers and
  # write the 16 kHz mono PCM WAV whisper-cli expects. Nothing is autodetected,
  # so the result links no system library.
  (cd "$src" && ./configure \
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
  cp "$src/$(exe ffmpeg)" "$bin/"
  bundle_runtime "$bin/$(exe ffmpeg)"
}

usage() {
  echo "usage: scripts/vendor.sh [whisper|llama|ffmpeg|all] [variant]" >&2
  exit 2
}

require jq
trap 'rm -rf "$VENDOR/.build"' EXIT

case "${1:-all}" in
  whisper | llama | ffmpeg) build "$1" "${2:-}" ;;
  all) [[ -z "${2:-}" ]] || usage; build whisper; build llama; build ffmpeg ;;
  *) usage ;;
esac
