#!/usr/bin/env bun
import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import { execSync } from "child_process";
import { unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const VOICE = process.env.KOKORO_VOICE ?? "af_heart";
const SPEED = parseFloat(process.env.KOKORO_SPEED ?? "1.3");
const SUMMARIZE = process.env.KOKORO_SUMMARIZE !== "0";
const SUMMARY_MODEL = process.env.KOKORO_SUMMARY_MODEL ?? "haiku";
// Kokoro's single-pass limit is ~510 phoneme tokens and it truncates silently, so anything
// that must play as one clip has to stay well under it. Longer text gets summarized to
// SUMMARY_MAX_CHARS; the post-normalization MAX_CLIP_CHARS check leaves room for expansions
// like "3.14" -> "3 point 14".
const SUMMARY_MAX_CHARS = 300;
const MAX_CLIP_CHARS = 400;

// Set on the child `claude` so its own Stop hook doesn't re-enter this script forever.
if (process.env.TTS_SUMMARIZING) process.exit(0);

const SUMMARY_PROMPT =
  "You turn an AI coding assistant's reply into a short spoken summary for a text-to-speech voice. " +
  "Output one or two short plain sentences, under 40 words total, covering the outcome and anything the listener must act on or decide. " +
  "No markdown, no code, no file paths, no lists. Reply with the summary only.";

/**
 * Trims text to at most `max` chars, preferring a sentence boundary then a word boundary,
 * because the model can overshoot a length instruction and overlong input is truncated mid-word.
 * @param {string} text - Text to trim.
 * @param {number} max - Maximum length in characters.
 * @returns {string} `text` if short enough, else a trimmed prefix.
 */
function capLength(text, max) {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (sentenceEnd > 0) return head.slice(0, sentenceEnd + 1);
  return head.slice(0, head.lastIndexOf(" ")).trim() + ".";
}

/**
 * Condenses a long reply into a short spoken summary via a headless `claude -p` call
 * (reuses the user's existing Claude Code auth, so no API key or SDK dependency).
 * Falls back to the original text on any failure so the user still hears something.
 * @param {string} text - Full assistant reply.
 * @returns {Promise<string>} Summary capped at SUMMARY_MAX_CHARS, or `text` unchanged when skipped/failed.
 */
async function summarize(text) {
  if (!SUMMARIZE || text.length <= SUMMARY_MAX_CHARS) return text;
  try {
    const proc = Bun.spawn(
      ["claude", "-p", "--model", SUMMARY_MODEL, "--no-session-persistence",
       // The reply may carry injected instructions, so the summarizer gets no tools, no user/project
       // settings (permission allowlists) and an empty cwd; hooks stay off to skip slow startup hooks.
       "--tools", "", "--setting-sources", "", "--disable-slash-commands",
       "--settings", '{"disableAllHooks":true}', "--system-prompt", SUMMARY_PROMPT],
      { cwd: tmpdir(), stdin: new Blob([text]), stdout: "pipe", stderr: "pipe", env: { ...process.env, TTS_SUMMARIZING: "1" } },
    );
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
    ]);
    if (code !== 0 || !out.trim()) throw new Error(`exit ${code}: ${err.trim()}`);
    return capLength(out.trim(), SUMMARY_MAX_CHARS);
  } catch (e) {
    console.error(`summarize failed, reading full text: ${e.message}`);
    return text;
  }
}

function cleanText(text) {
  return text
    // Strip code blocks
    .replace(/```[\s\S]*?```/g, ", code block, ")
    // Strip inline code backticks
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function normalizeForSpeech(text) {
  return text
    // Common abbreviations — replace dot with space
    .replace(/\be\.g\.*/gi, "e g ")
    .replace(/\bi\.e\.*/gi, "i e ")
    .replace(/\betc\./gi, "etc ")
    .replace(/\bvs\./gi, "versus ")
    .replace(/\bMr\./g, "Mr ")
    .replace(/\bMrs\./g, "Mrs ")
    .replace(/\bDr\./g, "Dr ")
    .replace(/\bSt\./g, "St ")
    // Decimal numbers — 3.14 -> "3 point 14"
    .replace(/(\d+)\.(\d+)/g, "$1 point $2")
    // File-like patterns — foo.bar -> "foo dot bar" (alpha only on both sides)
    .replace(/([a-zA-Z]+)\.([a-zA-Z]+)/g, "$1 dot $2")
    // Things that are weird or skipped or different when spoken vs written
    .replace(/\*+/g, " star ")
    .replace(/_+/g, " underscore ")
    .replace(/→/g, ", ") // Weird little right arrow that is skipped when spoken
    .replace(/postgres/gi, "Postgress") // Kept pronouncing as "post-gurs" instead of "post-gres"
    .replace(/\b-+/g, " ");
}

// Read from args or stdin
let text;
if (process.argv.length > 2) {
  text = process.argv.slice(2).join(" ").trim();
} else {
  text = await Bun.stdin.text();
  text = text.trim();
}

if (!text) process.exit(0);

text = normalizeForSpeech(cleanText(await summarize(text)));

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-ONNX", {
  dtype: "q8",
});

/**
 * Plays synthesized audio through macOS `afplay` via a temp WAV, then deletes it.
 * @param {{save: (path: string) => Promise<void>}} audio - Kokoro RawAudio.
 * @returns {Promise<void>}
 */
async function play(audio) {
  const outPath = join(tmpdir(), `kokoro-${Date.now()}.wav`);
  await audio.save(outPath);
  execSync(`afplay "${outPath}"`);
  unlinkSync(outPath);
}

if (text.length <= MAX_CLIP_CHARS) {
  // One synthesis pass = one gapless clip (no per-sentence pauses).
  await play(await tts.generate(text, { voice: VOICE, speed: SPEED }));
} else {
  // Unsummarized long text (summary off or failed): stream paragraph by paragraph.
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  for (const paragraph of paragraphs) {
    const splitter = new TextSplitterStream();
    const stream = tts.stream(splitter, { voice: VOICE, speed: SPEED });
    splitter.push(paragraph);
    splitter.close();
    for await (const { audio } of stream) await play(audio);
  }
}
