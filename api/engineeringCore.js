/** BHAI X Engineering Core: deterministic safety helpers. */
const SAFE_PATH = /^[A-Za-z0-9._~!$&'()*+,;=:@%\/-]+$/;
export function normalizeRepoName(value=''){ return String(value).trim().replace(/^\/+|\/+$/g,''); }
export function normalizeFilePath(value=''){
 let p=String(value||'').trim().replace(/^[\s"\x27]+|[\s"\x27]+$/g,'');
 p=p.replace(/^\/+|\/+$/g,'').replace(/\\+/g,'/');
 p=p.split('/').filter(Boolean).join('/');
 if(!p||p==='.'||p==='..') return '';
 if(p.split('/').some(part=>part==='..'||part==='.' )) throw new Error('Unsafe repository path.');
 if(!SAFE_PATH.test(p)) throw new Error('Invalid repository path.');
 return p;
}
export function resolveGithubTarget(text=''){
 const input=String(text||'').trim();
 const explicit=input.match(/(?:^|\s|\x60|https?:\/\/github\.com\/)([A-Za-z0-9][A-Za-z0-9._-]{0,99})\/([A-Za-z0-9][A-Za-z0-9._-]{0,99})(?:\/([^\s\x60"\x27<>]+))?/i);
 let owner=explicit?.[1]||'', repo=explicit?.[2]||'', path=explicit?.[3]||'';
 if(path) path=normalizeFilePath(path);
 const fileMatch=input.match(/(?:^|[\s\x60"\x27\/])((?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+\.(?:html?|css|js|jsx|ts|tsx|json|md|yml|yaml))/i);
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
 return {state,set(p={}){Object.assign(state,p);},addTest(name,passed,details=''){state.tests.push({name,passed:!!passed,details});},verify(){state.verified=!!(state.repository&&state.branch&&state.path&&state.commit&&state.tests.length&&state.tests.every(t=>t.passed));return state.verified;},snapshot(){return JSON.parse(JSON.stringify(state));}};
}
