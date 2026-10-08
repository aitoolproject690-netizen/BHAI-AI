import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {isCasualIntent,isGeneralChatIntent,isKnowledgeResearchIntent,isWebResearchIntent,isCurrentContextIntent,isMedicalChatIntent,isLocalCodingIntent,detectMediaIntent} from "../src/intentRouter.js";
import {selectSkillForTask,selectSkillsForTask} from "../src/skillsRouter.js";
import {isObviouslyGarbledResponse} from "../src/responseQuality.js";

const cases=[
["conversation",isCasualIntent,"Bhai aise hi dekh raha tha tu kya reply deta hai"],
["general",isGeneralChatIntent,"Mujhe ek simple idea chahiye"],
["knowledge",isKnowledgeResearchIntent,"Why is the sky blue?"],
["hinglish knowledge",isKnowledgeResearchIntent,"Mujhe samjha petrol mein kya hota hai"],
["current",isWebResearchIntent,"Aaj ka latest gold price kya hai?"],
["indirect current weather",isWebResearchIntent,"Bhai is bar garmi bahut padne wali hai kya scene hai or pani bhi bahut kam pada"],
["medical",isMedicalChatIntent,"Mujhe sardi aur khansi ho rahi hai kya karun?"],
["coding",isLocalCodingIntent,"Is Python code mein bug hai, fix karke samjhao"],
["technical explainer",isKnowledgeResearchIntent,"Bhai phone mein AI local model chalane ka simple scene samjha"],
["image",t=>detectMediaIntent(t).type==="image","Ek cinematic 3D image banao"],
["video",t=>detectMediaIntent(t).type==="video","Is scene ka short video bana do"]
];

test("broad routing corpus stays separated",()=>{
 for(const [name,fn,text] of cases) assert.equal(fn(text),true,name+": "+text);
});

test("unknown non-work requests do not default to coding",()=>{
 for(const text of ["Mujhe ek simple idea chahiye","Tu mujhe ye concept easy language mein samjha","Kal se routine kaise better karun"]){
  assert.equal(isGeneralChatIntent(text),true,text);
  assert.notEqual(selectSkillForTask(text),"coding",text);
 }
});

test("default skill is general",()=>{
 assert.equal(selectSkillForTask("random baat"),"general");
 assert.deepEqual(selectSkillsForTask("random baat"),["general"]);
});

test("current-context weather requests select web research skill",()=>{
 const text="Bhai is bar garmi bahut padne wali hai kya scene hai or pani bhi bahut kam pada";
 assert.equal(selectSkillForTask(text),"web-research");
 assert.equal(selectSkillsForTask(text)[0],"web-research");
});

test("video requests select video skill",()=>{
 assert.equal(selectSkillForTask("Is image ka short video bana do"),"video");
 assert.deepEqual(selectSkillsForTask("Is image ka short video bana do"),["video"]);
});

test("generic chat does not hard-wire Core-first route",()=>{
 const source=fs.readFileSync(new URL("../api/agent.js",import.meta.url),"utf8");
 assert.doesNotMatch(source,/preferred:"core",role:"chat",fallback:true/);
 assert.match(source,/role:codingMode\?"coding":"chat-general"/);
 assert.doesNotMatch(source,/preferred:"core",\s*\n\s*role:"coding"/);
});

test("agent applies canonical deterministic math/time before provider routing",()=>{
 const source=fs.readFileSync(new URL("../api/agent.js",import.meta.url),"utf8");
 assert.match(source,/const deterministicMath=solveSimpleMath\(latestUserMessage\)/);
 assert.match(source,/const deterministicTime=solveSimpleTime\(latestUserMessage\)/);
});

test("direct knowledge/general lanes never fall back to weak local Core",()=>{
 const source=fs.readFileSync(new URL("../api/agent.js",import.meta.url),"utf8");
 assert.match(source,/const directAnswerLane=!agentNeedsTools && \["general","knowledge","coding"\]\.includes\(canonicalRequest\.lane\)/);
 assert.match(source,/exclude:directAnswerLane\?\["core"\]:\[\]/);
});

