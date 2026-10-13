import { spawn, type ChildProcess } from 'child_process';
import { mkdirSync, openSync } from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { isGradioAvailable, resetGradioClient } from './gradio-client.js';

// ACE-Step 1.5 (MLX) holds ~20+ GB while loaded, so it only runs on demand:
// started for the first ACE song, stopped before a YuE2 song or after sitting idle.

const ACE_DIR = process.env.ACESTEP_PATH || path.join(process.env.HOME || '', 'Code/AI/acestep-1.5');
const ACE_LM = process.env.ACESTEP_LM_MODEL || 'acestep-5Hz-lm-1.7B';
const IDLE_MS = Number(process.env.ACESTEP_IDLE_MINUTES || 10) * 60_000;
const START_TIMEOUT_MS = 5 * 60_000;

let proc: ChildProcess | null = null;
let starting: Promise<void> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

export async function ensureAceServer(onStage?: (stage: string) => void): Promise<void> {
  cancelIdleStop();
  if (await isGradioAvailable()) return; // already up (ours or started by hand)
  if (starting) return starting;

  starting = (async () => {
    onStage?.('Starting ACE-Step (first song takes ~1 min)...');
    const port = new URL(config.acestep.apiUrl).port || '8001';
    const logDir = path.join(ACE_DIR, 'logs');
    mkdirSync(logDir, { recursive: true });
    const log = openSync(path.join(logDir, 'server.log'), 'a');
    proc = spawn(path.join(ACE_DIR, '.venv/bin/acestep'), [
      '--port', port, '--server-name', '127.0.0.1', '--enable-api', '--backend', 'mlx',
      '--config_path', 'acestep-v15-turbo', '--lm_model_path', ACE_LM, '--init_service', 'true',
    ], {
      cwd: ACE_DIR,
      env: { ...process.env, ACESTEP_LM_BACKEND: 'mlx', TOKENIZERS_PARALLELISM: 'false' },
      stdio: ['ignore', log, log],
    });
    proc.on('exit', () => { proc = null; resetGradioClient(); });

    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!proc) throw new Error(`ACE-Step server exited during startup — see ${logDir}/server.log`);
      resetGradioClient();
      if (await isGradioAvailable()) return;
      await new Promise(r => setTimeout(r, 3000));
    }
    stopAceServer();
    throw new Error('ACE-Step server did not start within 5 minutes');
  })().finally(() => { starting = null; });

  return starting;
}

/** Stop the ACE server we started (frees its memory). No-op if it was started by hand. */
export function stopAceServer(): void {
  cancelIdleStop();
  if (!proc) return;
  console.log('[ACE] Stopping ACE-Step server to free memory');
  proc.kill('SIGTERM');
  proc = null;
  resetGradioClient();
}

export function scheduleAceIdleStop(): void {
  cancelIdleStop();
  if (proc && IDLE_MS > 0) idleTimer = setTimeout(stopAceServer, IDLE_MS);
}

function cancelIdleStop(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
}

for (const sig of ['SIGINT', 'SIGTERM', 'exit'] as const) {
  process.on(sig, () => { proc?.kill('SIGTERM'); if (sig !== 'exit') process.exit(0); });
}
