/** BHAI X Engineering Core: deterministic safety helpers. */
const SAFE_PATH = /^[A-Za-z0-9._~!$&'()*+,;=:@%\\/~-]+$/;
const REPO_PART='[A-Za-z0-9][A-Za-z0-9._-]{0,99}';
const NON_REPO_PAIRS=new Set(["logs/steps","steps/logs","logs/jobs","jobs/logs","logs/errors","errors/logs"]);

export function normalizeRepoName(value=''){ return String(value).trim().replace(/^\\/+|\\/+$/g,''); }
export function normalizeFilePath(value=''){
 let p=String(value||'').trim().replace(/^[\\s"\\x27]+|[\\s"\\x27]+$/g,'');
 p=p.split(/[?#]/,1)[0].replace(/^\\/+|\\/+$/g,'').replace(/\\\\+/g,'/');
 p=p.split('/').filter(Boolean).join('/');
 if(!p||p==='.'||p==='..') return '';
 if(p.split('/').some(part=>part==='..'||part==='.' )) throw new Error('Unsafe repository path.');
 if(!SAFE_PATH.test(p)) throw new Error('Invalid repository path.');
 return p;
}

function isLikelyRepoPair(owner='',repo=''){
 const key=(String(owner).trim()+'/'+String(repo).trim()).toLowerCase();
 return !!owner&&!!repo&&!NON_REPO_PAIRS.has(key);
}

function extractRepoPathFromGithubWebPath(rawPath=''){
 const clean=String(rawPath||'').split(/[?#]/,1)[0].replace(/^\\/+|\\/+$/g,'');
 if(!clean) return '';
 const parts=clean.split('/').filter(Boolean);
 if(!parts.length) return '';
 if(/^(blob|tree)$/i.test(parts[0])){
  if(parts.length<3) return '';
  return normalizeFilePath(parts.slice(2).join('/'));
 }
 if(/^(actions|issues|pulls|commit|commits|releases|settings)$/i.test(parts[0])) return '';
 return normalizeFilePath(parts.join('/'));
}

export function extractGithubRepoReference(text=''){
 const input=String(text||'').trim();
 const make=(m)=>m&&isLikelyRepoPair(m[1],m[2])?{owner:m[1],repo:m[2]}:null;
 let m=input.match(new RegExp('(?:https?:\\/\\/)?(?:www\\.)?github\\.com\\/('+REPO_PART+')\\/('+REPO_PART+')(?:[\\/\\s?#]|$)','i'));
 if(m) return make(m);
 m=input.match(new RegExp('(?:github\\s+(?:repository|repo)|repository|repo)\\s*(?:name\\s*)?(?:[:=#-]\\s*)?[`\\"]?('+REPO_PART+')\\/('+REPO_PART+')(?:[`\\"]|\\b)','i'));
 if(m) return make(m);
 m=input.match(new RegExp('github\\s+(?:par|pe)\\s*[`\\"]?('+REPO_PART+')\\/('+REPO_PART+')(?:[`\\"]|\\s+(?:repo|repository)\\b|[.,;!?]|$)','i'));
 if(m) return make(m);
 m=input.match(new RegExp('[`\\"]('+REPO_PART+')\\/('+REPO_PART+')[`\\"]','i'));
 if(m && /(?:github|repo(?:sitory)?)/i.test(input)) return make(m);
 m=input.match(new RegExp('(?:^|[\\s`\\"] )('+REPO_PART+')\\/('+REPO_PART+')\\/([^\\s`\\"<>?#]+)','i'));
 if(m && /\\.(?:html?|css|js|jsx|ts|tsx|json|md|yml|yaml)$/i.test(m[3]) && isLikelyRepoPair(m[1],m[2])) return {owner:m[1],repo:m[2]};
 m=input.match(new RegExp('(?:^|[\\s`\\"] )('+REPO_PART+')\\/('+REPO_PART+')(?:\\s+)(?:repo|repository)\\b','i'));
 if(m) return make(m);
 return null;
}

export function resolveGithubTarget(text=''){
 const input=String(text||'').trim();
 const githubUrl=input.match(new RegExp('https?:\\/\\/github\\.com\\/('+REPO_PART+')\\/('+REPO_PART+')(?:\\/([^\\s\\x60"\\x27<>?#]+))?','i'));
 const contextual=input.match(new RegExp('\\b(?:github(?:\\s+par)?(?:\\s+(?:repo|repository))?|(?:my\\s+)?(?:repo|repository))\\s*[:=-]?\\s*('+REPO_PART+')\\/('+REPO_PART+')(?:\\/([^\\s\\x60"\\x27<>?#]+))?','i'));
 const actionTarget=input.match(new RegExp('\\b(?:fix|update|check|inspect|open|read|edit|modify|repair|work\\s+on|use)\\s+(?:the\\s+)?('+REPO_PART+')\\/('+REPO_PART+')(?:\\/([^\\s\\x60"\\x27<>?#]+))?','i'));
 let owner='',repo='',path='';
 if(githubUrl){ owner=githubUrl[1]; repo=githubUrl[2]; path=extractRepoPathFromGithubWebPath(githubUrl[3]||''); }
 else if(contextual){ owner=contextual[1]; repo=contextual[2]; path=contextual[3] ? normalizeFilePath(contextual[3]) : ''; }
 else if(actionTarget && isLikelyRepoPair(actionTarget[1],actionTarget[2])){ owner=actionTarget[1]; repo=actionTarget[2]; path=actionTarget[3] ? normalizeFilePath(actionTarget[3]) : ''; }
 const fileMatch=input.match(new RegExp('(?:^|[\\s\\x60"\\x27\\/])((?:[A-Za-z0-9._~-]+\\/)*[A-Za-z0-9._~-]+\\.(?:html?|css|js|jsx|ts|tsx|json|md|yml|yaml))(?=[\\s\\x60"\\x27<>?#]|$)','i'));
 if(!path&&fileMatch) path=normalizeFilePath(fileMatch[1]);
 if(repo&&path){ const marker=repo+'/'; const at=path.toLowerCase().indexOf(marker.toLowerCase()); if(at>=0) path=normalizeFilePath(path.slice(at+marker.length)); }
 return {owner:owner.trim(),repo:repo.trim(),path,raw:input};
}
export function classifyEngineeringError(error){
 const message=String(error?.message||error||'Unknown error');
 const status=Number(error?.status||String(message).match(/\b(4\d\d|5\d\d)\b/)?.[1]||0);
 if(status===401||/bad credentials|authentication|token/i.test(message)) return {type:'auth',retryable:false,message};
 if(status===403||/forbidden|rate.?limit|quota|secondary rate/i.test(message)) return {type:'permission_or_quota',retryable:false,message};
 if(status===404||/not found|does not exist/i.test(message)) return {type:'not_found',retryable:false,message};
 if(status===409||/conflict|sha/i.test(message)) return {type:'conflict',retryable:true,message};
 if(status>=500||/timeout|timed out|temporarily unavailable|network/i.test(message)) return {type:'transient',retryable:true,message};
 return {type:'unknown',retryable:false,message};
}
export function createRetryGuard(){ const attempted=new Set(); return { key(a,x={}){return a+':'+JSON.stringify(x);}, canTry(a,x={}){const k=this.key(a,x);if(attempted.has(k))return false;attempted.add(k);return true;}, size(){return attempted.size;} }; }
export function createEvidence(){
 const state={repository:null,branch:null,path:null,commit:null,tests:[],deployment:null,verified:false};
 return {state,set(p={}){Object.assign(state,p);},addTest(name,passed,details=''){state.tests.push({name,passed:!!passed,details});},verify(){const hasReadBack=state.tests.some(t=>/read.?back/i.test(String(t.name||""))&&t.passed);state.verified=!!(state.repository&&state.branch&&state.path&&state.commit&&hasReadBack&&state.tests.length&&state.tests.every(t=>t.passed));return state.verified;},snapshot(){return JSON.parse(JSON.stringify(state));}};
}


export function createRecoveryStateMachine(){
 const order=["diagnose","patch_and_verify","rollback_if_regression","retry","switch_provider_or_model","resume_checkpoint","alternate_execution","done","failed"];
 let state="diagnose";
 const history=[state];
 return {
  get state(){ return state; },
  history(){ return [...history]; },
  transition(next){
   if(!order.includes(next)) throw new Error("Unknown recovery state: "+next);
   const allowed={
    diagnose:["patch_and_verify","switch_provider_or_model","failed"],
    patch_and_verify:["done","rollback_if_regression","retry","switch_provider_or_model"],
    rollback_if_regression:["retry","switch_provider_or_model","failed"],
    retry:["patch_and_verify","switch_provider_or_model","failed"],
    switch_provider_or_model:["resume_checkpoint","failed"],
    resume_checkpoint:["alternate_execution","failed"],
    alternate_execution:["patch_and_verify","failed"],
    done:[],
    failed:[]
   };
   if(!allowed[state].includes(next)) throw new Error("Invalid recovery transition: "+state+" -> "+next);
   state=next; history.push(next); return state;
  },
  canClaimDone(evidence){ return state==="done" && !!evidence?.verified; }
 };
}


export function createDeploymentCheckpoint({commit="",service="",url="",status="unknown"}={}){
 return {commit:String(commit||""),service:String(service||""),url:String(url||""),status:String(status||"unknown"),createdAt:new Date().toISOString()};
}
export function verifyDeploymentCheckpoint(checkpoint,{expectedCommit="",expectedStatus="live"}={}){
 const commitOk=!expectedCommit||String(checkpoint?.commit||"")===String(expectedCommit);
 const statusOk=String(checkpoint?.status||"").toLowerCase()===String(expectedStatus).toLowerCase();
 const urlOk=!!String(checkpoint?.url||"");
 return {ok:!!(commitOk&&statusOk&&urlOk),commitOk,statusOk,urlOk};
}


export function createMissionController(){
 const phases=["preflight","plan","execute","verify","recover","complete","failed"];
 let phase="preflight";
 const history=[phase];
 const allowed={
  preflight:["plan","failed"],
  plan:["execute","failed"],
  execute:["verify","recover","failed"],
  verify:["complete","recover","failed"],
  recover:["execute","verify","failed"],
  complete:[],
  failed:[]
 };
 return {
  get phase(){ return phase; },
  history(){ return [...history]; },
  transition(next){
   if(!allowed[phase]?.includes(next)) throw new Error("Invalid mission transition: "+phase+" -> "+next);
   phase=next; history.push(next); return phase;
  },
  canClaimDone(evidence){
   return phase==="complete" && !!evidence?.verified;
  }
 };
}
