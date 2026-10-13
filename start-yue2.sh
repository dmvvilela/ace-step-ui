#!/bin/bash
# Start the UI. YuE2 is the default engine; picking an ACE-Step model in the model menu
# starts ACE-Step 1.5 (MLX) on demand and stops it again when idle or before a YuE2 song.
# Backend: http://localhost:3001  ·  UI: http://localhost:3000  ·  ACE-Step (on demand): http://localhost:8001
cd "$(dirname "$0")"
export MUSIC_ENGINE=yue2
export YUE2_PATH="${YUE2_PATH:-$HOME/Code/AI/yue2-mlx}"
export WHISPER_CMD="$YUE2_PATH/bin/whisper"
export ACESTEP_PATH="${ACESTEP_PATH:-$HOME/Code/AI/acestep-1.5}"
export ACESTEP_API_URL="${ACESTEP_API_URL:-http://127.0.0.1:8001}"
mkdir -p logs

(cd server && node --import tsx src/index.ts > ../logs/backend.log 2>&1) &
BACKEND_PID=$!
npx vite > logs/frontend.log 2>&1 &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; pkill -P $BACKEND_PID 2>/dev/null; exit' INT TERM
sleep 4
echo "Music studio running → http://localhost:3000  (logs in ./logs, Ctrl+C to stop)"
open http://localhost:3000 2>/dev/null
wait
