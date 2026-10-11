import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";

test("server boots and binds its configured port",async()=>{
 const child=spawn(process.execPath,["server.js"],{cwd:process.cwd(),env:{...process.env,DATABASE_URL:"",PORT:"18765"},stdio:["ignore","pipe","pipe"]});
 let out="",err="";
 child.stdout.on("data",b=>out+=b.toString());
 child.stderr.on("data",b=>err+=b.toString());
 const code=await new Promise(resolve=>{
  const timer=setTimeout(()=>{child.kill("SIGTERM");resolve(null)},5000);
  child.on("exit",c=>{clearTimeout(timer);resolve(c)});
 });
 assert.match(out,/BHAI X listening on 18765/,"stdout: "+out+"\\nstderr: "+err);
 assert.equal(code,null,"server exited early with "+code+": "+out+"\\n"+err);
 child.kill("SIGTERM");
});

test("server honors SERVER_PORT when PORT is unset",async()=>{
 const child=spawn(process.execPath,["server.js"],{cwd:process.cwd(),env:{...process.env,DATABASE_URL:"",PORT:"",SERVER_PORT:"18766"},stdio:["ignore","pipe","pipe"]});
 let out="",err="";
 child.stdout.on("data",b=>out+=b.toString());
 child.stderr.on("data",b=>err+=b.toString());
 const code=await new Promise(resolve=>{
  const timer=setTimeout(()=>{child.kill("SIGTERM");resolve(null)},5000);
  child.on("exit",c=>{clearTimeout(timer);resolve(c)});
 });
 assert.match(out,/BHAI X listening on 18766/,"stdout: "+out+"\\nstderr: "+err);
 assert.equal(code,null,"server exited early with "+code+": "+out+"\\n"+err);
 child.kill("SIGTERM");
});
