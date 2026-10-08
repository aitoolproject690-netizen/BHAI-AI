import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root=path.resolve(new URL("..",import.meta.url).pathname);
const agentPath=path.join(root,"api","agent.js");
const agentSource=fs.readFileSync(agentPath,"utf8");

test("agent medical lane is declared only after its dependencies are initialized",()=>{
  const systemDecl=agentSource.indexOf("const system=" + "`" + "You are BHAI AI");
  const routedDecl=agentSource.indexOf("const routedMessages=contextRoute.messages;");
  const medicalBlocks=[...agentSource.matchAll(/if\(isMedicalChatIntent\(latestUserMessage\)\)\{/g)].map(m=>m.index);
  const routedUse=agentSource.indexOf("messages:routedMessages");
  assert.ok(systemDecl>=0,"system declaration missing");
  assert.ok(routedDecl>=0,"routedMessages declaration missing");
  assert.equal(medicalBlocks.length,1,"agent must have exactly one latestUserMessage medical lane");
  assert.ok(medicalBlocks[0]>systemDecl,"agent medical lane must run after system initialization");
  assert.ok(medicalBlocks[0]>routedDecl,"agent medical lane must run after routedMessages initialization");
  assert.ok(routedUse<0||routedUse>routedDecl,"routedMessages is used before declaration");
  assert.match(agentSource,/isSimpleColdQuestion/);
  assert.match(agentSource,/from "[.][.]\/src\/medicalSafety[.]js"/);
});

test("current web research uses topic-filtered evidence rather than raw results",()=>{
  const lane=agentSource.indexOf("const currentResearchRequest=isWebResearchIntent(latestText);");
  assert.ok(lane>=0,"current research lane missing");
  const filteredEvidence=agentSource.indexOf("const evidence=researchResults.slice(0,6)",lane);
  const rawEvidence=agentSource.indexOf("const evidence=results.slice(0,6)",lane);
  assert.ok(filteredEvidence>lane,"current research evidence must use filtered researchResults");
  assert.equal(rawEvidence,-1,"raw search results must not bypass topic filtering");
});

function listJs(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...listJs(full));
    else if(entry.isFile()&&entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

test("all api/src/test JavaScript files pass Node syntax validation",()=>{
  const files=["api","src","test"].flatMap(name=>listJs(path.join(root,name)));
  const failures=[];
  for(const file of files){
    try{
      execFileSync(process.execPath,["--check",file],{stdio:"pipe"});
    }catch(error){
      failures.push({file:path.relative(root,file),stderr:String(error?.stderr||"").slice(-2000)});
    }
  }
  assert.deepEqual(failures,[]);
});

test("agent server guard uses the shared natural conversational reply helper",()=>{
  assert.match(agentSource,/const conversationalReply=getCasualReply\(latestUserMessage\);/);
  assert.match(agentSource,/text:conversationalReply\|\|casualReplies\[normalizedCasual\]/);
});

test("generic agent requests use the general-chat provider lane while work requests keep the engineering lane",()=>{
  assert.match(agentSource,/isGeneralChatIntent/);
  assert.match(agentSource,/const generalConversation=isGeneralChatIntent\(latestText\)/);\n  assert.match(agentSource,/role:generalConversation\?"chat-general":"engineering"/);
});
