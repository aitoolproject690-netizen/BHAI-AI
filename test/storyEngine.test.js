import test from "node:test";
import assert from "node:assert/strict";
import {normalizeStoryRequest,buildStoryPrompt,parseAndValidateStoryPlan,buildStoryMarkdown,STORY_SCHEMA_VERSION} from "../src/storyEngine.js";

const sample={schemaVersion:STORY_SCHEMA_VERSION,title:"Aarav Aur Rahasya",logline:"Aarav finds a strange signal.",genre:"suspense",language:"Hindi",durationSeconds:60,tone:"cinematic",visualStyle:"3D anime cinematic",audience:"YouTube family audience",characters:[{id:"aarav",name:"Aarav",role:"protagonist",age:13,appearance:"Black hair, blue hoodie, consistent face.",voiceHints:"Young Indian boy, energetic"}],locations:[{id:"forest",name:"Abandoned Forest",description:"Foggy forest.",visualPrompt:"3D anime foggy forest at night."}],scenes:[{id:"scene-1",number:1,title:"The Signal",durationSeconds:10,locationId:"forest",timeOfDay:"night",characterIds:["aarav"],action:"Aarav notices a blue signal.",dialogue:[{characterId:"aarav",text:"Ye roshni yahan kaise?"}],narration:"",visualPrompt:"Aarav in the same blue hoodie in the foggy forest.",cameraPrompt:"Slow push-in.",vfxPrompt:"Blue glow.",musicPrompt:"Low suspense pulse.",sfxPrompt:"Distant wind.",continuityNotes:"Keep Aarav's face and blue hoodie unchanged."}],youtube:{hook:"A strange blue signal appears.",thumbnailPrompt:"Aarav sees the signal.",titleIdeas:["Aarav Aur Rahasya"],description:"Suspense cartoon."}};

test("normalization applies safe production limits",()=>{const r=normalizeStoryRequest({prompt:" test ",durationSeconds:99999});assert.equal(r.prompt,"test");assert.equal(r.durationSeconds,1800);assert.equal(r.language,"Hindi");});
test("prompt exposes downstream contract",()=>{const p=buildStoryPrompt({prompt:"Aarav aur Meera ki suspense story"});assert.match(p,/characterIds/);assert.match(p,/visualPrompt/);assert.match(p,/continuityNotes/);assert.match(p,/youtube/);});
test("valid plan parses and derives scene duration",()=>{const out=parseAndValidateStoryPlan(JSON.stringify(sample),sample);assert.equal(out.ok,true);assert.equal(out.plan.characters[0].id,"aarav");assert.equal(out.plan.actualDurationSeconds,10);});
test("invalid plan is blocked",()=>{const out=parseAndValidateStoryPlan(JSON.stringify({title:"Broken",scenes:[]}),{prompt:"x"});assert.equal(out.ok,false);assert.ok(out.errors.includes("missing_scenes"));});
test("markdown keeps production continuity",()=>{const out=parseAndValidateStoryPlan(JSON.stringify(sample),sample);const md=buildStoryMarkdown(out.plan);assert.match(md,/Aarav Aur Rahasya/);assert.match(md,/The Signal/);assert.match(md,/blue hoodie unchanged/);});
test("duplicate character IDs are blocked",()=>{
  const dup=JSON.parse(JSON.stringify(sample));
  dup.characters.push({...dup.characters[0],name:"Second Character"});
  const out=parseAndValidateStoryPlan(JSON.stringify(dup),sample);
  assert.equal(out.ok,false);
  assert.ok(out.errors.includes("duplicate_character_ids"));
});
