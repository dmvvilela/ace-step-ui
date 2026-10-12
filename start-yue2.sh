#!/bin/bash
# Start the UI with YuE2 (MLX) as the music engine — no ACE-Step backend needed.
# Backend: http://localhost:3001  ·  UI: http://localhost:3000
cd "$(dirname "$0")"
export MUSIC_ENGINE=yue2
export YUE2_PATH="${YUE2_PATH:-$HOME/Code/AI/yue2-mlx}"
export WHISPER_CMD="$YUE2_PATH/bin/whisper"
mkdir -p logs

(cd server && node --import tsx src/index.ts > ../logs/backend.log 2>&1) &
BACKEND_PID=$!
npx vite > logs/frontend.log 2>&1 &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; pkill -P $BACKEND_PID 2>/dev/null; exit' INT TERM
sleep 4
echo "YuE2 Studio running → http://localhost:3000  (logs in ./logs, Ctrl+C to stop)"
open http://localhost:3000 2>/dev/null
wait
