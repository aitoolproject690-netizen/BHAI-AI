import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {requireSession} from "./api/_utils.js";
import {attachRequestId,sendJson,sendError,createRequestId} from "./api/responseGuard.js";
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
import story from "./api/story.js";
import characters from "./api/characters.js";
import apiKeys from "./api/apiKeys.js";
import youtube from "./api/youtube.js";
import production from "./api/production.js";
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT)||10000;
const configuredCorsOrigin=String(process.env.BHAI_CORS_ORIGIN||"").trim();
const routes={"/api/agent":agent,"/api/health":health,"/api/build":build,"/api/files":files,"/api/jobs":jobs,"/api/worker":worker,"/api/preflight":preflight,"/api/search":search,"/api/task":task,"/api/github":github,"/api/owner":owner,"/api/control":control,"/api/backups":backups,"/api/codefix":codefix,"/api/capabilities":capabilities,"/api/ai":ai,"/api/generate":generate,"/api/analyze":analyze,"/api/suggestions":suggestions,"/api/system":system,"/api/memory":memory,"/api/doctor":doctor,"/api/diff":diff,"/api/tests":tests,"/api/dna":dna,"/api/vault":vault,"/api/accounts":accounts,"/api/resellers":resellers,"/api/billing":billing,"/api/errorfix":errorfix,"/api/deploy":deploy,"/api/engineering":engineering,"/api/mission":mission,"/api/story":story,"/api/characters":characters,"/api/api-keys":apiKeys,"/api/youtube":youtube,"/api/youtube/callback":youtube,"/api/production":production,"/api/media":agent,"/api/chat":agent};
function runApi(fn,req,res){
  attachRequestId(res,req.__bhaiRequestId||createRequestId());
  let body="";
  let tooLarge=false;
  const MAX_BODY_BYTES=2000000;
  req.on("data",c=>{
    if(tooLarge)return;
    body+=c.toString("utf8");
    if(Buffer.byteLength(body,"utf8")>MAX_BODY_BYTES){
      tooLarge=true;
      sendError(res,413,"Request body too large.");
      req.resume();
    }
  });
  req.on("end",async()=>{
   if(tooLarge)return;
   try{
    req.body=body?JSON.parse(body):{};
   }catch(e){
    return sendError(res,400,"Invalid JSON request body.");
   }
   try{
    req.query=Object.fromEntries(new URL(req.url||"/","http://localhost").searchParams);
    res.json=x=>sendJson(res,res.statusCode>=400?res.statusCode:200,x);
    res.status=code=>{res.statusCode=code;return res;};
    console.log("[API]",req.method,req.url,"requestId="+res.__bhaiRequestId);
    await fn(req,res);
    if(!res.writableEnded && !res.headersSent) sendError(res,500,"API handler returned without a response.");
   }catch(e){
    return sendError(res,500,e,{requestId:res.__bhaiRequestId});
   }
  });
  req.on("aborted",()=>console.warn("[API] request aborted","requestId="+res.__bhaiRequestId));
}
http.createServer((req,res)=>{
  const requestId=createRequestId();
  req.__bhaiRequestId=requestId;
  attachRequestId(res,requestId);
  if(configuredCorsOrigin){
    res.setHeader("Access-Control-Allow-Origin",configuredCorsOrigin);
    res.setHeader("Vary","Origin");
    res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization, X-BHAI-Request-ID");
    res.setHeader("Access-Control-Allow-Methods","GET,POST,PUT,PATCH,DELETE,OPTIONS");
  }
  if(req.method==="OPTIONS"){res.statusCode=204;return res.end();}
  const u=new URL(req.url||"/","http://localhost");
  // Unknown /api routes must never fall through to the SPA shell.
  // A backend typo should be an explicit 404, not a misleading HTML 200.
  if(u.pathname.startsWith("/api/")&&!routes[u.pathname]) return sendError(res,404,"API route not found.");
  if(routes[u.pathname]){
    const fn=routes[u.pathname];
    // BHAI-X is a private owner-only app. Authentication is intentionally bypassed only for login/account bootstrap and Render health checks.
    if(u.pathname!=="/api/accounts"&&u.pathname!=="/api/health"&&u.pathname!=="/api/youtube/callback")return runApi(async(req,res)=>{if(!await requireSession(req,res))return;return fn(req,res);},req,res);
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
