import test from "node:test";
import assert from "node:assert/strict";
import {githubConfigured,githubApiFetch,githubApiJson,assertGithubName,assertGithubPath,assertGithubRef,githubRepoUrl} from "../api/githubExecutor.js";

test("GitHub executor validates repository, ref, and path input",()=>{
 assert.equal(assertGithubName("owner-1","GitHub owner"),"owner-1");
 assert.equal(assertGithubRef("feature/fix"),"feature/fix");
 assert.equal(assertGithubPath("src/index.js"),"src/index.js");
 assert.throws(()=>assertGithubName("../bad"),/Invalid GitHub name/);
 assert.throws(()=>assertGithubRef("feature/../main"),/Invalid GitHub branch/);
 assert.throws(()=>assertGithubPath("../secret"),/unsafe GitHub file path/i);
 assert.throws(()=>assertGithubPath("a/./b"),/unsafe GitHub file path/i);
});
test("GitHub executor uses only the official API origin",()=>{
 assert.equal(githubRepoUrl("aitoolproject690-netizen","BHAI-AI"),"https://api.github.com/repos/aitoolproject690-netizen/BHAI-AI");
});
test("GitHub executor injects server-side token without returning it",async()=>{
 const old=process.env.GITHUB_TOKEN,originalFetch=globalThis.fetch;let seen="";
 process.env.GITHUB_TOKEN="test-secret";
 globalThis.fetch=async(_url,options)=>{seen=String(options?.headers?.Authorization||"");return new Response(JSON.stringify({ok:true}),{status:200});};
 try{assert.equal(githubConfigured(),true);const d=await githubApiJson("https://api.github.com/repos/test/repo");assert.equal(d.ok,true);assert.equal(seen,"Bearer test-secret");assert.equal(JSON.stringify(d).includes("test-secret"),false);}
 finally{globalThis.fetch=originalFetch;if(old===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=old;}
});
test("GitHub executor blocks non-API targets before network",async()=>{
 const old=process.env.GITHUB_TOKEN,originalFetch=globalThis.fetch;let called=false;
 process.env.GITHUB_TOKEN="test-secret";globalThis.fetch=async()=>{called=true;throw new Error("network");};
 try{await assert.rejects(()=>githubApiFetch("https://example.com/not-github"),/blocked a non-GitHub API target/i);assert.equal(called,false);}
 finally{globalThis.fetch=originalFetch;if(old===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=old;}
});
test("GitHub executor preserves HTTP status and sanitizes errors",async()=>{
 const old=process.env.GITHUB_TOKEN,originalFetch=globalThis.fetch;process.env.GITHUB_TOKEN="test-secret";
 globalThis.fetch=async()=>new Response(JSON.stringify({message:"Not Found"}),{status:404});
 try{await assert.rejects(()=>githubApiJson("https://api.github.com/repos/test/repo"),e=>e?.status===404&&/Not Found/.test(e.message));}
 finally{globalThis.fetch=originalFetch;if(old===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=old;}
});
