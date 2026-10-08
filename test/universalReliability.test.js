import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {isCasualIntent,isGeneralChatIntent,isKnowledgeResearchIntent,isWebResearchIntent,isCurrentContextIntent,isMedicalChatIntent,isLocalCodingIntent,detectMediaIntent} from "../src/intentRouter.js";
import {selectSkillForTask,selectSkillsForTask} from "../src/skillsRouter.js";

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
});

test("agent prioritizes deterministic conversation/coding gates before research",()=>{
 const source=fs.readFileSync(new URL("../api/agent.js",import.meta.url),"utf8");
 assert.match(source,/const deterministicConversationReply=getCasualReply\(latestText\)/);
 assert.match(source,/const localCodingRequest=isLocalCodingIntent\(latestText\)/);
 assert.ok(source.indexOf("const deterministicConversationReply=getCasualReply(latestText)") < source.indexOf("const currentResearchRequest=isWebResearchIntent(latestText)"));
});

test("ordinary agent chat does not force Gemini tool mode",()=>{
 const source=fs.readFileSync(new URL("../api/agent.js",import.meta.url),"utf8");
 assert.match(source,/const agentNeedsTools=latestRequestsProjectExecution \|\| latestHasExplicitGithub/);
 assert.match(source,/if\(useTools&&agentNeedsTools&&key\)/);
});

test("provider boundary has a malformed-output recovery gate",()=>{
 const source=fs.readFileSync(new URL("../api/aiRouter.js",import.meta.url),"utf8");
 assert.match(source,/isObviouslyGarbledResponse\(result\?\.text,task\)/);
});


test("stable knowledge questions do not enter the web-research gate",()=>{
 const source=fs.readFileSync(new URL("../api/agent.js",import.meta.url),"utf8");
 assert.match(source,/if\(isWebResearchIntent\(task\)\)/);
 assert.doesNotMatch(source,/isWebResearchIntent\(task\)\|\|isKnowledgeResearchIntent\(task\)/);
 assert.doesNotMatch(source,/import[^;]*isKnowledgeResearchIntent/);
});

test("default AI route keeps BHAI-CORE as last-resort for unclassified chat",()=>{
 const source=fs.readFileSync(new URL("../api/aiRouter.js",import.meta.url),"utf8");
 assert.match(source,/\["gemini", "openai", "huggingface", "anthropic", "core"\]/);
});


test("standalone coding uses strong providers before weak local Core",()=>{
 const source=fs.readFileSync(new URL("../api/aiRouter.js",import.meta.url),"utf8");
 assert.match(source,/\/code\|debug\/.test\(lower\)\s*\n\s*\? \["gemini", "openai", "huggingface", "anthropic", "core"\]/);
});
