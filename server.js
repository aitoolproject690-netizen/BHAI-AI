import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import agent from "./api/agent.js";
import health from "./api/health.js";
import build from "./api/build.js";
import files from "./api/files.js";
import jobs from "./api/jobs.js";
import search from "./api/search.js";
import task from "./api/task.js";
import github from "./api/github.js";
import owner from "./api/owner.js";
import control from "./api/control.js";
import backups from "./api/backups.js";
import codefix from "./api/codefix.js";
import capabilities from "./api/capabilities.js";
import generate from "./api/generate.js";
import analyze from "./api/analyze.js";
import suggestions from "./api/suggestions.js";
import system from "./api/system.js";
import memory from "./api/memory.js";
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT)||10000;
const routes={"/api/agent":agent,"/api/health":health,"/api/build":build,"/api/files":files,"/api/jobs":jobs,"/api/search":search,"/api/task":task,"/api/github":github,"/api/owner":owner,"/api/control":control,"/api/backups":backups,"/api/codefix":codefix,"/api/capabilities":capabilities,"/api/generate":generate,"/api/analyze":analyze,"/api/suggestions":suggestions,"/api/system":system,"/api/memory":memory};
function runApi(fn,req,res){
  let body="";
  req.on("data",c=>{body+=c;if(body.length>2000000){res.statusCode=413;req.destroy();}});
  req.on("end",async()=>{try{
    req.body=body?JSON.parse(body):{};
    req.query=Object.fromEntries(new URL(req.url||"/","http://localhost").searchParams);
    res.json=x=>{res.setHeader("Content-Type","application/json");res.end(JSON.stringify(x));};
    res.status=code=>{res.statusCode=code;return res;};
    await fn(req,res);
  }catch(e){res.statusCode=500;res.setHeader("Content-Type","application/json");res.end(JSON.stringify({error:e.message||"Server error"}));}});
}
http.createServer((req,res)=>{
  const u=new URL(req.url||"/","http://localhost");
  if(routes[u.pathname])return runApi(routes[u.pathname],req,res);
  let p=decodeURIComponent(u.pathname);if(p==="/")p="/index.html";
  const root=path.join(__dirname,"dist"),file=path.join(root,p.replace(/^\//,""));
  if(!file.startsWith(root+path.sep)&&file!==root){res.statusCode=403;return res.end("Forbidden");}
  const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".ico":"image/x-icon"};
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