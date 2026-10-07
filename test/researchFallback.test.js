import test from "node:test";
import assert from "node:assert/strict";

test("research uses direct evidence when the local draft is unusable",async()=>{
  const old={...process.env};
  const originalFetch=global.fetch;
  process.env.BHAI_CORE_URL="https://core.test";
  process.env.BHAI_CORE_API_KEY="test-core";
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.HF_TOKEN;
  try{
    let calls=0;
    global.fetch=async(url)=>{
      calls++;
      if(String(url).includes("core.test")){
        return new Response(JSON.stringify({model:"smollm2.gguf",choices:[{message:{content:"from"}}]}),{status:200});
      }
      throw new Error("Unexpected request");
    };
    const {generateVerifiedAnswer}=await import("../api/aiRouter.js?direct-evidence-malformed="+Date.now());
    const out=await generateVerifiedAnswer({
      task:"Petrol (gasoline) me kya hota hai?",
      role:"researcher",
      evidence:"[1] Gasoline composition\nURL: https://www.eia.gov/energyexplained/gasoline/\nSummary: Gasoline is a complex mixture of hydrocarbons used as motor fuel. The exact composition varies by formulation."
    });
    assert.equal(out.verified,true);
    assert.equal(out.provider,"evidence-direct");
    assert.equal(out.quality?.verdict,"EVIDENCE_DIRECT");
    assert.match(out.text,/mixture of hydrocarbons/i);
    assert.equal(calls,1);
  }finally{
    global.fetch=originalFetch;
    for(const k of Object.keys(process.env)){if(!(k in old))delete process.env[k]}
    Object.assign(process.env,old);
  }
});

test("research uses direct evidence when every AI provider fails",async()=>{
  const old={...process.env};
  const originalFetch=global.fetch;
  process.env.BHAI_CORE_URL="https://core.test";
  process.env.BHAI_CORE_API_KEY="test-core";
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.HF_TOKEN;
  try{
    global.fetch=async(url)=>{
      if(String(url).includes("core.test")) return new Response(JSON.stringify({error:{message:"temporary failure"}}),{status:503});
      throw new Error("Unexpected request");
    };
    const {generateVerifiedAnswer}=await import("../api/aiRouter.js?direct-evidence-unavailable="+Date.now());
    const out=await generateVerifiedAnswer({
      task:"What is gasoline?",
      role:"researcher",
      evidence:"[1] Gasoline\nURL: https://en.wikipedia.org/wiki/Gasoline\nSummary: Gasoline is a transparent petroleum-derived fuel and a complex mixture of organic compounds, chiefly hydrocarbons."
    });
    assert.equal(out.verified,true);
    assert.equal(out.provider,"evidence-direct");
    assert.match(out.text,/complex mixture of organic compounds/i);
  }finally{
    global.fetch=originalFetch;
    for(const k of Object.keys(process.env)){if(!(k in old))delete process.env[k]}
    Object.assign(process.env,old);
  }
});
