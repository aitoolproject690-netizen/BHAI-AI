import test from "node:test";
import assert from "node:assert/strict";
import {coreStatus} from "../api/core.js";

test("BHAI Core exposes a stable provider-neutral status contract",()=>{
  const status=coreStatus();
  assert.equal(status.ok,true);
  assert.equal(status.service,"BHAI Core");
  assert.equal(status.version,"1");
  assert.equal(status.router,"multi-provider");
  assert.ok(Array.isArray(status.providers));
  for(const provider of status.providers){
    assert.ok(provider.id);
    assert.equal(Object.prototype.hasOwnProperty.call(provider,"apiKey"),false);
    assert.equal(Object.prototype.hasOwnProperty.call(provider,"key"),false);
  }
});
