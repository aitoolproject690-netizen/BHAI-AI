import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {getAIProviderStatus,getConfiguredAIProviders,routeAI} from "../api/aiRouter.js";

test("multi-AI provider status never exposes API keys",()=>{
  const status=getAIProviderStatus();
  assert.ok(Array.isArray(status));
  for(const p of status){
    assert.ok(p.id);
    assert.ok(["configured","not_configured"].includes(p.status));
    assert.equal(Object.prototype.hasOwnProperty.call(p,"apiKey"),false);
    assert.equal(Object.prototype.hasOwnProperty.call(p,"key"),false);
  }
});

test("AI router fails clearly when no provider is configured",()=>{
  const original={
    gemini:process.env.GEMINI_API_KEY,
    google:process.env.GOOGLE_API_KEY,
    openai:process.env.OPENAI_API_KEY,
    anthropic:process.env.ANTHROPIC_API_KEY,
    hf:process.env.HF_TOKEN,
    coreUrl:process.env.BHAI_CORE_URL,
    coreKey:process.env.BHAI_CORE_API_KEY
  };
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.HF_TOKEN;
  delete process.env.BHAI_CORE_URL;
  delete process.env.BHAI_CORE_API_KEY;
  try{
    assert.deepEqual(getConfiguredAIProviders(),[]);
    assert.throws(()=>routeAI({task:"hello"}),/No AI provider is configured/);
  }finally{
    if(original.gemini!==undefined)process.env.GEMINI_API_KEY=original.gemini;
    if(original.google!==undefined)process.env.GOOGLE_API_KEY=original.google;
    if(original.openai!==undefined)process.env.OPENAI_API_KEY=original.openai;
    if(original.anthropic!==undefined)process.env.ANTHROPIC_API_KEY=original.anthropic;
    if(original.hf!==undefined)process.env.HF_TOKEN=original.hf;
    if(original.coreUrl!==undefined)process.env.BHAI_CORE_URL=original.coreUrl;
    if(original.coreKey!==undefined)process.env.BHAI_CORE_API_KEY=original.coreKey;
  }
});

test("AI router honors an explicitly configured provider and exclusion",()=>{
  const originalOpenAI=process.env.OPENAI_API_KEY;
  const originalAnthropic=process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY="test-key";
  process.env.ANTHROPIC_API_KEY="test-key";
  try{
    assert.equal(routeAI({preferred:"openai"}),"openai");
    assert.notEqual(routeAI({preferred:"openai",exclude:["openai"]}),"openai");
  }finally{
    if(originalOpenAI===undefined)delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY=originalOpenAI;
    if(originalAnthropic===undefined)delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY=originalAnthropic;
  }
});


test("reviewer routing can choose an independent provider",()=>{
  const originals={
    openai:process.env.OPENAI_API_KEY,
    gemini:process.env.GEMINI_API_KEY
  };
  process.env.OPENAI_API_KEY="test-openai";
  process.env.GEMINI_API_KEY="test-gemini";
  try{
    assert.equal(routeAI({task:"review this GitHub fix",role:"reviewer",exclude:["gemini"]}),"openai");
  }finally{
    if(originals.openai===undefined)delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY=originals.openai;
    if(originals.gemini===undefined)delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY=originals.gemini;
  }
});


test("AI router falls back when the primary provider reports high demand",async()=>{
  const old={...process.env};
  const originalFetch=global.fetch;
  process.env.GEMINI_API_KEY="test-gemini";
  process.env.OPENAI_API_KEY="test-openai";
  try{
    let calls=0;
    global.fetch=async(url)=>{
      calls++;
      if(String(url).includes("generativelanguage.googleapis.com")){
        return new Response(JSON.stringify({error:{message:"This model is currently experiencing high demand. Please try again later."}}),{status:503,headers:{"content-type":"application/json"}});
      }
      return new Response(JSON.stringify({output_text:"fallback-ok"}),{status:200,headers:{"content-type":"application/json"}});
    };
    const {generateWithRouter}=await import("../api/aiRouter.js?fallback="+Date.now());
    const out=await generateWithRouter({task:"hello",preferred:"gemini",role:"chat"});
    assert.equal(out.provider,"openai");
    assert.equal(out.text,"fallback-ok");
    assert.equal(calls,2);
  }finally{
    global.fetch=originalFetch;
    for(const k of Object.keys(process.env)){if(!(k in old))delete process.env[k]}
    Object.assign(process.env,old);
  }
});


