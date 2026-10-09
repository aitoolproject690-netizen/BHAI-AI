import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSceneSpeechRequest,
  buildGeminiTtsPayload,
  characterVoiceName,
  generateCharacterSpeech,
  pcmToWavBase64
} from "../src/characterTtsProvider.js";

const aarav = {
  sourceId: "character-aarav",
  character_id: "char_aarav_a1",
  identity_fingerprint: "identity-1",
  identity_json: { name: "Aarav", role: "protagonist", voiceHints: "young Indian boy, clear" }
};
const meera = {
  sourceId: "character-meera",
  character_id: "char_meera_m1",
  identity_fingerprint: "identity-2",
  identity_json: { name: "Meera", role: "supporting", voiceHints: "warm adult woman" }
};

test("scene voice request keeps dialogue, stable speakers, and deterministic voice IDs", () => {
  const scene = { dialogue: [
    { characterId: "character-aarav", text: "Kaun hai wahan?" },
    { characterId: "character-meera", text: "Aarav, peeche dekho!" }
  ] };
  const first = buildSceneSpeechRequest(scene, [aarav, meera]);
  const second = buildSceneSpeechRequest(scene, [aarav, meera]);
  assert.equal(first.script, "Aarav: Kaun hai wahan?\nMeera: Aarav, peeche dekho!");
  assert.equal(first.speakers.length, 2);
  assert.equal(first.textHash, second.textHash);
  assert.equal(first.speakers[0].voiceName, second.speakers[0].voiceName);
  assert.notEqual(first.speakers[0].voiceName, first.speakers[1].voiceName);
});

test("scene narration falls back to spoken narration/action when dialogue is absent", () => {
  const request = buildSceneSpeechRequest({ narration: "Raat gehri ho chuki thi." }, [aarav]);
  assert.ok(request);
  assert.equal(request.script, "Raat gehri ho chuki thi.");
  assert.equal(request.speakers.length, 1);
});

test("TTS payload uses AUDIO response and correct single/multi-speaker contracts", () => {
  const single = buildGeminiTtsPayload({
    script: "Namaste dosto",
    speakers: [{ speaker: "Aarav", voiceName: "Kore" }]
  });
  assert.deepEqual(single.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(single.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Kore");
  const multi = buildGeminiTtsPayload({
    script: "Aarav: Namaste\nMeera: Chalo",
    speakers: [{ speaker: "Aarav", voiceName: "Kore" }, { speaker: "Meera", voiceName: "Puck" }]
  });
  assert.equal(multi.generationConfig.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs.length, 2);
});

test("PCM conversion produces a valid mono 24 kHz WAV header", () => {
  const wav = Buffer.from(pcmToWavBase64(Buffer.from([0, 0, 1, 0]), 24000, 1), "base64");
  assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE");
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(40), 4);
});

test("provider accepts a mocked valid audio response without a real key or network", async () => {
  const request = { script: "Namaste", speakers: [{ speaker: "Aarav", voiceName: "Kore", characterId: "char-a", voiceFingerprint: "vf-a" }], textHash: "hash" };
  const out = await generateCharacterSpeech(request, {
    apiKey: "test-only",
    fetchImpl: async (url, options) => {
      assert.match(url, /gemini-3\.8-flash-tts:generateContent/);
      assert.equal(options.headers["x-goog-api-key"], "test-only");
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from([0, 0, 1, 0]).toString("base64"), mimeType: "audio/pcm;rate=24000" } }] } }] })
      };
    }
  });
  assert.equal(out.mimeType, "audio/wav");
  assert.equal(out.provider, "gemini-3.8-flash-tts");
  assert.equal(out.verification.ok, true);
  assert.equal(Buffer.from(out.data, "base64").subarray(0, 4).toString("ascii"), "RIFF");
});

test("provider fails closed without configuration and does not emit fake audio", async () => {
  await assert.rejects(
    generateCharacterSpeech({ script: "hello", speakers: [{ speaker: "Narrator", voiceName: "Kore" }] }, { apiKey: "" }),
    /GEMINI_API_KEY is not configured/
  );
  await assert.rejects(
    generateCharacterSpeech({ script: "hello", speakers: [{ speaker: "Narrator", voiceName: "Kore" }] }, {
      apiKey: "test-only",
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "not audio" }] } }] }) })
    }),
    /contained no audio payload/
  );
});
