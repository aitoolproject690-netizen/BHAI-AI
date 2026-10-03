import test from "node:test";
import assert from "node:assert/strict";
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
    core:process.env.BHAI_CORE_API_KEY
  };
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.HF_TOKEN;
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
    if(original.core!==undefined)process.env.BHAI_CORE_API_KEY=original.core;
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
  const original=process.env.BHAI_CORE_API_KEY;
  process.env.BHAI_CORE_API_KEY="test-core-key";
  try{
    const status=getAIProviderStatus().find(p=>p.id==="core");
    assert.equal(status?.configured,true);
    assert.equal(routeAI({task:"fix this code"}),"core");
    assert.equal(Object.prototype.hasOwnProperty.call(status||{},"apiKey"),false);
  }finally{
    if(original===undefined)delete process.env.BHAI_CORE_API_KEY; else process.env.BHAI_CORE_API_KEY=original;
  }
});