test("BHAI-CORE is a first-class router provider without exposing its API key",()=>{
  const original={url:process.env.BHAI_CORE_URL,key:process.env.BHAI_CORE_API_KEY};
  process.env.BHAI_CORE_URL="https://core.test";
  process.env.BHAI_CORE_API_KEY="test-core-key";
  try{
    const status=getAIProviderStatus().find(p=>p.id==="core");
    assert.equal(status?.configured,true);
    assert.equal(routeAI({task:"fix this code"}),"core");
    assert.equal(Object.prototype.hasOwnProperty.call(status||{},"apiKey"),false);
  }finally{
    if(original.url===undefined)delete process.env.BHAI_CORE_URL; else process.env.BHAI_CORE_URL=original.url;
    if(original.key===undefined)delete process.env.BHAI_CORE_API_KEY; else process.env.BHAI_CORE_API_KEY=original.key;
  }
});

test("AI router falls back when the primary provider has a transient network failure",async()=>{
  const old={...process.env};
  const originalFetch=global.fetch;
  process.env.GEMINI_API_KEY="test-gemini";
  process.env.OPENAI_API_KEY="test-openai";
  try{
    let calls=0;
    global.fetch=async(url)=>{
      calls++;
      if(String(url).includes("generativelanguage.googleapis.com")){
        throw new TypeError("fetch failed");
      }
      return new Response(JSON.stringify({output_text:"network-fallback-ok"}),{status:200,headers:{"content-type":"application/json"}});
    };
    const {generateWithRouter}=await import("../api/aiRouter.js?network-fallback="+Date.now());
    const out=await generateWithRouter({task:"hello",preferred:"gemini",role:"chat"});
    assert.equal(out.provider,"openai");
    assert.equal(out.text,"network-fallback-ok");
    assert.equal(calls,2);
  }finally{
    global.fetch=originalFetch;
    for(const k of Object.keys(process.env)){if(!(k in old))delete process.env[k]}
    Object.assign(process.env,old);
  }
});


test("BHAI-CORE requires an explicit URL",()=>{
  const oldUrl=process.env.BHAI_CORE_URL;
  const oldKey=process.env.BHAI_CORE_API_KEY;
  delete process.env.BHAI_CORE_URL;
  process.env.BHAI_CORE_API_KEY="test-core-key";
  try{
    const status=getAIProviderStatus().find(p=>p.id==="core");
    assert.equal(status?.configured,false);
    assert.equal(getConfiguredAIProviders().includes("core"),false);
  }finally{
    if(oldUrl===undefined)delete process.env.BHAI_CORE_URL; else process.env.BHAI_CORE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.BHAI_CORE_API_KEY; else process.env.BHAI_CORE_API_KEY=oldKey;
  }
});

test("BHAI-CORE has no managed-host fallback",()=>{
  const source=fs.readFileSync(new URL("../api/aiRouter.js",import.meta.url),"utf8");
  assert.doesNotMatch(source,/bhai-core\\.onrender\\.com/i);
});

test("BHAI-CORE sends its server-side API key and accepts the OpenAI-compatible response",async()=>{
  const oldUrl=process.env.BHAI_CORE_URL;
  const oldKey=process.env.BHAI_CORE_API_KEY;
  const originalFetch=global.fetch;
  process.env.BHAI_CORE_URL="https://core.test";
  process.env.BHAI_CORE_API_KEY="test-core-key";
  try{
    let seenUrl="";
    let seenKey="";
    global.fetch=async(url,options)=>{
      seenUrl=String(url);
      seenKey=String(options?.headers?.["x-bhai-key"]||"");
      return new Response(JSON.stringify({
        model:"bhai-local",
        choices:[{message:{content:"core-ok"}}]
      }),{status:200,headers:{"content-type":"application/json"}});
    };
    const {generateWithRouter}=await import("../api/aiRouter.js?core-auth="+Date.now());
    const out=await generateWithRouter({
      task:"hello",
      preferred:"core",
      role:"chat",
      fallback:false
    });
    assert.equal(out.provider,"core");
    assert.equal(out.text,"core-ok");
    assert.equal(seenUrl,"https://core.test/v1/chat/completions");
    assert.equal(seenKey,"test-core-key");
  }finally{
    global.fetch=originalFetch;
    if(oldUrl===undefined)delete process.env.BHAI_CORE_URL; else process.env.BHAI_CORE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.BHAI_CORE_API_KEY; else process.env.BHAI_CORE_API_KEY=oldKey;
  }
});
