import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import agent from "./api/agent.js";
import health from "./api/health.js";
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT)||10000;
const routes={"/api/agent":agent,"/api/health":health};
function runApi(fn,req,res){
 let body="";
 req.on("data",c=>{body+=c;if(body.length>2_000_000)req.destroy();});
 req.on("end",async()=>{try{req.body=body?JSON.parse(body):{};res.json=(x)=>{res.setHeader("Content-Type","application/json");res.end(JSON.stringify(x));};res.status=(code)=>{res.statusCode=code;return res;};await fn(req,res);}catch(e){res.statusCode=500;res.setHeader("Content-Type","application/json");res.end(JSON.stringify({error:e.message}));}});
}
http.createServer((req,res)=>{
 const u=new URL(req.url||"/","http://localhost");
 if(routes[u.pathname]) return runApi(routes[u.pathname],req,res);
 let p=decodeURIComponent(u.pathname); if(p==="/")p="/index.html";
 const file=path.join(__dirname,"dist",p.replace(/^\//,""));
 if(!file.startsWith(path.join(__dirname,"dist"))) {res.statusCode=403;return res.end("Forbidden");}
 fs.readFile(file,(e,data)=>{if(e){fs.readFile(path.join(__dirname,"dist","index.html"),(e2,d)=>{if(e2){res.statusCode=404;return res.end("Not found")}res.setHeader("Content-Type","text/html");res.end(d)});return}res.end(data);});
}).listen(port,"0.0.0.0",()=>console.log("BHAI AI listening on "+port));