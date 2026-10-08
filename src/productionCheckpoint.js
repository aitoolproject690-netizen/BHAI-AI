export const PRODUCTION_CHECKPOINT_SCHEMA_VERSION="2.1";

const clean=(v,n=160)=>String(v??"").trim().slice(0,n);

export function productionStepDone(checkpoint,stepId){
  return Boolean((checkpoint?.completedStepIds||[]).map(String).includes(String(stepId)));
}

export function buildProductionCheckpoint({
  plan,
  request,
  story,
  characters=[],
  sceneStates=[],
  evidence={},
  completedStepIds=[],
  currentStep=null,
  renderProof=null,
  youtube=null,
  activity=[]
}={}) {
  return {
    schemaVersion:PRODUCTION_CHECKPOINT_SCHEMA_VERSION,
    pipelineId:clean(plan?.pipelineId||"",180),
    plan:plan||null,
    request:request||null,
    currentStep:currentStep?clean(currentStep,120):null,
    completedStepIds:[...new Set((Array.isArray(completedStepIds)?completedStepIds:[]).map(String))],
    evidence:{
      story:Boolean(evidence?.story),
      characters:Boolean(evidence?.characters),
      visuals:Boolean(evidence?.visuals),
      videos:Boolean(evidence?.videos),
      post:Boolean(evidence?.post),
      render:Boolean(evidence?.render),
      youtube:Boolean(evidence?.youtube)
    },
    story:story||null,
    characters:(Array.isArray(characters)?characters:[]).map(c=>({
      character_id:String(c?.character_id||""),
      name:String(c?.name||""),
      identity_version:Number(c?.identity_version||1),
      identity_fingerprint:String(c?.identity_fingerprint||""),
      canonical_prompt:String(c?.canonical_prompt||""),
      identity_json:c?.identity_json||null,
      sourceId:c?.sourceId||null
    })).filter(c=>c.character_id),
    sceneStates:(Array.isArray(sceneStates)?sceneStates:[]).map(s=>({
      sceneId:String(s?.sceneId||""),
      index:Number.isFinite(Number(s?.index))?Number(s.index):0,
      visualAssetId:s?.visualAssetId||null,
      videoAssetId:s?.videoAssetId||null,
      postProduction:s?.postProduction||null,
      durationSeconds:Number(s?.durationSeconds||0),
      verified:Boolean(s?.verified),
      visualVerified:Boolean(s?.visualVerified),
      videoVerified:Boolean(s?.videoVerified),
      postVerified:Boolean(s?.postVerified)
    })).filter(s=>s.sceneId),
    renderProof:renderProof||null,
    youtube:youtube&&typeof youtube==="object"?{
      verified:Boolean(youtube.verified),
      url:youtube.url||null,
      videoId:youtube.videoId||null,
      title:youtube.title||null
    }:null,
    activity:(Array.isArray(activity)?activity:[]).slice(-40).map(x=>({
      tool:clean(x?.tool||"production",100),
      state:clean(x?.state||"done",40),
      details:clean(x?.details||x?.text||"",500)
    })),
    updatedAt:new Date().toISOString()
  };
}

export function nextProductionResumeStep(checkpoint){
  const ids=["story","characters","camera","visuals","videos","post","audio","render","youtubePackage","shorts","youtube"];
  const done=new Set((checkpoint?.completedStepIds||[]).map(String));
  return ids.find(id=>!done.has(id)&&checkpoint?.plan?.steps?.find(s=>s.id===id)?.required!==false)||null;
}

export function productionCheckpointSummary(checkpoint){
  return {
    pipelineId:checkpoint?.pipelineId||null,
    currentStep:checkpoint?.currentStep||null,
    completedStepIds:Array.isArray(checkpoint?.completedStepIds)?checkpoint.completedStepIds:[],
    resumeFrom:nextProductionResumeStep(checkpoint),
    sceneStates:Array.isArray(checkpoint?.sceneStates)?checkpoint.sceneStates.length:0
  };
}
