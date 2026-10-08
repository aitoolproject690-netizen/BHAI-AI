/**
 * BHAI X Story + Script Engine
 * Contract shared by future character, image, video, voice and editing modules.
 */
export const STORY_SCHEMA_VERSION="1.0";

const clean=(v,n=4000)=>String(v??"").trim().slice(0,n);
const clamp=(v,min,max,fb)=>{const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):fb;};
const validId=v=>/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(String(v||""));

export function normalizeStoryRequest(input={}){
  return {
    prompt:clean(input.prompt,12000),
    language:clean(input.language||"Hindi",40)||"Hindi",
    durationSeconds:clamp(input.durationSeconds??input.duration??300,15,1800,300),
    genre:clean(input.genre||"suspense",80)||"suspense",
    tone:clean(input.tone||"cinematic, emotional, family-friendly",160)||"cinematic, emotional, family-friendly",
    visualStyle:clean(input.visualStyle||"3D anime cinematic cartoon",160)||"3D anime cinematic cartoon",
    audience:clean(input.audience||"YouTube family audience",120)||"YouTube family audience"
  };
}

export function buildStoryPrompt(input={}){
  const r=normalizeStoryRequest(input);
  const shape={
    schemaVersion:STORY_SCHEMA_VERSION,title:"string",logline:"string",genre:r.genre,language:r.language,
    durationSeconds:r.durationSeconds,tone:r.tone,visualStyle:r.visualStyle,audience:r.audience,
    characters:[{id:"character-1",name:"string",role:"protagonist|supporting|antagonist|narrator|other",age:13,
      description:"string",appearance:"stable visual identity",personality:"string",voiceHints:"voice age and speaking style"}],
    locations:[{id:"location-1",name:"string",description:"string",visualPrompt:"production-ready visual prompt"}],
    scenes:[{id:"scene-1",number:1,title:"string",durationSeconds:10,locationId:"location-1",
      timeOfDay:"night",characterIds:["character-1"],action:"on-screen action",
      dialogue:[{characterId:"character-1",text:"spoken dialogue"}],narration:"optional narration",
      visualPrompt:"shot prompt preserving character/location identity",cameraPrompt:"camera framing and movement",
      vfxPrompt:"effects or empty",musicPrompt:"music direction",sfxPrompt:"sound effects",
      continuityNotes:"facts that must remain consistent"}],
    youtube:{hook:"opening hook",thumbnailPrompt:"thumbnail prompt",titleIdeas:["title 1"],description:"YouTube description"}
  };
  return [
    "You are BHAI X Story + Script Engine for a YouTube cartoon production pipeline.",
    "Create an original, family-safe, production-ready story from the user's idea.",
    "Return ONLY valid JSON. No markdown fences. No commentary outside JSON.","",
    "USER IDEA:",r.prompt,"",
    "TARGET: language="+r.language+"; durationSeconds="+r.durationSeconds+"; genre="+r.genre+
      "; tone="+r.tone+"; visualStyle="+r.visualStyle+"; audience="+r.audience,"",
    "REQUIRED JSON SHAPE:",JSON.stringify(shape,null,2),"",
    "RULES:",
    "1. Complete hook-to-ending story; no unfinished ending.",
    "2. Reuse stable character IDs; one character must never get multiple IDs.",
    "3. Every scene must have actionable visualPrompt and concrete continuityNotes.",
    "4. Dialogue goes in dialogue[] and narration in narration.",
    "5. Scene durations should approximately match the target duration.",
    "6. Scene 1 must have a strong YouTube hook.",
    "7. Keep content original; do not copy an existing story."
  ].join("\n");
}

function extractJson(text=""){
  const raw=clean(text,80000).replace(/^\s*\uFEFF/,"");
  try{return JSON.parse(raw)}catch{}
  const m=raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if(m)try{return JSON.parse(m[1])}catch{}
  const a=raw.indexOf("{"),b=raw.lastIndexOf("}");
  if(a>=0&&b>a)try{return JSON.parse(raw.slice(a,b+1))}catch{}
  return null;
}

