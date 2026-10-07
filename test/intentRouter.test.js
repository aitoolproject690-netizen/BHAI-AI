import test from "node:test";
import assert from "node:assert/strict";
import {normalizeIntent,isCasualIntent,getCasualReply,detectMediaIntent,isMediaToolAllowed,isLocalCodingIntent,isWebResearchIntent,isKnowledgeResearchIntent,isMedicalChatIntent} from "../src/intentRouter.js";

test("normalizes bhai prefix and suffix",()=>{
 assert.equal(normalizeIntent("Bhai kya haal hai?"),"kya haal hai");
 assert.equal(normalizeIntent("kya haal bhai!"),"kya haal");
});

test("casual chat catches common Hinglish forms",()=>{
 for(const text of ["Bhai kya haal hai?","bhai kya haal?","kya kar rahe ho bhai","Hello bhai"]){
  assert.equal(isCasualIntent(text),true,text);
 }
});



test("abusive casual input gets a calm deterministic reply",()=>{
 const text="Chutiye";
 assert.equal(isCasualIntent(text),true);
 assert.match(getCasualReply(text),/gaali.*baad mein/i);
});

test("casual chat catches natural meal questions and returns a deterministic reply",()=>{
 const text="Bhai khana khaya tune? Aaj kya khaya?";
 assert.equal(isCasualIntent(text),true);
 assert.match(getCasualReply(text),/main AI hoon.*khana nahi kha sakta/i);
});

test("detects common Hinglish health questions before AI routing",()=>{
 assert.equal(isMedicalChatIntent("Mujhe sardi ho gai hai naak se pani nikal raha hai"),true);
 assert.equal(isMedicalChatIntent("2+2 kitna hota hai"),false);
});

test("detects fresh web/current-information requests",()=>{
 assert.equal(isWebResearchIntent("What is the latest news today?"),true);
 assert.equal(isWebResearchIntent("Aaj ka gold price kya hai?"),true);
 assert.equal(isWebResearchIntent("Search online for the official docs"),true);
 assert.equal(isWebResearchIntent("What is 2+2?"),false);
});

test("media intent distinguishes image and video",()=>{
 assert.deepEqual(detectMediaIntent("Bhai ek image banao"),{type:"image",imageToVideo:false});
 assert.deepEqual(detectMediaIntent("Bhai ek video banao"),{type:"video",imageToVideo:false});
 assert.deepEqual(detectMediaIntent("Is image ko video bana do"),{type:"video",imageToVideo:true});
});


test("media tools are blocked for non-media coding requests",()=>{
 const coding="Bhai is Python code me bug hai, fix karke working code do: def divide(a, b): return a / b — zero se divide hone par error nahi aana chahiye.";
 assert.deepEqual(detectMediaIntent(coding),{type:null,imageToVideo:false});
 assert.equal(isMediaToolAllowed("generate_video",coding),false);
 assert.equal(isMediaToolAllowed("generate_image",coding),false);
});

test("media tool gate allows only the detected media type",()=>{
 assert.equal(isMediaToolAllowed("generate_image","Bhai ek image banao"),true);
 assert.equal(isMediaToolAllowed("generate_video","Bhai ek video banao"),true);
 assert.equal(isMediaToolAllowed("generate_image","Bhai ek video banao"),false);
 assert.equal(isMediaToolAllowed("generate_video","Bhai ek image banao"),false);
});


test("local coding intent is isolated from engineering execution",()=>{
 const text="Bhai is Python code me bug hai, fix karke working code do: def divide(a, b): return a / b — zero se divide hone par error nahi aana chahiye.";
 assert.equal(isLocalCodingIntent(text),true);
 assert.equal(isLocalCodingIntent("Bhai GitHub repository me ye Python bug fix karo"),false);
});


test("routes technical factual questions to evidence-backed research",()=>{
 assert.equal(isKnowledgeResearchIntent("Petrol mein kya hota hai?"),true);
 assert.equal(isKnowledgeResearchIntent("How does a car battery work?"),true);
 assert.equal(isKnowledgeResearchIntent("What is machine learning?"),true);
 assert.equal(isKnowledgeResearchIntent("Hello bhai"),false);
 assert.equal(isKnowledgeResearchIntent("2+2 kitna hota hai?"),false);
});
