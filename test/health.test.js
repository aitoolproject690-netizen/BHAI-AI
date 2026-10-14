import test from "node:test";
import assert from "node:assert/strict";
import health from "../api/health.js";

test("health self-check verifies natural conversational routing",async()=>{
  const response={
    status(code){this.code=code;return this;},
    json(data){this.data=data;return this;}
  };
  await health({},response);
  assert.equal(response.code,200);
  assert.equal(response.data?.conversationRouting?.ok,true);
  assert.match(String(response.data?.conversationRouting?.reply||""),/test kar raha tha|kya reply deta/i);
});

test("health reports configured non-Gemini providers",async()=>{
  const old={...process.env};
  const response={status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  try{
    for(const key of ["BHAI_CORE_URL","BHAI_CORE_API_KEY","BHAI_CORE_KEY","GEMINI_API_KEY","GOOGLE_API_KEY","ANTHROPIC_API_KEY","HF_TOKEN","POLLINATIONS_API_KEY"]){delete process.env[key];}
    process.env.OPENAI_API_KEY="health-test-key";
    await health({},response);
    assert.equal(response.code,200);
    assert.equal(response.data.aiConfigured,true);
    assert.deepEqual(response.data.configuredAIProviders,["openai"]);
    assert.equal(response.data.provider,"openai");
  }finally{
    for(const key of Object.keys(process.env)){if(!(key in old))delete process.env[key];}
    Object.assign(process.env,old);
  }
});
