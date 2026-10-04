import test from "node:test";
import assert from "node:assert/strict";
import {routeAI} from "../api/aiRouter.js";

test("engineering roles route build/deploy/review through available providers",()=>{
 const old={...process.env};
 try{
  process.env.GEMINI_API_KEY="x"; process.env.OPENAI_API_KEY="x"; process.env.BHAI_CORE_URL="http://core.test"; process.env.BHAI_CORE_API_KEY="x"; delete process.env.HF_TOKEN; delete process.env.ANTHROPIC_API_KEY;
  assert.equal(routeAI({task:"build APK",role:"code"}),"core");
  assert.equal(routeAI({task:"deployment preflight",role:"reviewer"}),"openai");
  assert.equal(routeAI({task:"review code",role:"reviewer",exclude:["openai"]}),"gemini");
 }finally{for(const k of Object.keys(process.env)){if(!(k in old))delete process.env[k]}Object.assign(process.env,old);}
});