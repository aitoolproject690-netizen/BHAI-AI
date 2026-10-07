import test from "node:test";
import assert from "node:assert/strict";
import {solveSimpleMath} from "../src/simpleMath.js";

test("solves simple arithmetic exactly",()=>{
  assert.equal(solveSimpleMath("2+2=?"),"4");
  assert.equal(solveSimpleMath("Bhai 12 * 3 = ?"),"36");
  assert.equal(solveSimpleMath("7 × 8 = ?"),"56");
  assert.equal(solveSimpleMath("48 ÷ 6 = ?"),"8");
  assert.equal(solveSimpleMath("what is (10-4)/2?"),"3");
  assert.equal(solveSimpleMath("2+2 kitna hota hai"),"4");
  assert.equal(solveSimpleMath("Chal ab ye bata 2+2 kitna hota hai"),"4");
  assert.equal(solveSimpleMath("Chutiye 2+2 ka matalab bhi nahi pata"),"4");
});

test("does not hijack normal text",()=>{
  assert.equal(solveSimpleMath("hello bhai"),null);
  assert.equal(solveSimpleMath("2 plus 2"),null);
});

test("handles division by zero safely",()=>{
  assert.equal(solveSimpleMath("10/0=?"),null);
});
