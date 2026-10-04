import test from "node:test";
import assert from "node:assert/strict";
import {normalizeIntent,isCasualIntent,detectMediaIntent} from "../src/intentRouter.js";

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
