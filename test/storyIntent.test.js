import test from "node:test";
import assert from "node:assert/strict";
import {isStoryScriptIntent} from "../src/intentRouter.js";
import {classifyUserRequest} from "../src/requestRouter.js";

test("story creation requests enter the story lane",()=>{
  assert.equal(isStoryScriptIntent("Aarav aur Meera ki 5 minute Hindi cartoon story banao"),true);
  assert.equal(classifyUserRequest("Aarav aur Meera ki 5 minute Hindi cartoon story banao").lane,"story");
});
test("ordinary questions and media requests do not enter story lane",()=>{
  assert.equal(isStoryScriptIntent("story kya hoti hai"),false);
  assert.equal(isStoryScriptIntent("Aarav ki image banao"),false);
});
