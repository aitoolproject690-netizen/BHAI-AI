import test from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../api/db.js";

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test("failed database connection is retried after backoff instead of memoized forever",async()=>{
 const previousUrl=process.env.DATABASE_URL;
 const originalError=console.error;
 const errors=[];
 process.env.DATABASE_URL="postgres://bhai:bhai@127.0.0.1:1/reconnect_test";
 console.error=(...args)=>errors.push(args);
 try{
  assert.equal(await getDb(),null);
  assert.equal(errors.length,1,"first connection attempt should be recorded");
  assert.equal(await getDb(),null);
  assert.equal(errors.length,1,"backoff must prevent a tight retry loop");
  await sleep(1100);
  assert.equal(await getDb(),null);
  assert.equal(errors.length,2,"a later call should retry after the backoff");
 }finally{
  console.error=originalError;
  if(previousUrl===undefined)delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL=previousUrl;
 }
});
