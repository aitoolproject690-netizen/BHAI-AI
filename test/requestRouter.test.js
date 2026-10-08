import test from "node:test";
import assert from "node:assert/strict";
import { classifyUserRequest } from "../src/requestRouter.js";

test("canonical classifier uses one stable precedence across major lanes",()=>{
  assert.equal(classifyUserRequest("2+2").lane,"math");
  assert.equal(classifyUserRequest("Bhai kya haal hai?").lane,"conversation");
  assert.equal(classifyUserRequest("Mujhe sardi ho rahi hai kya karun?").lane,"medical");
  assert.equal(classifyUserRequest("Is Python code me bug hai, fix karke samjhao").lane,"coding");
  assert.equal(classifyUserRequest("Aaj ka gold price kya hai?").lane,"current");
  assert.equal(classifyUserRequest("Petrol mein kya hota hai?").lane,"knowledge");
  assert.equal(classifyUserRequest("Bhai is bar garmi kaisi rehne wali hai?").lane,"current");
  assert.equal(classifyUserRequest("Bhai kya kar raha hai?").lane,"conversation");
  assert.equal(classifyUserRequest("Mujhe ek simple idea chahiye").lane,"general");
});

test("weather cold is not accidentally classified as medical",()=>{
  assert.equal(classifyUserRequest("Is winter me thand kitni padegi?").lane,"current");
  assert.equal(classifyUserRequest("Mujhe cold aur runny nose hai").lane,"medical");
});

test("stable knowledge is not marked as fresh web work",()=>{
  const result=classifyUserRequest("India ki capital kya hai?");
  assert.equal(result.lane,"knowledge");
  assert.equal(result.needsFreshWeb,false);
});

test("media stays dedicated to media lane",()=>{
  assert.equal(classifyUserRequest("Ek image banao").lane,"media");
  assert.equal(classifyUserRequest("Ek short video banao").lane,"media");
});
