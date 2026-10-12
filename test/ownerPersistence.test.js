import test from "node:test";
import assert from "node:assert/strict";

const previousUrl=process.env.DATABASE_URL;
const previousOwnerKey=process.env.OWNER_ACCESS_KEY;
delete process.env.DATABASE_URL;
process.env.OWNER_ACCESS_KEY="owner-persistence-test-key";
const owner=await import("../api/owner.js?owner-persistence-test");

test("owner state mutations fail closed when persistent storage is unavailable",async()=>{
 const before=owner.ownerState().serverMode;
 const req={method:"POST",headers:{"x-owner-key":"owner-persistence-test-key"},body:{action:"set_server_mode",mode:"maintenance"}};
 const res={
  statusCode:200,
  status(code){this.statusCode=code;return this;},
  json(payload){this.payload=payload;return this;}
 };
 await owner.default(req,res);
 assert.equal(res.statusCode,503);
 assert.match(res.payload.error,/no changes were saved/i);
 assert.equal(owner.ownerState().serverMode,before);
});

test("owner state reads identify non-persistent fallback state",async()=>{
 const req={method:"GET",headers:{"x-owner-key":"owner-persistence-test-key"},body:{}};
 const res={
  statusCode:200,
  status(code){this.statusCode=code;return this;},
  json(payload){this.payload=payload;return this;}
 };
 await owner.default(req,res);
 assert.equal(res.statusCode,200);
 assert.equal(res.payload.persistence.ready,false);
});

test.after(()=>{
 if(previousUrl===undefined)delete process.env.DATABASE_URL;
 else process.env.DATABASE_URL=previousUrl;
 if(previousOwnerKey===undefined)delete process.env.OWNER_ACCESS_KEY;
 else process.env.OWNER_ACCESS_KEY=previousOwnerKey;
});