export function normalizeStoryPlan(plan,fallback={}){
  if(!plan||typeof plan!=="object"||Array.isArray(plan))return null;
  const r=normalizeStoryRequest(fallback);
  const chars=Array.isArray(plan.characters)?plan.characters.slice(0,32).map((c,i)=>({
    id:validId(c?.id)?String(c.id):"character-"+(i+1),name:clean(c?.name||"Character "+(i+1),120),
    role:clean(c?.role||"other",40),age:Number.isFinite(Number(c?.age))?clamp(c.age,0,120,0):null,
    description:clean(c?.description,1000),appearance:clean(c?.appearance,1600),
    personality:clean(c?.personality,800),voiceHints:clean(c?.voiceHints,800)
  })):[];
  const locs=Array.isArray(plan.locations)?plan.locations.slice(0,32).map((l,i)=>({
    id:validId(l?.id)?String(l.id):"location-"+(i+1),name:clean(l?.name||"Location "+(i+1),120),
    description:clean(l?.description,1000),visualPrompt:clean(l?.visualPrompt,1800)
  })):[];
  const charIds=new Set(chars.map(x=>x.id)),locIds=new Set(locs.map(x=>x.id));
  const scenes=Array.isArray(plan.scenes)?plan.scenes.slice(0,48).map((s,i)=>{
    const ids=Array.isArray(s?.characterIds)?[...new Set(s.characterIds.map(String).filter(x=>charIds.has(x)))].slice(0,12):[];
    const loc=locIds.has(String(s?.locationId||""))?String(s.locationId):(locs[0]?.id||null);
    const dialogue=Array.isArray(s?.dialogue)?s.dialogue.slice(0,40).map(d=>({
      characterId:charIds.has(String(d?.characterId||""))?String(d.characterId):(ids[0]||chars[0]?.id||null),text:clean(d?.text,1200)
    })).filter(d=>d.characterId&&d.text):[];
    return {id:validId(s?.id)?String(s.id):"scene-"+(i+1),number:i+1,title:clean(s?.title||"Scene "+(i+1),160),
      durationSeconds:clamp(s?.durationSeconds,1,120,8),locationId:loc,timeOfDay:clean(s?.timeOfDay,80),characterIds:ids,
      action:clean(s?.action,1800),dialogue,narration:clean(s?.narration,1200),visualPrompt:clean(s?.visualPrompt,2400),
      cameraPrompt:clean(s?.cameraPrompt,800),vfxPrompt:clean(s?.vfxPrompt,800),musicPrompt:clean(s?.musicPrompt,800),
      sfxPrompt:clean(s?.sfxPrompt,800),continuityNotes:clean(s?.continuityNotes,1000)};
  }):[];
  return {schemaVersion:STORY_SCHEMA_VERSION,title:clean(plan.title||"Untitled BHAI X Story",180),logline:clean(plan.logline,1000),
    genre:clean(plan.genre||r.genre,120),language:clean(plan.language||r.language,40),durationSeconds:r.durationSeconds,
    actualDurationSeconds:scenes.reduce((n,s)=>n+s.durationSeconds,0),tone:clean(plan.tone||r.tone,180),visualStyle:clean(plan.visualStyle||r.visualStyle,180),
    audience:clean(plan.audience||r.audience,140),characters:chars,locations:locs,scenes,
    youtube:{hook:clean(plan.youtube?.hook,600),thumbnailPrompt:clean(plan.youtube?.thumbnailPrompt,1400),
      titleIdeas:Array.isArray(plan.youtube?.titleIdeas)?plan.youtube.titleIdeas.map(x=>clean(x,160)).filter(Boolean).slice(0,8):[],
      description:clean(plan.youtube?.description,3000)}};
}

export function parseAndValidateStoryPlan(text,request={}){
  const plan=normalizeStoryPlan(extractJson(text),request),errors=[];
  if(!plan)errors.push("invalid_json");
  else{
    if(!plan.title)errors.push("missing_title");
    if(!plan.scenes.length)errors.push("missing_scenes");
    if(plan.scenes.some(s=>!s.action&&!s.dialogue.length&&!s.narration))errors.push("scene_without_content");
    if(plan.scenes.some(s=>!s.visualPrompt))errors.push("scene_without_visual_prompt");
  }
  return {ok:errors.length===0,plan,errors};
}

export function buildStoryMarkdown(p){
  const a=["## 🎬 "+p.title,"","**Genre:** "+p.genre+"  ","**Language:** "+p.language+"  ","**Target duration:** "+p.durationSeconds+" sec  ",
    "**Planned scene duration:** "+p.actualDurationSeconds+" sec","","### 🧠 Logline",p.logline||"—","","### 🎭 Characters"];
  for(const c of p.characters){a.push("- **"+c.name+"** (`"+c.id+"`) — "+c.role+(c.appearance?": "+c.appearance:""));if(c.voiceHints)a.push("  - Voice: "+c.voiceHints);}
  a.push("","### 📍 Locations");for(const l of p.locations)a.push("- **"+l.name+"** (`"+l.id+"`) — "+(l.description||"—"));
  a.push("","### 🎞️ Scene Script");
  for(const s of p.scenes){a.push("","#### Scene "+s.number+" — "+s.title,"**Duration:** "+s.durationSeconds+" sec  ","**Location:** `"+(s.locationId||"none")+"`");
    if(s.action)a.push("**Action:** "+s.action);if(s.narration)a.push("**Narration:** "+s.narration);
    if(s.dialogue.length){a.push("**Dialogue:**");for(const d of s.dialogue)a.push("- `"+d.characterId+"`: "+d.text);}
    if(s.visualPrompt)a.push("**Visual:** "+s.visualPrompt);if(s.cameraPrompt)a.push("**Camera:** "+s.cameraPrompt);
    if(s.vfxPrompt)a.push("**VFX:** "+s.vfxPrompt);if(s.musicPrompt)a.push("**Music:** "+s.musicPrompt);if(s.sfxPrompt)a.push("**SFX:** "+s.sfxPrompt);
    if(s.continuityNotes)a.push("**Continuity:** "+s.continuityNotes);
  }
  a.push("","### 📺 YouTube");if(p.youtube.hook)a.push("**Hook:** "+p.youtube.hook);
  if(p.youtube.titleIdeas.length){a.push("**Title ideas:**");for(const t of p.youtube.titleIdeas)a.push("- "+t);}
  if(p.youtube.thumbnailPrompt)a.push("**Thumbnail prompt:** "+p.youtube.thumbnailPrompt);if(p.youtube.description)a.push("**Description:** "+p.youtube.description);
  return a.join("\n");
}
