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

Add this to `~/.claude/settings.json` to read Claude's last response aloud after every turn:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.last_assistant_message // empty' | bun run /Users/you/projs/claude-tts/tts.js"
          }
        ]
      }
    ]
  }
}
```

The hook is `async` so playback never blocks the next prompt, and it is skipped while `~/.claude/tts-off` exists. Flip it with `./toggle.sh` (creates or removes that file).

To override voice or speed inline:

```json
"command": "jq -r '.last_assistant_message // empty' | KOKORO_VOICE=bm_george KOKORO_SPEED=1.0 bun run /path/to/claude-tts/tts.js"
```

## Summarization

Replies over 300 characters are first condensed to one or two short sentences (under 40 words, hard-capped at 300 characters) by a headless `claude -p` call (Haiku by default). This reuses your Claude Code login, so no API key is needed. It adds a few seconds of latency before speech starts. If the call fails, the full text is read instead and the error goes to stderr. Set `KOKORO_SUMMARIZE=0` to read everything verbatim.

Because the summary is short, it is synthesized in a single pass and plays as one gapless clip. Kokoro silently truncates past ~510 phoneme tokens, hence the hard cap. Text that is still over 400 characters after cleaning (summary off or failed) falls back to paragraph-by-paragraph streaming.

The child `claude` runs with hooks disabled and `TTS_SUMMARIZING=1` set, so its own Stop hook cannot re-trigger this script.

## How it works

**Chunking and streaming playback** (only when text is not summarized): Long messages are split on double newlines (paragraphs) and each paragraph is synthesized and played in sequence using `TextSplitterStream`. Audio starts playing as the first paragraph is synthesized rather than waiting for the whole message — this keeps latency low for long responses.

**Text cleaning before synthesis**:
- Code blocks (` ``` ... ``` `) are replaced with ", code block," so they're acknowledged but not read verbatim
- Inline backtick spans have their backticks stripped, leaving just the content
- Common abbreviations (e.g., i.e., etc., vs., Mr., Dr.) have their dots removed to prevent the model from reading them as sentence breaks
- Decimal numbers (`3.14`) become "3 point 14"
- File-path-style patterns (`foo.bar`) become "foo dot bar"
- Markdown emphasis characters (`*`, `_`) are replaced with spoken equivalents
- The `→` arrow character is replaced with a pause comma (the model skips it silently otherwise)
- Known mispronunciations are corrected (e.g., "postgres" → "Postgress" to get "post-gres" instead of "post-gurs")

**Model**: `onnx-community/Kokoro-82M-ONNX` with `q8` quantization — good quality at ~92MB, fast enough to stay ahead of playback on Apple Silicon.

**Playback**: Uses `afplay` (macOS only). Each paragraph is written to a temp WAV file, played, then deleted immediately.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `KOKORO_VOICE` | `af_heart` | Voice to use (see below) |
| `KOKORO_SPEED` | `1.3` | Speed multiplier — 0.5 (slow) to 2.0 (fast) |
| `KOKORO_SUMMARIZE` | on | Set to `0` to skip summarization |
| `KOKORO_SUMMARY_MODEL` | `haiku` | Model passed to `claude -p --model` |

## Voices

Default is `af_heart`. British voices tend to be clearer if you prefer those:

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
