import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {isCasualIntent,isGeneralChatIntent,isKnowledgeResearchIntent,isWebResearchIntent,isMedicalChatIntent,isLocalCodingIntent,detectMediaIntent} from "../src/intentRouter.js";
import {selectSkillForTask,selectSkillsForTask} from "../src/skillsRouter.js";

const cases=[
["conversation",isCasualIntent,"Bhai aise hi dekh raha tha tu kya reply deta hai"],
["general",isGeneralChatIntent,"Mujhe ek simple idea chahiye"],
["knowledge",isKnowledgeResearchIntent,"Why is the sky blue?"],
["hinglish knowledge",isKnowledgeResearchIntent,"Mujhe samjha petrol mein kya hota hai"],
["current",isWebResearchIntent,"Aaj ka latest gold price kya hai?"],
["medical",isMedicalChatIntent,"Mujhe sardi aur khansi ho rahi hai kya karun?"],
["coding",isLocalCodingIntent,"Is Python code mein bug hai, fix karke samjhao"],
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

test("generic chat does not hard-wire Core-first route",()=>{
 const source=fs.readFileSync(new URL("../api/agent.js",import.meta.url),"utf8");
 assert.doesNotMatch(source,/preferred:"core",role:"chat",fallback:true/);
 assert.match(source,/role:codingMode\?"coding":"chat-general"/);
});

test("provider boundary has a malformed-output recovery gate",()=>{
 const source=fs.readFileSync(new URL("../api/aiRouter.js",import.meta.url),"utf8");
 assert.match(source,/isObviouslyGarbledResponse\(result\?\.text,task\)/);
});
