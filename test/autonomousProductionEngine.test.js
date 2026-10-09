import test from "node:test";
import assert from "node:assert/strict";
import {buildAutonomousPlan,isAutonomousProductionRequest,isYouTubePublishRequest,normalizeAutonomousRequest,productionCompletionProof} from "../src/autonomousProductionEngine.js";

test("autonomous production intent covers natural Hindi/Hinglish",()=>{
 assert.equal(isAutonomousProductionRequest("Aarav ki story se final video bana kar YouTube pe upload karo"),true);
 assert.equal(isAutonomousProductionRequest("poora episode bana do"),true);
 assert.equal(isYouTubePublishRequest("final video YouTube pe publish karo"),true);
});
test("autonomous plan requires proof before DONE",()=>{
 const p=buildAutonomousPlan({prompt:"A story bana kar YouTube pe upload karo"});
 const r=productionCompletionProof({plan:p,evidence:{story:true,characters:true,visuals:true,videos:true,post:true},finalVideo:{rendered:true,verified:true},youTube:null});
 assert.equal(r.ok,false);
 const r2=productionCompletionProof({plan:p,evidence:{story:true,characters:true,camera:true,visuals:true,videos:true,post:true,voice:true,lipSync:true,audio:true,render:true,youtubePackage:true,shorts:true},finalVideo:{rendered:true,verified:true},youTube:{verified:true,url:"https://www.youtube.com/watch?v=abc"}});
 assert.equal(r2.ok,true);
});
test("autonomous request normalizes a bounded render plan",()=>{
 const r=normalizeAutonomousRequest({prompt:"episode",duration:999999,aspectRatio:"9:16",privacy:"unlisted"});
 assert.equal(r.durationSeconds,1800);
 assert.equal(r.aspectRatio,"9:16");
 assert.equal(r.privacy,"unlisted");
});
\ntest("autonomous plan refuses DONE when generated voice or pixel lip-sync proof is missing",()=>{\n const p=buildAutonomousPlan({prompt:"A story bana kar YouTube pe upload karo"});\n const evidence={story:true,characters:true,camera:true,visuals:true,videos:true,post:true,voice:true,lipSync:false,audio:true,render:true,youtubePackage:true,shorts:true,youtube:false};\n const proof=productionCompletionProof({plan:p,evidence,finalVideo:{rendered:true,verified:true},youTube:null});\n assert.equal(proof.ok,false);\n assert.ok(proof.failures.includes("lipSync"));\n});\n