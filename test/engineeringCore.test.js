import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFilePath, resolveGithubTarget, classifyEngineeringError, createRetryGuard, createEvidence } from "../api/engineeringCore.js";

test("resolves explicit GitHub owner/repo/file target",()=>{
  const x=resolveGithubTarget("fix aitoolproject690-netizen/BHAI-TASK-APP-TEST/index.html");
  assert.equal(x.owner,"aitoolproject690-netizen");
  assert.equal(x.repo,"BHAI-TASK-APP-TEST");
  assert.equal(x.path,"index.html");
});

test("normalizes safe repository paths",()=>{
  assert.equal(normalizeFilePath("/src//app.js/"),"src/app.js");
  assert.throws(()=>normalizeFilePath("../secret.js"),/Unsafe repository path/);
});

test("classifies GitHub not-found errors without retry",()=>{
  const x=classifyEngineeringError({status:404,message:"Not Found"});
  assert.equal(x.type,"not_found");
  assert.equal(x.retryable,false);
});

test("retry guard blocks identical attempts",()=>{
  const g=createRetryGuard();
  assert.equal(g.canTry("github_read",{path:"index.html"}),true);
  assert.equal(g.canTry("github_read",{path:"index.html"}),false);
});

test("evidence requires repository, branch, path, commit and passing tests",()=>{
  const e=createEvidence();
  e.set({repository:"owner/repo",branch:"main",path:"index.html",commit:"abc"});
  e.addTest("read-back",true);
  assert.equal(e.verify(),true);
});