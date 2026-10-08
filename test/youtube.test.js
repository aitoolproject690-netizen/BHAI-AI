import test from "node:test";
import assert from "node:assert/strict";
import {normalizeYouTubeUploadRequest,youtubeConfigured} from "../api/youtube.js";

test("YouTube upload metadata is normalized safely",()=>{
 const x=normalizeYouTubeUploadRequest({data:"AAA",mimeType:"video/mp4",title:"<>Episode<>",description:"x",tags:["one","","two"],privacy:"unlisted"});
 assert.equal(x.videoData,"AAA");
 assert.equal(x.mimeType,"video/mp4");
 assert.equal(x.title,"Episode");
 assert.equal(x.privacy,"unlisted");
 assert.deepEqual(x.tags,["one","two"]);
});
test("YouTube config is fail-closed without credentials",()=>{
 const before={id:process.env.YOUTUBE_CLIENT_ID,secret:process.env.YOUTUBE_CLIENT_SECRET,url:process.env.YOUTUBE_OAUTH_REDIRECT_URI};
 delete process.env.YOUTUBE_CLIENT_ID;delete process.env.YOUTUBE_CLIENT_SECRET;delete process.env.YOUTUBE_OAUTH_REDIRECT_URI;
 assert.equal(youtubeConfigured(),false);
 if(before.id!==undefined)process.env.YOUTUBE_CLIENT_ID=before.id;
 if(before.secret!==undefined)process.env.YOUTUBE_CLIENT_SECRET=before.secret;
 if(before.url!==undefined)process.env.YOUTUBE_OAUTH_REDIRECT_URI=before.url;
});
