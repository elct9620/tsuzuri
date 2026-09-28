#!/usr/bin/env bash
# Converts MediaTek-Research/Breeze-ASR-25 into the whisper.cpp ggml files published
# at tsuzuri-app/Breeze-ASR-25-ggml: f16, and q8_0 and q5_0 quantized from it.
# Everything is pinned, so a rerun makes the same files; a step whose output exists is skipped.
#
#   scripts/breeze.sh convert          # models/breeze-asr-25/ggml-breeze-asr-25*.bin
#   scripts/breeze.sh verify <media>   # transcribes the first minute with each file
#   scripts/breeze.sh upload           # publishes models/breeze-asr-25/ to the Hub
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/models/breeze-asr-25"
WORK="$ROOT/models/.build"
WHISPER="$WORK/whisper.cpp"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc)}"

SOURCE_REPO="MediaTek-Research/Breeze-ASR-25"
SOURCE_REVISION="cffe7ccb404d025296a00758d0a33468bec3a9d0"
# The fp16 openai-whisper checkpoint; its directory is named by its SHA256.
CHECKPOINT_SHA256="9c94a3554ff4f0de83494e2ed7ba5826efa74bd87955c034b4d0fd681746b690"
CHECKPOINT="whisper-github/$CHECKPOINT_SHA256/breeze-asr-25.pt"

# The converter reads the mel filters and tokenizer from an openai/whisper checkout.
OPENAI_WHISPER="https://raw.githubusercontent.com/openai/whisper/v20250625/whisper/assets"
MEL_FILTERS_SHA256="7450ae70723a5ef9d341e3cee628c7cb0177f36ce42c44b7ed2bf3325f0f6d4c"
TOKENIZER_SHA256="b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126"

TARGET_REPO="tsuzuri-app/Breeze-ASR-25-ggml"
NAME="ggml-breeze-asr-25"
QUANTIZATIONS=(q8_0 q5_0)

require() {
  for tool in "$@"; do
    command -v "$tool" >/dev/null || { echo "breeze: $tool is required but not installed" >&2; exit 1; }
  done
}

# Compares digests itself: the check modes of sha256sum and shasum differ between GNU, BSD and MSYS2.
sha256_matches() {
  local actual
  if command -v sha256sum >/dev/null; then
    actual="$(sha256sum "$2")"
  else
    actual="$(shasum -a 256 "$2")"
  fi
  [[ "${actual%% *}" == "$1" ]]
}

# Downloads <url> to <file> unless it is already there, and checks it against <sha256>.
fetch() {
  local url="$1" sha256="$2" file="$3"
  if [[ ! -f "$file" ]]; then
    mkdir -p "$(dirname "$file")"
    curl -fsSL -o "$file.part" "$url"
    mv "$file.part" "$file"
  fi
  sha256_matches "$sha256" "$file" || { echo "breeze: $file does not match its pinned SHA256" >&2; exit 1; }
}

# whisper.cpp at the version Tsuzuri vendors, so the files load in the Bundled whisper-cli.
build_whisper() {
  if [[ -x "$WHISPER/build/bin/whisper-quantize" && -x "$WHISPER/build/bin/whisper-cli" ]]; then return; fi
  require jq cmake
  fetch "$(jq -er .whisper.source "$ROOT/components.json")" \
    "$(jq -er .whisper.sha256 "$ROOT/components.json")" "$WORK/whisper.cpp.tar.gz"
  rm -rf "$WHISPER" && mkdir -p "$WHISPER"
  tar -xf "$WORK/whisper.cpp.tar.gz" -C "$WHISPER" --strip-components=1
  cmake -S "$WHISPER" -B "$WHISPER/build" -DCMAKE_BUILD_TYPE=Release \
    -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF
  cmake --build "$WHISPER/build" --config Release --target whisper-quantize whisper-cli -j "$JOBS"
}

convert() {
  local checkpoint f16="$OUT/$NAME.bin" quantization
  require curl hf uv
  build_whisper

  # Through the Hugging Face cache, so a checkpoint already downloaded is not fetched again.
  checkpoint="$(hf download "$SOURCE_REPO" "$CHECKPOINT" --revision "$SOURCE_REVISION")"
  sha256_matches "$CHECKPOINT_SHA256" "$checkpoint" || { echo "breeze: $checkpoint does not match its pinned SHA256" >&2; exit 1; }
  fetch "$OPENAI_WHISPER/mel_filters.npz" "$MEL_FILTERS_SHA256" "$WORK/openai-whisper/whisper/assets/mel_filters.npz"
  fetch "$OPENAI_WHISPER/multilingual.tiktoken" "$TOKENIZER_SHA256" "$WORK/openai-whisper/whisper/assets/multilingual.tiktoken"

  mkdir -p "$OUT"
  cp "$(hf download "$SOURCE_REPO" LICENSE --revision "$SOURCE_REVISION")" "$OUT/LICENSE"
  if [[ ! -f "$f16" ]]; then
    # The converter names its output ggml-model.bin, so it writes into a directory of its own.
    rm -rf "$WORK/converted" && mkdir -p "$WORK/converted"
    uv run --no-project --with torch --with numpy \
      python "$WHISPER/models/convert-pt-to-ggml.py" "$checkpoint" "$WORK/openai-whisper" "$WORK/converted"
    mv "$WORK/converted/ggml-model.bin" "$f16"
  fi
  for quantization in "${QUANTIZATIONS[@]}"; do
    if [[ ! -f "$OUT/$NAME-$quantization.bin" ]]; then
      "$WHISPER/build/bin/whisper-quantize" "$f16" "$OUT/$NAME-$quantization.bin.part" "$quantization"
      mv "$OUT/$NAME-$quantization.bin.part" "$OUT/$NAME-$quantization.bin"
    fi
  done
  ls -l "$OUT"
}

# Writes what each file hears in the first minute of <media> to models/.build/verify/, to compare by eye.
verify() {
  local media="${1:?breeze: verify needs a media file with Chinese speech}" model
  require ffmpeg
  build_whisper
  mkdir -p "$WORK/verify"
  ffmpeg -nostdin -loglevel error -y -i "$media" -t 60 -ar 16000 -ac 1 "$WORK/verify/sample.wav"
  for model in "$NAME" "${QUANTIZATIONS[@]/#/$NAME-}"; do
    "$WHISPER/build/bin/whisper-cli" -m "$OUT/$model.bin" -l zh -nt -f "$WORK/verify/sample.wav" \
      > "$WORK/verify/$model.txt" 2>/dev/null
    echo "== $model.bin"
    cat "$WORK/verify/$model.txt"
    echo
  done
}

upload() {
  require hf
  hf upload "$TARGET_REPO" "$OUT" . --commit-message "Breeze-ASR-25 ggml from $SOURCE_REPO@${SOURCE_REVISION:0:7}"
}

case "${1:-}" in
  convert) convert ;;
  verify) verify "${2:-}" ;;
  upload) upload ;;
  *) echo "usage: scripts/breeze.sh convert | verify <media> | upload" >&2; exit 1 ;;
esac
