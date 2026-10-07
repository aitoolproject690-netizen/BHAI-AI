import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {getAIProviderStatus,getConfiguredAIProviders,routeAI,generateVerifiedAnswer} from "../api/aiRouter.js";

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


test("research routing prefers configured stronger providers before local Core",()=>{
 const old={...process.env};
 try{
  process.env.BHAI_CORE_URL="http://core.test";
  process.env.BHAI_CORE_API_KEY="x";
  process.env.GEMINI_API_KEY="x";
  process.env.OPENAI_API_KEY="x";
  process.env.ANTHROPIC_API_KEY="x";
  assert.equal(routeAI({task:"latest news today",role:"researcher"}),"gemini");
 }finally{
  for(const k of Object.keys(process.env)){if(!(k in old))delete process.env[k]}
  Object.assign(process.env,old);
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

test("BHAI-CORE circuit-open state falls through to another configured provider",async()=>{
  const old={...process.env};
  const originalFetch=global.fetch;
  process.env.BHAI_CORE_URL="https://core.test";
  process.env.BHAI_CORE_API_KEY="test-core-key";
  process.env.OPENAI_API_KEY="test-openai";
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.HF_TOKEN;
  try{
    let calls=0;
    global.fetch=async(url)=>{
      calls++;
      if(String(url).includes("core.test")){
        return new Response(JSON.stringify({error:{message:"temporary core failure"}}),{status:503,headers:{"content-type":"application/json"}});
      }
      if(String(url).includes("api.openai.com")){
        return new Response(JSON.stringify({output_text:"openai-fallback-ok"}),{status:200,headers:{"content-type":"application/json"}});
      }
      throw new Error("Unexpected provider request in isolated fallback test: "+String(url));
    };
    const {generateWithRouter}=await import("../api/aiRouter.js?circuit-fallback="+Date.now());
    const first=await generateWithRouter({task:"hello",preferred:"core",role:"chat"});
    assert.equal(first.provider,"openai");
    assert.equal(first.text,"openai-fallback-ok");
    const second=await generateWithRouter({task:"hello again",preferred:"core",role:"chat"});
    assert.equal(second.provider,"openai");
    assert.equal(second.text,"openai-fallback-ok");
    assert.equal(calls,4);
  }finally{
    global.fetch=originalFetch;
    for(const k of Object.keys(process.env)){if(!(k in old))delete process.env[k]}
    Object.assign(process.env,old);
  }
});


test("verified answer engine passes a research draft through an independent reviewer",async()=>{
  const old={...process.env};
  const originalFetch=global.fetch;
  process.env.GEMINI_API_KEY="test-gemini";
  process.env.GEMINI_ROUTER_MODEL="test-gemini-model";
  process.env.OPENAI_API_KEY="test-openai";
  process.env.OPENAI_MODEL="test-openai-model";
  delete process.env.BHAI_CORE_URL;
  delete process.env.BHAI_CORE_API_KEY;
  try{
    let calls=0;
    global.fetch=async(url)=>{
      calls++;
      if(String(url).includes("generativelanguage.googleapis.com")){
        return new Response(JSON.stringify({
          candidates:[{content:{parts:[{text:"Petrol is a complex mixture of hydrocarbons, with additives used to provide desired performance and cleanliness."}]}}]
        }),{status:200,headers:{"content-type":"application/json"}});
      }
      return new Response(JSON.stringify({
        output_text:'{"verdict":"PASS","issues":[],"corrections":[]}'
      }),{status:200,headers:{"content-type":"application/json"}});
    };
    const out=await generateVerifiedAnswer({
      task:"What is petrol?",
      role:"researcher",
      evidence:"[1] Fuel is a mixture of hydrocarbons."
    });
    assert.equal(out.verified,true);
    assert.equal(out.quality?.verdict,"PASS");
    assert.equal(out.provider,"gemini");
    assert.equal(out.quality?.reviewer,"openai");
    assert.equal(calls,2);
  }finally{
    global.fetch=originalFetch;
    for(const k of Object.keys(process.env)){if(!(k in old))delete process.env[k]}
    Object.assign(process.env,old);
  }
});

test("reviewer falls back to another configured provider after reviewer outage",async()=>{
  const old={...process.env};
  const originalFetch=global.fetch;
  process.env.GEMINI_API_KEY="test-gemini";
  process.env.OPENAI_API_KEY="test-openai";
  process.env.ANTHROPIC_API_KEY="test-anthropic";
  delete process.env.BHAI_CORE_URL;
  delete process.env.BHAI_CORE_API_KEY;
  try{
    let calls=[];
    global.fetch=async(url)=>{
      const u=String(url);
      calls.push(u);
      if(u.includes("generativelanguage.googleapis.com")){
        return new Response(JSON.stringify({candidates:[{content:{parts:[{text:"Petrol is a mixture of hydrocarbons."}]}}]}),{status:200});
      }
      if(u.includes("api.openai.com")){
        return new Response(JSON.stringify({error:{message:"temporary reviewer overload"}}),{status:503});
      }
      if(u.includes("api.anthropic.com")){
        return new Response(JSON.stringify({content:[{type:"text",text:'{"verdict":"PASS","issues":[],"corrections":[]}'}]}),{status:200});
      }
      throw new Error("Unexpected provider: "+u);
    };
    const {generateVerifiedAnswer}=await import("../api/aiRouter.js?review-fallback="+Date.now());
    const out=await generateVerifiedAnswer({
      task:"What is petrol?",
      role:"researcher",
      evidence:"[1] Fuel is a mixture of hydrocarbons."
    });
    assert.equal(out.verified,true);
    assert.equal(out.quality?.verdict,"PASS");
    assert.equal(out.quality?.reviewer,"anthropic");
  }finally{
    global.fetch=originalFetch;
    for(const k of Object.keys(process.env)){if(!(k in old))delete process.env[k]}
    Object.assign(process.env,old);
  }
});

test("single-provider research can use a same-provider second-pass reviewer",async()=>{
  const old={...process.env};
  const originalFetch=global.fetch;
  process.env.GEMINI_API_KEY="test-gemini";
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.HF_TOKEN;
  delete process.env.BHAI_CORE_URL;
  delete process.env.BHAI_CORE_API_KEY;
  try{
    let calls=0;
    global.fetch=async(url)=>{
      calls++;
      assert.match(String(url),/generativelanguage.googleapis.com/);
      return new Response(JSON.stringify({
        candidates:[{content:{parts:[{text:calls===1?"Petrol is a mixture of hydrocarbons.":'{"verdict":"PASS","issues":[],"corrections":[]}'}]}}]
      }),{status:200});
    };
    const {generateVerifiedAnswer}=await import("../api/aiRouter.js?single-review="+Date.now());
    const out=await generateVerifiedAnswer({
      task:"What is petrol?",
      role:"researcher",
      evidence:"[1] Fuel is a mixture of hydrocarbons."
    });
    assert.equal(out.verified,true);
    assert.equal(out.quality?.verdict,"PASS");
    assert.equal(out.quality?.reviewer,"gemini");
    assert.equal(calls,2);
  }finally{
    global.fetch=originalFetch;
    for(const k of Object.keys(process.env)){if(!(k in old))delete process.env[k]}
    Object.assign(process.env,old);
  }
});

test("verified answer engine performs one bounded correction after reviewer failure",async()=>{
  const old={...process.env};
  const originalFetch=global.fetch;
  process.env.GEMINI_API_KEY="test-gemini";
  process.env.GEMINI_ROUTER_MODEL="test-gemini-model";
  process.env.OPENAI_API_KEY="test-openai";
  process.env.OPENAI_MODEL="test-openai-model";
  delete process.env.BHAI_CORE_URL;
  delete process.env.BHAI_CORE_API_KEY;
  try{
    let calls=0;
    global.fetch=async(url)=>{
      calls++;
      if(String(url).includes("generativelanguage.googleapis.com")){
        return new Response(JSON.stringify({
          candidates:[{content:{parts:[{text:calls===1?"Petrol contains tetrafluorooctane and always prevents engine wear.":"Petrol is primarily a mixture of hydrocarbons and can contain performance-related additives."}]}}]
        }),{status:200,headers:{"content-type":"application/json"}});
      }
      const verdict=calls===2
        ? '{"verdict":"FAIL","issues":["invented chemical claim"],"corrections":["Remove unsupported chemical names and absolute claims."]}'
        : '{"verdict":"PASS","issues":[],"corrections":[]}';
      return new Response(JSON.stringify({output_text:verdict}),{status:200,headers:{"content-type":"application/json"}});
    };
    const out=await generateVerifiedAnswer({
      task:"What is petrol?",
      role:"researcher",
      evidence:"[1] Fuel is a mixture of hydrocarbons."
    });
    assert.equal(out.verified,true);
    assert.equal(out.quality?.verdict,"CORRECTED");
    assert.match(out.text,/mixture of hydrocarbons/i);
    assert.equal(calls,3);
  }finally{
    global.fetch=originalFetch;
    for(const k of Object.keys(process.env)){if(!(k in old))delete process.env[k]}
    Object.assign(process.env,old);
  }
});
