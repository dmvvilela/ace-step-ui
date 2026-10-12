import { spawn } from 'child_process';

// Turns a story/idea into YuE2-ready lyrics using the local `claude` CLI (Claude Code, the user's own login).
// Override the binary with CLAUDE_CMD and the model with LYRICS_MODEL.

export interface WrittenLyrics {
  title: string;
  style: string;
  lyrics: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', pt: 'Brazilian Portuguese', es: 'Spanish', fr: 'French', it: 'Italian',
  de: 'German', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ru: 'Russian',
};

const SYSTEM_PROMPT = `You are a witty songwriter who writes funny, affectionate roast songs about friends' real stories.
Write singable lyrics with a strong, repeatable chorus, natural rhymes, and specific details from the story.
Keep it playful — teasing, never cruel. Lines should be short enough to sing (roughly 6–12 syllables).

Format rules (the music model depends on them):
- Use only these section tags, each on its own line: [Verse], [Chorus], [Bridge], [Outro]
- Typical shape: [Verse] [Chorus] [Verse] [Chorus] [Bridge] [Chorus] — about 2–3 minutes of song
- Separate sections with a blank line. No other annotations, no stage directions, no emojis.

Respond with ONLY a JSON object, no markdown fences:
{"title": "...", "style": "comma-separated music tags: language, genre, instruments, mood, vocal type", "lyrics": "..."}`;

export async function writeLyrics(opts: {
  idea: string;
  language?: string;
  style?: string;
  existingLyrics?: string;
}): Promise<WrittenLyrics> {
  const language = opts.language && opts.language !== 'unknown'
    ? (LANGUAGE_NAMES[opts.language] || opts.language)
    : null;

  const parts = [`Story / idea:\n${opts.idea.trim()}`];
  if (language) parts.push(`Write the lyrics in ${language}.`);
  else parts.push('Write the lyrics in the same language as the story.');
  if (opts.style?.trim()) parts.push(`Musical style to aim for: ${opts.style.trim()}`);
  if (opts.existingLyrics?.trim()) {
    parts.push(`Rework and improve these draft lyrics, keeping their jokes and details:\n${opts.existingLyrics.trim()}`);
  }

  const raw = await runClaude(parts.join('\n\n'));
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  const parsed = JSON.parse(json) as Partial<WrittenLyrics>;
  if (!parsed.lyrics) throw new Error('Lyrics writer returned no lyrics');
  return {
    title: (parsed.title || 'Untitled').trim(),
    style: (parsed.style || opts.style || 'pop').trim(),
    lyrics: parsed.lyrics.trim(),
  };
}

function runClaude(prompt: string, timeoutMs = 180000): Promise<string> {
  return new Promise((resolve, reject) => {
    const cmd = process.env.CLAUDE_CMD || 'claude';
    const args = [
      '-p',
      '--model', process.env.LYRICS_MODEL || 'sonnet',
      '--system-prompt', SYSTEM_PROMPT,
      '--tools', '',
      '--strict-mcp-config',
      '--no-session-persistence',
      '--output-format', 'json',
    ];
    const proc = spawn(cmd, args, { cwd: process.env.HOME });
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Lyrics writer timed out'));
    }, timeoutMs);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Could not run '${cmd}': ${err.message}`));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Lyrics writer failed: ${(stderr || stdout).slice(-500)}`));
        return;
      }
      try {
        const envelope = JSON.parse(stdout);
        if (envelope.is_error) throw new Error(envelope.result || 'Claude returned an error');
        resolve(String(envelope.result ?? ''));
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Unexpected output from claude'));
      }
    });

    proc.stdin.end(prompt);
  });
}
