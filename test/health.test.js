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
