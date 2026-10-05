/**
 * BHAI X GitHub security/execution boundary.
 * GitHub credentials stay server-side; callers receive sanitized results/errors only.
 */
const API_ORIGIN="https://api.github.com";
const DEFAULT_TIMEOUT_MS=12000;
const NAME_RE=/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const REF_RE=/^[A-Za-z0-9._/-]{1,200}$/;
const PATH_RE=/^[A-Za-z0-9._~!$&'()*+,;=:@%\/-]+$/;
function makeError(message,status=0){const e=new Error(String(message));if(status)e.status=status;return e;}
function scrubSecret(value){const secret=String(process.env.GITHUB_TOKEN||"");const text=String(value||"");return secret?text.split(secret).join("[redacted]"):text;}
export function githubConfigured(){return Boolean(String(process.env.GITHUB_TOKEN||"").trim());}
export function assertGithubName(value,label="GitHub name"){const v=String(value||"").trim();if(!NAME_RE.test(v))throw makeError("Invalid "+label+".");return v;}
export function assertGithubRef(value="main"){const v=String(value||"").trim();if(!REF_RE.test(v)||v.includes("..")||v.includes("\\")||v.startsWith("/")||v.endsWith("/"))throw makeError("Invalid GitHub branch/ref.");return v;}
export function assertGithubPath(value="",{required=true,maxLength=1000}={}){let v=String(value||"").trim().replace(/^\/+|\/+$/g,"").replace(/\\+/g,"/");if(!v){if(required)throw makeError("GitHub file path is required.");return "";}if(v.length>maxLength||v.split("/").some(p=>p==="."||p==="..")||!PATH_RE.test(v))throw makeError("Invalid or unsafe GitHub file path.");return v;}
export function encodeGithubPath(value=""){const p=assertGithubPath(value,{required:false});return p.split("/").filter(Boolean).map(encodeURIComponent).join("/");}
export function githubRepoUrl(owner,repo,suffix=""){const o=assertGithubName(owner,"GitHub owner"),r=assertGithubName(repo,"GitHub repository"),tail=String(suffix||"");if(tail&&!tail.startsWith("/"))throw makeError("Invalid GitHub API path.");return API_ORIGIN+"/repos/"+encodeURIComponent(o)+"/"+encodeURIComponent(r)+tail;}
export async function githubApiFetch(input,{method="GET",headers={},body,timeoutMs=DEFAULT_TIMEOUT_MS,requestId=""}={}){
 if(!githubConfigured())throw makeError("GitHub access is not configured on the server.",503);
 let url;try{url=new URL(String(input),API_ORIGIN);}catch{throw makeError("Invalid GitHub API URL.");}
 if(url.origin!==API_ORIGIN)throw makeError("GitHub executor blocked a non-GitHub API target.");
 const token=String(process.env.GITHUB_TOKEN||"");
 const mergedHeaders={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"BHAI-X/1.0",...headers,Authorization:"Bearer "+token};
 if(requestId)mergedHeaders["X-BHAI-Request-ID"]=String(requestId);
 try{return await fetch(url.toString(),{method,headers:mergedHeaders,...(body===undefined?{}:{body}),signal:AbortSignal.timeout(Number(timeoutMs)||DEFAULT_TIMEOUT_MS)});}
 catch(error){throw makeError("GitHub network request failed: "+scrubSecret(error?.message||error),error?.status||0);}
}
export async function githubApiJson(input,options={}){
 const response=await githubApiFetch(input,options),raw=await response.text();
 let data=null;if(raw.trim()){try{data=JSON.parse(raw);}catch{data={message:"GitHub returned invalid JSON."};}}
 if(!response.ok)throw makeError(scrubSecret(data?.message||data?.error||("GitHub API request failed with HTTP "+response.status)),response.status);
 return data;
}
