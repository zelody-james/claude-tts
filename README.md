# claude-tts

Local TTS for Claude Code hooks using [Kokoro](https://github.com/hexgrad/kokoro). Runs fully locally — no API costs, no internet required after install.

## Setup

```bash
bun install
```

The model (~92MB) is downloaded automatically from HuggingFace on first run and cached by the `kokoro-js` library. No manual download needed.

## Usage

```bash
bun run tts.js "your text here"
```

Or via stdin:

```bash
echo "your text here" | bun run tts.js
```

## Claude Code hook

Pass env vars inline in the hook command:

```bash
jq -r '.last_assistant_message // empty' | KOKORO_VOICE=bm_george KOKORO_SPEED=1.3 bun run /path/to/claude-tts/tts.js
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `KOKORO_VOICE` | `bm_george` | Voice to use (see below) |
| `KOKORO_SPEED` | `1.3` | Speed multiplier — 0.5 (slow) to 2.0 (fast) |

## Voices

British voices tend to be clearer. Recommended:

| Voice | Gender | Grade |
|-------|--------|-------|
| `bm_george` | Male | C |
| `bm_fable` | Male | C |
| `bf_emma` | Female | B- |
| `bf_isabella` | Female | C |

American voices if you want options:

| Voice | Gender | Grade |
|-------|--------|-------|
| `af_heart` ❤️ | Female | A |
| `af_bella` 🔥 | Female | A- |
| `af_nicole` 🎧 | Female | B- |
| `am_fenrir` | Male | C+ |
| `am_michael` | Male | C+ |
| `am_puck` | Male | C+ |
