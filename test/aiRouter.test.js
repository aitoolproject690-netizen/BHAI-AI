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
    anthropic:process.env.ANTHROPIC_API_KEY
  };
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try{
    assert.deepEqual(getConfiguredAIProviders(),[]);
    assert.throws(()=>routeAI({task:"hello"}),/No AI provider is configured/);
  }finally{
    if(original.gemini!==undefined)process.env.GEMINI_API_KEY=original.gemini;
    if(original.google!==undefined)process.env.GOOGLE_API_KEY=original.google;
    if(original.openai!==undefined)process.env.OPENAI_API_KEY=original.openai;
    if(original.anthropic!==undefined)process.env.ANTHROPIC_API_KEY=original.anthropic;
  }
});

test("AI router honors an explicitly configured provider and exclusion",()=>{
  const original=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY="test-key";
  try{
    assert.equal(routeAI({preferred:"openai"}),"openai");
    assert.notEqual(routeAI({preferred:"openai",exclude:["openai"]}),"openai");
  }finally{
    if(original===undefined)delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY=original;
  }
});
