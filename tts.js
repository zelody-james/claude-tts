#!/usr/bin/env bun
import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import { execSync } from "child_process";
import { unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const VOICE = process.env.KOKORO_VOICE ?? "af_heart";
const SPEED = parseFloat(process.env.KOKORO_SPEED ?? "1.3");

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

text = normalizeForSpeech(cleanText(text));

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-ONNX", {
  dtype: "q8",
});

const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

for (const paragraph of paragraphs) {
  const splitter = new TextSplitterStream();
  const stream = tts.stream(splitter, { voice: VOICE, speed: SPEED });
  splitter.push(paragraph);
  splitter.close();
  for await (const { audio } of stream) {
    const outPath = join(tmpdir(), `kokoro-${Date.now()}.wav`);
    await audio.save(outPath);
    execSync(`afplay "${outPath}"`);
    unlinkSync(outPath);
  }
}