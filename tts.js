#!/usr/bin/env bun
import { KokoroTTS } from "kokoro-js";
import { execSync } from "child_process";
import { unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const VOICE = process.env.KOKORO_VOICE ?? "bm_george";
const SPEED = parseFloat(process.env.KOKORO_SPEED ?? "1.3");

function normalizeForSpeech(text) {
  return text
    // Common abbreviations — replace dot with space
    .replace(/\be\.g\.*/gi, "e g ")
    .replace(/\bi\.e\.*/gi, "i e ")
    .replace(/\betc\./gi, "etc ")
    .replace(/\bvs\./gi, "vs ")
    .replace(/\bMr\./g, "Mr ")
    .replace(/\bMrs\./g, "Mrs ")
    .replace(/\bDr\./g, "Dr ")
    .replace(/\bSt\./g, "St ")
    // Decimal numbers — 3.14 -> "3 point 14"
    .replace(/(\d+)\.(\d+)/g, "$1 point $2")
    // File-like patterns — foo.bar -> "foo dot bar" (alpha only on both sides)
    .replace(/([a-zA-Z]+)\.([a-zA-Z]+)/g, "$1 dot $2");
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

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-ONNX", {
  dtype: "q8",
});

const audio = await tts.generate(normalizeForSpeech(text), {
  voice: VOICE,
  speed: SPEED,
});

const outPath = join(tmpdir(), `kokoro-${Date.now()}.wav`);
await audio.save(outPath);
execSync(`afplay "${outPath}"`);
unlinkSync(outPath);
