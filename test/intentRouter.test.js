import test from "node:test";
import assert from "node:assert/strict";
import {normalizeIntent,isCasualIntent,detectMediaIntent,isMediaToolAllowed} from "../src/intentRouter.js";

test("normalizes bhai prefix and suffix",()=>{
 assert.equal(normalizeIntent("Bhai kya haal hai?"),"kya haal hai");
 assert.equal(normalizeIntent("kya haal bhai!"),"kya haal");
});

test("casual chat catches common Hinglish forms",()=>{
 for(const text of ["Bhai kya haal hai?","bhai kya haal?","kya kar rahe ho bhai","Hello bhai"]){
  assert.equal(isCasualIntent(text),true,text);
 }
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
