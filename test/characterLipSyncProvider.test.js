import test from "node:test";
import assert from "node:assert/strict";
import {generateCharacterLipSync} from "../src/characterLipSyncProvider.js";

function fakeMp4(){
  const b=Buffer.alloc(64);
  b.write("ftyp",4,"ascii");
  b.write("isom",8,"ascii");
  return b;
}
function fakeWav(){
  const b=Buffer.alloc(48);
  b.write("RIFF",0,"ascii");
  b.writeUInt32LE(40,4);
  b.write("WAVE",8,"ascii");
  b.write("fmt ",12,"ascii");
  b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20);
  b.writeUInt16LE(1,22);
  b.writeUInt32LE(24000,24);
  b.writeUInt32LE(48000,28);
  b.writeUInt16LE(2,32);
  b.writeUInt16LE(16,34);
  b.write("data",36,"ascii");
  b.writeUInt32LE(4,40);
  return b;
}

test("lip-sync fails closed when provider key is unavailable",async()=>{
  await assert.rejects(generateCharacterLipSync({videoData:fakeMp4().toString("base64"),audioData:fakeWav().toString("base64")},{apiKey:""}),/SYNC_API_KEY is not configured/);
});

test("lip-sync sends real media to provider and verifies completed MP4 output",async()=>{
  const calls=[];
  const output=fakeMp4();
  const result=await generateCharacterLipSync({
    sceneId:"scene-test",
    videoData:fakeMp4().toString("base64"),
    audioData:fakeWav().toString("base64"),
    durationSeconds:2
  },{
    apiKey:"test-only",
    maxPolls:2,
    pollIntervalMs:0,
    sleepImpl:async()=>{},
    fetchImpl:async(url,opts={})=>{
      calls.push({url:String(url),method:opts.method||"GET",headers:opts.headers||{}});
      if(String(url)==="https://api.sync.so/v2/generate"){
        assert.equal(opts.method,"POST");
        assert.equal(opts.headers["x-api-key"],"test-only");
        assert.ok(opts.body instanceof FormData);
        assert.equal(opts.body.get("model"),"lipsync-2");
        assert.ok(opts.body.get("video") instanceof Blob);
        assert.ok(opts.body.get("audio") instanceof Blob);
        return {ok:true,status:201,json:async()=>({id:"generation-123",status:"PENDING"})};
      }
      if(String(url)==="https://api.sync.so/v2/generate/generation-123"){
        return {ok:true,status:200,json:async()=>({id:"generation-123",status:"COMPLETED",outputUrl:"https://cdn.sync.so/output.mp4",outputDuration:2})};
      }
      if(String(url)==="https://cdn.sync.so/output.mp4"){
        return {ok:true,status:200,arrayBuffer:async()=>output.buffer.slice(output.byteOffset,output.byteOffset+output.byteLength)};
      }
      throw new Error("Unexpected URL "+String(url));
    }
  });
  assert.equal(calls.length,3);
  assert.equal(result.mimeType,"video/mp4");
  assert.equal(Buffer.from(result.data,"base64").subarray(4,8).toString("ascii"),"ftyp");
  assert.equal(result.verification.status,"COMPLETED");
  assert.equal(result.verification.pixelLipSyncVerified,false);
});

test("lip-sync rejects provider output that is not MP4",async()=>{
  await assert.rejects(generateCharacterLipSync({
    videoData:fakeMp4().toString("base64"),
    audioData:fakeWav().toString("base64")
  },{
    apiKey:"test-only",
    maxPolls:1,
    fetchImpl:async(url)=>({
      ok:true,status:200,
      json:async()=>({id:"generation-456",status:"COMPLETED",outputUrl:"https://cdn.sync.so/bad.mp4",outputDuration:1}),
      arrayBuffer:async()=>Buffer.from("not an mp4")
    })
  }),/verified MP4 container/);
});
