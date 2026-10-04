import test from "node:test";
import assert from "node:assert/strict";
import {readJsonResponse,requestJson} from "../src/apiClient.js";

test("readJsonResponse rejects empty responses with a useful error",async()=>{
 const response=new Response("",{status:502,headers:{"X-BHAI-Request-ID":"req-empty"}});
 await assert.rejects(
  ()=>readJsonResponse(response,"/api/agent"),
  error=>error instanceof Error && /empty response \(HTTP 502\).*req-empty/i.test(error.message)
 );
});

test("readJsonResponse parses valid JSON and preserves request id",async()=>{
 const response=new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json","X-BHAI-Request-ID":"req-ok"}});
 const data=await readJsonResponse(response,"/api/test");
 assert.equal(data.ok,true);
 assert.equal(data.requestId,"req-ok");
});

test("requestJson retries only when the caller marks the request retry-safe",async()=>{
 const originalFetch=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async()=>new Response("",{status:502,headers:{"X-BHAI-Request-ID":"req-retry"}});
 try{
  await assert.rejects(
   ()=>requestJson("/api/test",{method:"POST"},{retrySafe:false,retries:1}),
   /empty response \(HTTP 502\)/i
  );
  assert.equal(calls,0);
 }finally{
  globalThis.fetch=originalFetch;
 }
});
