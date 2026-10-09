import crypto from "node:crypto";

const MAX_MEDIA_BYTES = 24 * 1024 * 1024;
const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);

function endpointOf(value, label) {
  const raw = clean(value, 2000);
  if (!raw) throw new Error(label + " endpoint is not configured.");
  let url;
  try { url = new URL(raw); } catch { throw new Error(label + " endpoint must be a valid URL."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error(label + " endpoint must be an HTTP(S) URL without embedded credentials.");
  }
  const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHost) {
    throw new Error(label + " endpoint must use HTTPS unless it is localhost.");
  }
  return url.toString();
}

function decodeBase64(value, label) {
  const raw = clean(value, MAX_MEDIA_BYTES * 2);
  if (!raw || raw.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) {
    throw new Error(label + " must contain valid base64 media.");
  }
  const bytes = Buffer.from(raw, "base64");
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) {
    throw new Error(label + " is empty or exceeds the 24 MB media limit.");
  }
  return bytes;
}

function validateWav(bytes) {
  if (bytes.length < 46 || bytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
      bytes.subarray(8, 12).toString("ascii") !== "WAVE" ||
      bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(34) !== 16) {
    throw new Error("Self-hosted TTS output must be valid 16-bit PCM WAV audio.");
  }
  const sampleRate = bytes.readUInt32LE(24);
  const channels = bytes.readUInt16LE(22);
  if (sampleRate < 8000 || sampleRate > 96000 || channels < 1 || channels > 2) {
    throw new Error("Self-hosted TTS WAV sample rate or channel count is unsupported.");
  }
  const dataBytes = Math.min(bytes.readUInt32LE(40), Math.max(0, bytes.length - 44));
  if (dataBytes < 2) throw new Error("Self-hosted TTS returned an empty WAV audio stream.");
  return { sampleRate, channels, bitsPerSample: 16, bytes: bytes.length,
    duration: Number((dataBytes / (sampleRate * channels * 2)).toFixed(3)) };
}

function validateMp4(bytes) {
  if (bytes.length < 32 || bytes.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new Error("Self-hosted lip-sync output is not a verified MP4 container.");
  }
}

async function postJson(url, payload, options, label, defaultTimeoutMs) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable for " + label + ".");
  const headers = { "content-type": "application/json", accept: "application/json" };
  const apiKey = clean(options.apiKey ?? options.apiKeyFromEnv ?? "", 2000);
  if (apiKey) headers.authorization = "Bearer " + apiKey;
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: options.signal || AbortSignal.timeout(Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : defaultTimeoutMs)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = clean(body?.error || body?.message || "Request failed.", 300);
    throw new Error(label + " returned HTTP " + response.status + ": " + detail);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(label + " returned an invalid JSON response.");
  }
  return body;
}

/**
 * Self-hosted media-worker JSON contract:
 * POST BHAI_TTS_URL with {schemaVersion,script,speakers,language,voice,format,textHash};
 * return {data: base64-encoded 16-bit PCM WAV, mimeType:"audio/wav", duration?}.
 */
export async function generateSelfHostedSpeech(request = {}, options = {}) {
  const endpoint = endpointOf(options.endpoint ?? process.env.BHAI_TTS_URL ?? "", "Self-hosted TTS");
  const body = await postJson(endpoint, {
    schemaVersion: "1.0",
    script: clean(request.script, 5000),
    speakers: Array.isArray(request.speakers) ? request.speakers.slice(0, 2) : [],
    language: clean(request.language || "Hindi", 40),
    voice: clean(request.speakers?.[0]?.voiceName || "default", 100),
    format: "wav",
    textHash: clean(request.textHash || crypto.createHash("sha256").update(String(request.script || "")).digest("hex"), 128)
  }, { ...options, apiKey: options.apiKey ?? process.env.BHAI_TTS_API_KEY }, "Self-hosted TTS", 90000);
  const mimeType = clean(body.mimeType || body.mime_type || "audio/wav", 100).split(";")[0].toLowerCase();
  if (mimeType !== "audio/wav") throw new Error("Self-hosted TTS must return audio/wav.");
  const bytes = decodeBase64(body.data || body.audioBase64 || body.audio_base64, "Self-hosted TTS output");
  const wav = validateWav(bytes);
  const duration = Number(body.duration) > 0 ? Number(body.duration) : wav.duration;
  return {
    mimeType: "audio/wav",
    data: bytes.toString("base64"),
    provider: clean(body.provider || "self-hosted-tts", 120),
    duration,
    verification: { ok: true, mode: "self-hosted-tts-wav", ...wav },
    script: request.script,
    textHash: request.textHash || crypto.createHash("sha256").update(String(request.script || "")).digest("hex"),
    speakers: (Array.isArray(request.speakers) ? request.speakers : []).map(s => ({
      characterId: s.characterId, voiceName: s.voiceName, voiceFingerprint: s.voiceFingerprint
    }))
  };
}

/**
 * POST BHAI_LIPSYNC_URL with base64 source MP4/WAV; return {data: base64 MP4,
 * mimeType:"video/mp4", duration?}. This adapter sends no request to Sync Labs.
 */
export async function generateSelfHostedLipSync(input = {}, options = {}) {
  const endpoint = endpointOf(options.endpoint ?? process.env.BHAI_LIPSYNC_URL ?? "", "Self-hosted lip-sync");
  const video = decodeBase64(input.videoData, "Lip-sync source video");
  const audio = decodeBase64(input.audioData, "Lip-sync audio");
  validateMp4(video);
  validateWav(audio);
  const body = await postJson(endpoint, {
    schemaVersion: "1.0",
    sceneId: clean(input.sceneId, 180),
    videoData: video.toString("base64"),
    videoMimeType: clean(input.videoMimeType || "video/mp4", 100),
    audioData: audio.toString("base64"),
    audioMimeType: "audio/wav",
    durationSeconds: Number(input.durationSeconds) > 0 ? Number(input.durationSeconds) : null
  }, { ...options, apiKey: options.apiKey ?? process.env.BHAI_LIPSYNC_API_KEY }, "Self-hosted lip-sync", 360000);
  const mimeType = clean(body.mimeType || body.mime_type || "video/mp4", 100).split(";")[0].toLowerCase();
  if (mimeType !== "video/mp4") throw new Error("Self-hosted lip-sync must return video/mp4.");
  const bytes = decodeBase64(body.data || body.videoBase64 || body.video_base64, "Self-hosted lip-sync output");
  validateMp4(bytes);
  const duration = Number(body.duration) > 0 ? Number(body.duration)
    : Number(input.durationSeconds) > 0 ? Number(input.durationSeconds) : null;
  if (Number(input.durationSeconds) > 0 && duration &&
      Math.abs(duration - Number(input.durationSeconds)) > Math.max(1.5, Number(input.durationSeconds) * 0.2)) {
    throw new Error("Self-hosted lip-sync output duration differs materially from the requested scene duration.");
  }
  return {
    mimeType: "video/mp4",
    data: bytes.toString("base64"),
    duration,
    provider: clean(body.provider || "self-hosted-lipsync", 120),
    verification: {
      ok: true, mode: "self-hosted-lipsync-mp4", provider: "self-hosted",
      status: "COMPLETED", bytes: bytes.length, containerValid: true, pixelLipSyncVerified: false
    }
  };
}
