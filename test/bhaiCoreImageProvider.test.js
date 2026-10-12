import test from "node:test";
import assert from "node:assert/strict";
import { generateImageViaBhAiCore } from "../src/bhaiCoreImageProvider.js";

const png=Buffer.concat([
 Buffer.from([137,80,78,71,13,10,26,10]),
 Buffer.from("00000000000000000000000000000000","hex")
]).toString("base64");

test("BHAI-Core image bridge uses only the private ComfyUI route and accepts its direct response contract",async()=>{
 let called;
 const result=await generateImageViaBhAiCore("cinematic Indian village","16:9",{
  env:{BHAI_CORE_URL:"https://core.example",BHAI_CORE_INTERNAL_IMAGE_KEY:"test-key"},
  fetchImpl:async(url,options)=>{
   called={url,options,body:JSON.parse(options.body)};
   return {ok:true,status:200,json:async()=>({ok:true,mimeType:"image/png",data:png,width:768,height:432,seed:42,provider:"bhai-core-comfyui",verification:{ok:true}})};
  },
  timeoutMs:1000
 });
 assert.equal(called.url,"https://core.example/v1/internal/image/generate");
 assert.equal(called.options.headers["x-bhai-internal-key"],"test-key");
 assert.equal(called.body.prompt,"cinematic Indian village");
 assert.equal("provider" in called.body,false);
 assert.equal("steps" in called.body,false);
 assert.equal(result.provider,"bhai-core-comfyui-gpu");
 assert.equal(result.width,768);
});

test("BHAI-Core image bridge does not use the legacy mobile route without scoped internal key",async()=>{
 let calls=0;
 const result=await generateImageViaBhAiCore("portrait","16:9",{
  env:{BHAI_CORE_API_KEY:"regular-api-key",BHAI_CORE_URL:"https://core.example"},
  fetchImpl:async()=>{calls++;throw new Error("must not call");}
 });
 assert.equal(result,null);
 assert.equal(calls,0);
});

test("BHAI-Core image bridge rejects unverified or invalid image payloads",async()=>{
 await assert.rejects(()=>generateImageViaBhAiCore("portrait","16:9",{
  env:{BHAI_CORE_INTERNAL_IMAGE_KEY:"test-key"},
  fetchImpl:async()=>({ok:true,status:200,json:async()=>({ok:true,data:"aGVsbG8=",mimeType:"image/png",verification:{ok:true}})}),
  timeoutMs:1000
 }),/signature verification/);
});
