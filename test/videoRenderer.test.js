import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import {rendererSupports,renderTimeline,verifyRenderedVideo} from "../src/videoRenderer.js";

function runFfmpeg(args,cwd){
  return new Promise((resolve,reject)=>{
    const p=spawn(ffmpegPath,args,{cwd,stdio:["ignore","pipe","pipe"]});
    let err="";
    p.stderr.on("data",d=>err+=d.toString());
    p.on("error",reject);
    p.on("close",code=>code===0?resolve():reject(new Error(err)));
  });
}

test("real renderer exposes a self-hosted ffmpeg engine",()=>{
  const info=rendererSupports();
  assert.equal(info.ok,true);
  assert.equal(info.engine,"ffmpeg-static");
});

test("real renderer composes a verified MP4 and thumbnail",async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"bhai-x-render-test-"));
  try{
    const source=path.join(dir,"source.mp4");
    await runFfmpeg([
      "-y","-hide_banner","-loglevel","error",
      "-f","lavfi","-i","color=c=black:s=320x180:r=24",
      "-t","1","-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p",
      "-an",source
    ],dir);
    const data=(await fs.readFile(source)).toString("base64");
    const result=await renderTimeline({
      schemaVersion:"1.0",
      timelineId:"test_timeline",
      scenes:[{
        sceneId:"scene_1",
        videoAssetId:"test-video",
        durationSeconds:1,
        sourceVideo:{mimeType:"video/mp4",data},
        verified:true
      }],
      totalDurationSeconds:1,
      output:{format:"mp4",aspectRatio:"16:9",fps:24}
    },{title:"BHAI X test"});
    assert.equal(result.media.mimeType,"video/mp4");
    assert.equal(result.verification.ok,true);
    assert.match(result.media.data,/^[A-Za-z0-9+/]+={0,2}$/);
    assert.equal(result.thumbnail.mimeType,"image/jpeg");
    assert.ok(result.thumbnail.data.length>100);
    assert.equal(result.youtube.title,"BHAI X test");
    const direct=verifyRenderedVideo(result.media);
    assert.equal(direct.ok,true);
    assert.ok(result.media.duration>0);
  }finally{
    await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
});
