import test from "node:test";
import assert from "node:assert/strict";
import {isCharacterCreationIntent} from "../src/intentRouter.js";
import {classifyUserRequest} from "../src/requestRouter.js";

test("character creation enters character lane",()=>{
  const text="Aarav naam ka 13 saal ka 3D anime cartoon character banao";
  assert.equal(isCharacterCreationIntent(text),true);
  assert.equal(classifyUserRequest(text).lane,"character");
});
test("story creation is not misclassified as character-only",()=>{
  assert.equal(isCharacterCreationIntent("Aarav aur Meera ki suspense story banao"),false);
});
test("image request stays media",()=>{
  assert.equal(isCharacterCreationIntent("Aarav ki image banao"),false);
});
