import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {requireSession} from "./api/_utils.js";
import agent from "./api/agent.js";
import health from "./api/health.js";
import build from "./api/build.js";
import files from "./api/files.js";
import jobs from "./api/jobs.js";
import worker from "./api/worker.js";
import preflight from "./api/preflight.js";
import search from "./api/search.js";
import task from "./api/task.js";
import github from "./api/github.js";
import owner from "./api/owner.js";
import control from "./api/control.js";
import backups from "./api/backups.js";
import codefix from "./api/codefix.js";
import capabilities from "./api/capabilities.js";
import ai from "./api/ai.js";
import generate from "./api/generate.js";
import analyze from "./api/analyze.js";
import suggestions from "./api/suggestions.js";
import system from "./api/system.js";
import memory from "./api/memory.js";
import doctor from "./api/doctor.js";
import diff from "./api/diff.js";
import tests from "./api/tests.js";
import dna from "./api/dna.js";
import vault from "./api/vault.js";
import accounts from "./api/accounts.js";
import resellers from "./api/resellers.js";
import billing from "./api/billing.js";
import errorfix from "./api/errorfix.js";
import deploy from "./api/deploy.js";
import engineering from "./api/engineering.js";
import mission from "./api/mission.js";
import apiKeys from "./api/apiKeys.js";
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT)||10000;
const allowedOrigin="*";
const routes={"/api/agent":agent,"/api/health":health,"/api/build":build,"/api/files":files,"/api/jobs":jobs,"/api/worker":worker,"/api/preflight":preflight,"/api/search":search,"/api/task":task,"/api/github":github,"/api/owner":owner,"/api/control":control,"/api/backups":backups,"/api/codefix":codefix,"/api/capabilities":capabilities,"/api/ai":ai,"/api/generate":generate,"/api/analyze":analyze,"/api/suggestions":suggestions,"/api/system":system,"/api/memory":memory,"/api/doctor":doctor,"/api/diff":diff,"/api/tests":tests,"/api/dna":dna,"/api/vault":vault,"/api/accounts":accounts,"/api/resellers":resellers,"/api/billing":billing,"/api/errorfix":errorfix,"/api/deploy":deploy,"/api/engineering":engineering,"/api/mission":mission,"/api/api-keys":apiKeys,"/api/media":agent,"/api/chat":agent};
function runApi(fn,req,res){
  let body="";
  req.on("data",c=>{body+=c;if(body.length>2000000){res.statusCode=413;req.destroy();}});
  req.on("end",async()=>{try{
    req.body=body?JSON.parse(body):{};
    req.query=Object.fromEntries(new URL(req.url||"/","http://localhost").searchParams);
    res.json=x=>{res.setHeader("Content-Type","application/json");res.end(JSON.stringify(x));};
    res.status=code=>{res.statusCode=code;return res;};
    console.log("[API]",req.method,req.url); await fn(req,res);
  }catch(e){res.statusCode=500;res.setHeader("Content-Type","application/json");res.end(JSON.stringify({error:e.message||"Server error"}));}});
}
http.createServer((req,res)=>{
  res.setHeader("Access-Control-Allow-Origin",allowedOrigin);
  res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if(req.method==="OPTIONS"){res.statusCode=204;return res.end();}
  const u=new URL(req.url||"/","http://localhost");
  if(routes[u.pathname]){
    const fn=routes[u.pathname];
    // BHAI-X is a private owner-only app. Authentication is intentionally bypassed only for login/account bootstrap and Render health checks.
    if(u.pathname!=="/api/accounts"&&u.pathname!=="/api/health")return runApi(async(req,res)=>{if(!await requireSession(req,res))return;return fn(req,res);},req,res);
    return runApi(fn,req,res);
  }
  let p=decodeURIComponent(u.pathname);if(p==="/")p="/index.html";
  const root=path.join(__dirname,"dist"),file=path.join(root,p.replace(/^\//,""));
  if(!file.startsWith(root+path.sep)&&file!==root){res.statusCode=403;return res.end("Forbidden");}
  const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".ico":"image/x-icon"};
  fs.readFile(file,(e,data)=>{
    if(e){
      fs.readFile(path.join(root,"index.html"),(e2,d)=>{
        if(e2){res.statusCode=404;return res.end("Not found")}
        res.statusCode=200;res.setHeader("Content-Type","text/html; charset=utf-8");res.end(d);
      });return;
    }
    res.statusCode=200;res.setHeader("Content-Type",types[path.extname(file).toLowerCase()]||"application/octet-stream");
    res.setHeader("Cache-Control",p.includes("/assets/")?"public, max-age=31536000, immutable":"no-cache");
    res.end(data);
  });
}).listen(port,"0.0.0.0",()=>console.log("BHAI X listening on "+port));
