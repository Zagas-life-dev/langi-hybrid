#!/usr/bin/env bash
# Overnight pre-generation of Langi's read-aloud audio with the local voices.
#
#   bash scripts/overnight-tts.sh            # French, then Spanish
#   LANGS="fr" bash scripts/overnight-tts.sh # one language
#
# Runs every job one at a time — each language, each batch — through
# scripts/warm-tts.ts, which generates with the local Qwen3-TTS voices and
# uploads every clip to Cloudinary. Starts KoboldCpp if it isn't running, and
# makes a second pass to retry anything that failed. Finished clips are always
# skipped, so it's safe to stop and run again at any time.
# English lesson explanations are not included: they keep the existing voices.

set -u
cd "$(dirname "$0")/.."

LANGS=${LANGS:-"fr es"}
BATCHES=${BATCHES:-"examples stories vocab"}
PASSES=${PASSES:-2}
LOG=${LOG:-C:/koboldcpp/overnight-tts.log}
URL=${LOCAL_TTS_URL:-http://localhost:5001}
LAUNCHER='C:\koboldcpp\start-langi-tts.cmd'

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

server_up() { curl -sf -m 5 "$URL/api/extra/version" | grep -q '"tts": true'; }

ensure_server() {
  server_up && return 0
  log "KoboldCpp not running — starting it"
  powershell.exe -NoProfile -Command "Start-Process -WindowStyle Minimized '$LAUNCHER'" >/dev/null 2>&1
  for _ in $(seq 1 60); do
    sleep 5
    server_up && { log "KoboldCpp is up"; return 0; }
  done
  log "KoboldCpp did not come up after 5 minutes"
  return 1
}

log "=== overnight TTS: languages [$LANGS], batches [$BATCHES], $PASSES passes ==="
started=$(date +%s)

for pass in $(seq 1 "$PASSES"); do
  log "--- pass $pass of $PASSES ---"
  for lang in $LANGS; do
    for batch in $BATCHES; do
      ensure_server || { log "skipping $lang/$batch: no TTS server"; continue; }
      log ">>> $lang / $batch"
      npm run --silent warm-tts -- "$lang" --only "$batch" 2>&1 | tee -a "$LOG"
      log "<<< $lang / $batch finished (exit ${PIPESTATUS[0]})"
    done
  done
done

log "=== all done in $(( ($(date +%s) - started) / 60 )) min ==="
