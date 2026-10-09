import test from "node:test";
import assert from "node:assert/strict";
import { generateSelfHostedLipSync, generateSelfHostedSpeech } from "../src/selfHostedMediaProvider.js";

function fakeMp4() {
  const b = Buffer.alloc(64);
  b.write("ftyp", 4, "ascii"); b.write("isom", 8, "ascii");
  return b;
}
function fakeWav() {
  const b = Buffer.alloc(48);
  b.write("RIFF", 0, "ascii"); b.writeUInt32LE(40, 4); b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii"); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(24000, 24); b.writeUInt32LE(48000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36, "ascii");
  b.writeUInt32LE(4, 40); return b;
}

test("self-hosted TTS sends request to configured endpoint and validates WAV", async () => {
  const wav = fakeWav();
  let call;
  const result = await generateSelfHostedSpeech({script:"नमस्ते",speakers:[{characterId:"a",voiceName:"Kore"}],textHash:"hash"}, {
    endpoint:"https://tts.example/v1/synthesize", apiKey:"local-secret",
    fetchImpl:async (url, options) => {
      call = {url:String(url), options};
      return {ok:true,status:200,json:async()=>({mimeType:"audio/wav",data:wav.toString("base64"),duration:0.001,provider:"local-kokoro"})};
    }
  });
  assert.equal(call.url,"https://tts.example/v1/synthesize");
  assert.equal(call.options.headers.authorization,"Bearer local-secret");
  assert.equal(JSON.parse(call.options.body).format,"wav");
  assert.equal(result.provider,"local-kokoro");
  assert.equal(result.verification.ok,true);
  assert.equal(Buffer.from(result.data,"base64").subarray(8,12).toString("ascii"),"WAVE");
});

test("self-hosted lip-sync sends media to configured endpoint and verifies MP4", async () => {
  const mp4 = fakeMp4(); let call;
  const result = await generateSelfHostedLipSync({
    sceneId:"scene-1", videoData:mp4.toString("base64"), audioData:fakeWav().toString("base64"),
    durationSeconds:2
  }, {
    endpoint:"https://media.example/v1/lipsync", apiKey:"local-secret",
    fetchImpl:async (url, options) => {
      call = {url:String(url), options};
      return {ok:true,status:200,json:async()=>({mimeType:"video/mp4",data:mp4.toString("base64"),duration:2,provider:"musetalk-local"})};
    }
  });
  assert.equal(call.url,"https://media.example/v1/lipsync");
  assert.equal(call.options.headers.authorization,"Bearer local-secret");
  assert.equal(JSON.parse(call.options.body).sceneId,"scene-1");
  assert.equal(result.provider,"musetalk-local");
  assert.equal(result.verification.pixelLipSyncVerified,false);
});

test("self-hosted endpoints reject public plain HTTP and malformed media", async () => {
  await assert.rejects(generateSelfHostedSpeech({script:"hello",speakers:[]},{endpoint:"http://tts.example/run",fetchImpl:async()=>{throw new Error("must not call");}}),/must use HTTPS/);
  await assert.rejects(generateSelfHostedLipSync({videoData:"bm90bXA0",audioData:fakeWav().toString("base64")},{endpoint:"https://media.example/run",fetchImpl:async()=>{throw new Error("must not call");}}),/verified MP4 container/);
});