test("agent prioritizes canonical conversation/coding gates before current research",()=>{
 const source=fs.readFileSync(new URL("../api/agent.js",import.meta.url),"utf8");
 const conversation=source.indexOf("const deterministicConversationReply=getCasualReply(latestText)");
 const coding=source.indexOf('const localCodingRequest=canonicalRequest.lane==="coding";');
 const current=source.indexOf('const currentResearchRequest=canonicalRequest.lane==="current";');
 assert.ok(conversation>=0);
 assert.ok(coding>=0);
 assert.ok(current>=0);
 assert.ok(coding<current);
});

test("ordinary agent chat does not force Gemini tool mode",()=>{
 const source=fs.readFileSync(new URL("../api/agent.js",import.meta.url),"utf8");
 assert.match(source,/const agentNeedsTools=explicitExecutionCue/);
 assert.match(source,/if\(useTools&&agentNeedsTools&&key\)/);
 assert.match(source,/const directAnswerLane=!agentNeedsTools && \["general","knowledge","coding"\]\.includes\(canonicalRequest\.lane\)/);
});

test("provider boundary has a malformed-output recovery gate",()=>{
 const source=fs.readFileSync(new URL("../api/aiRouter.js",import.meta.url),"utf8");
 assert.match(source,/isObviouslyGarbledResponse\(result\?\.text,task\)/);
});


test("stable knowledge questions do not enter the web-research gate",()=>{
 const source=fs.readFileSync(new URL("../api/agent.js",import.meta.url),"utf8");
 assert.ok(source.includes('const canonicalRequest=classifyUserRequest(task);'));
 assert.ok(source.includes('if(canonicalRequest.lane==="current"){'));
 assert.doesNotMatch(source,/isWebResearchIntent\(task\)\|\|isKnowledgeResearchIntent\(task\)/);
 assert.doesNotMatch(source,/import[^;]*isKnowledgeResearchIntent/);
});test("default AI route keeps BHAI-CORE as last-resort for unclassified chat",()=>{
 const source=fs.readFileSync(new URL("../api/aiRouter.js",import.meta.url),"utf8");
 assert.match(source,/\["gemini", "openai", "pollinations", "huggingface", "anthropic", "core"\]/);
});


test("standalone coding uses strong providers before weak local Core",()=>{
 const source=fs.readFileSync(new URL("../api/aiRouter.js",import.meta.url),"utf8");
 assert.match(source,/\/code\|debug\/.test\(lower\)\s*\n\s*\? \["gemini", "openai", "pollinations", "huggingface", "anthropic", "core"\]/);
});


test("known fragment outputs are always blocked on substantive questions",()=>{
 const samples=[
  ["from","Bhai ek chhota sa jawab do: India ki capital kya hai?"],
  ["pathlib","Ek sentence me batao: Baarish ke baad mitti ki khushboo ko kya kehte hain?"],
  ["b","Mujhe sardi ho rahi hai kya karun?"],
  ["actly","Bhai is bar garmi bahut padne wali hai kya scene hai?"],
  ["uge","Bhai aise hi test kar raha tha tu kya reply deta hai?"],
  ["sohn","Petrol (गैसोलीन) में असल में क्या-क्या होता है?"],
  ["labor","Agar main subah 8 baje ghar se niklu aur 3 ghante travel karu to kitne baje pahuchunga?"]
 ];
 for(const [answer,prompt] of samples){
  assert.equal(isObviouslyGarbledResponse(answer,prompt),true,prompt+" -> "+answer);
 }
});

test("chat lane uses canonical classifier rather than stable-knowledge web forcing",()=>{
 const source=fs.readFileSync(new URL("../api/agent.js",import.meta.url),"utf8");
 assert.ok(source.includes('const canonicalRequest=classifyUserRequest(task);'));
 assert.ok(source.includes('if(canonicalRequest.lane==="current"){'));
 assert.doesNotMatch(source,/isWebResearchIntent\(task\)\|\|isKnowledgeResearchIntent/);
});test("work-agent tools stay off for plain answer lanes",()=>{
 const source=fs.readFileSync(new URL("../api/agent.js",import.meta.url),"utf8");
 assert.match(source,/const directAnswerLane=!agentNeedsTools && \[\"general\",\"knowledge\",\"coding\"\]\.includes\(canonicalRequest\.lane\)/);
 assert.match(source,/const agentNeedsTools=explicitExecutionCue/);
});