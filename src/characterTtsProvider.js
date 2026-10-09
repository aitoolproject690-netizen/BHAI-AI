import crypto from "node:crypto";

export const CHARACTER_TTS_SCHEMA_VERSION = "1.0";
export const DEFAULT_CHARACTER_TTS_MODEL = "gemini-2.5-flash-preview-tts";
const VOICES = ["Kore", "Puck", "Charon", "Fenrir", "Zephyr", "Aoede", "Leda", "Orus"];
const clean = (value, max = 5000) => String(value ?? "").trim().slice(0, max);
const hash = value => crypto.createHash("sha256").update(String(value ?? "")).digest("hex");

function identityOf(character = {}) {
  return character?.identity_json || character?.identity || character || {};
}

export function characterVoiceName(character = {}, used = []) {
  const identity = identityOf(character);
  const stableId = clean(character?.character_id || character?.characterId || identity?.id || identity?.name, 180);
  const digest = hash(stableId || "bhai-x-narrator");
  const start = parseInt(digest.slice(0, 8), 16) % VOICES.length;
  for (let offset = 0; offset < VOICES.length; offset++) {
    const voice = VOICES[(start + offset) % VOICES.length];
    if (!used.includes(voice)) return voice;
  }
  return VOICES[start];
}

export function buildSceneSpeechRequest(scene = {}, characters = []) {
  const bySourceId = new Map((Array.isArray(characters) ? characters : []).map(c => [
    String(c?.sourceId || c?.id || c?.character_id || c?.characterId || ""),
    c
  ]));
  const normalizedCharacters = Array.isArray(characters) ? characters : [];
  const dialogue = Array.isArray(scene?.dialogue)
    ? scene.dialogue.map(line => ({
        characterId: String(line?.characterId || ""),
        text: clean(line?.text, 1200)
      })).filter(line => line.text)
    : [];
  let lines = dialogue;
  if (!lines.length) {
    const narration = clean(scene?.narration, 1800) || clean(scene?.action, 1800);
    if (narration) {
      const narrator = normalizedCharacters.find(c => /narrator/i.test(String(identityOf(c)?.role || ""))) || normalizedCharacters[0] || null;
      lines = [{ characterId: String(narrator?.sourceId || narrator?.id || narrator?.character_id || ""), text: narration }];
    }
  }
  if (!lines.length) return null;

  const speakerMap = new Map();
  const usedVoices = [];
  const turns = [];
  for (const line of lines) {
    const source = bySourceId.get(line.characterId) || normalizedCharacters.find(c => String(c?.character_id || "") === line.characterId) || null;
    const identity = identityOf(source || {});
    const speakerName = clean(identity.name || source?.name || "Narrator", 80);
    const key = line.characterId || speakerName;
    if (!speakerMap.has(key)) {
      const character = source || { character_id: key || "bhai-x-narrator", identity_json: { name: speakerName } };
      const voiceName = characterVoiceName(character, usedVoices);
      usedVoices.push(voiceName);
      speakerMap.set(key, {
        key,
        speaker: speakerName.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 80) || "Narrator",
        voiceName,
        voiceFingerprint: clean(source?.identity_fingerprint || source?.identityFingerprint || hash(key).slice(0, 24), 80),
        characterId: clean(source?.character_id || source?.characterId || key, 180)
      });
    }
    turns.push({ speaker: speakerMap.get(key).speaker, text: line.text });
  }
  if (speakerMap.size > 2) {
    throw new Error("Scene voice generation supports at most two distinct speakers per scene; split the dialogue into scenes.");
  }
  const speakers = [...speakerMap.values()];
  const script = turns.map(turn => speakers.length > 1 ? turn.speaker + ": " + turn.text : turn.text).join("\n");
  return {
    schemaVersion: CHARACTER_TTS_SCHEMA_VERSION,
    script: clean(script, 5000),
    speakers,
    turns,
    language: /[\u0900-\u097f]/u.test(script) ? "Hindi" : "Hindi",
    textHash: hash(JSON.stringify({ script, speakers: speakers.map(s => ({ characterId: s.characterId, voiceName: s.voiceName, voiceFingerprint: s.voiceFingerprint })) }))
  };
}

export function buildGeminiTtsPayload(request = {}, model = DEFAULT_CHARACTER_TTS_MODEL) {
  const speakers = Array.isArray(request.speakers) ? request.speakers.slice(0, 2) : [];
  if (!request.script || !speakers.length) throw new Error("A non-empty voice script and speaker profile are required.");
  const contents = [{
    role: "user",
    parts: [{ text: "Speak natural, expressive Hindi dialogue. Keep each character clear and emotionally aligned with the scene. Do not add words.\n\n" + request.script }]
  }];
  const generationConfig = { responseModalities: ["AUDIO"] };
  if (speakers.length === 1) {
    generationConfig.speechConfig = {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: speakers[0].voiceName } }
    };
  } else {
    generationConfig.speechConfig = {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: speakers.map(speaker => ({
          speaker: speaker.speaker,
          voiceConfig: { prebuiltVoiceConfig: { voiceName: speaker.voiceName } }
        }))
      }
    };
  }
  return { model, contents, generationConfig };
}

export function pcmToWavBase64(value, sampleRate = 24000, channels = 1) {
  const pcm = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ""), "base64");
  if (pcm.length < 2 || pcm.length % 2 !== 0) throw new Error("TTS provider returned invalid PCM audio.");
  const rate = Number(sampleRate);
  const ch = Number(channels);
  if (!Number.isInteger(rate) || rate < 8000 || rate > 96000 || !Number.isInteger(ch) || ch < 1 || ch > 2) {
    throw new Error("TTS PCM audio format is unsupported.");
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(ch, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * ch * 2, 28);
  header.writeUInt16LE(ch * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]).toString("base64");
}

export async function generateCharacterSpeech(request = {}, options = {}) {
  const apiKey = clean(options.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "", 1000);
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured; real server-side voice generation is unavailable.");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable for voice generation.");
  const model = clean(options.model || process.env.GEMINI_TTS_MODEL || DEFAULT_CHARACTER_TTS_MODEL, 120);
  const payload = buildGeminiTtsPayload(request, model);
  const response = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(payload),
    signal: options.signal || AbortSignal.timeout(90000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = clean(data?.error?.message || data?.message || "TTS provider request failed.", 500);
    throw new Error("Character TTS returned HTTP " + response.status + ": " + message);
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const audio = parts.find(part => part?.inlineData?.data || part?.inline_data?.data);
  const pcm = audio?.inlineData?.data || audio?.inline_data?.data;
  if (!pcm) throw new Error("Character TTS response contained no audio payload.");
  const mimeType = String(audio?.inlineData?.mimeType || audio?.inline_data?.mime_type || "audio/pcm;rate=24000");
  const rateMatch = mimeType.match(/rate\s*=\s*(\d+)/i);
  const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
  const wavData = pcmToWavBase64(pcm, sampleRate, 1);
  const bytes = Buffer.from(wavData, "base64");
  if (bytes.length <= 44) throw new Error("Character TTS generated an empty WAV.");
  return {
    mimeType: "audio/wav",
    data: wavData,
    provider: model,
    duration: Number(((bytes.length - 44) / (sampleRate * 2)).toFixed(3)),
    verification: { ok: true, mode: "tts-pcm-wav", bytes: bytes.length, sampleRate, channels: 1, bitsPerSample: 16 },
    script: request.script,
    textHash: request.textHash || hash(request.script),
    speakers: request.speakers.map(s => ({ characterId: s.characterId, voiceName: s.voiceName, voiceFingerprint: s.voiceFingerprint }))
  };
}
