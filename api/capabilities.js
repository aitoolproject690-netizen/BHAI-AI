import {getAIProviderStatus} from "./aiRouter.js";

const json=(res,status,data)=>res.status(status).json(data);

const providers=[
 {id:"github",name:"GitHub",type:"code",configured:()=>!!process.env.GITHUB_TOKEN},
 {id:"render",name:"Render",type:"deploy",configured:()=>!!process.env.RENDER_API_KEY},
 {id:"google-ai",name:"Google AI / Gemini",type:"ai",configured:()=>!!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY)},
 {id:"huggingface",name:"Hugging Face",type:"ai",configured:()=>!!process.env.HF_TOKEN},
 {id:"openai",name:"OpenAI",type:"ai",configured:()=>!!process.env.OPENAI_API_KEY},
 {id:"anthropic",name:"Anthropic",type:"ai",configured:()=>!!process.env.ANTHROPIC_API_KEY},
 {id:"database",name:"Database",type:"data",configured:()=>!!process.env.DATABASE_URL}
];

const features=[
 ["ai-agent","AI Employee / Agent","Natural-language planning and tool execution"],
 ["multi-ai","Multi-AI Router","Route chat, execution fallback and independent review across configured AI providers"],
 ["code-fixer","AI Code Fixer","Fix, optimize and security analysis"],
 ["code-generator","AI Code Generator","Generate project code from requirements"],
 ["project-analyzer","Project Analyzer","Inspect project structure, dependencies and errors"],
 ["test-verify","Test + Verify","Build/test/verify before reporting completion"],
 ["deploy-verify","Deploy + Verify","Deployment execution and post-deploy checks"],
 ["health-doctor","Project Health Doctor","Detect and repair common project failures"],
 ["github","GitHub Workspace","Read, create repo, edit files, branches, PRs and Actions"],
 ["connectors","Universal Connectors","Provider capability and credential status"],
 ["credential-vault","Credential Manager","Server-side environment/secret capability checks"],
 ["rollback","Backup / Rollback","Recovery hooks for failed releases"],
 ["project-memory","Project DNA","Persistent project context and decisions"],
 ["cost-guardian","Cost Guardian","Provider/model selection and execution budget controls"],
 ["employee-mode","Employee Mode","End-to-end task execution with verification"],
 ["security","Security Center","Owner locks, module gates and truthful capability checks"],
 ["apk-factory","APK Factory","GitHub Actions APK build and artifact verification"],
 ["history","History / Diff","Execution activity and repository change tracking"]
];

export default async function handler(req,res){
 if(req.method!=="GET") return json(res,405,{error:"Method not allowed"});
 const checks=providers.map(p=>({id:p.id,name:p.name,type:p.type,configured:!!p.configured(),status:p.configured()?"connected":"not_configured"}));
 const configured=new Set(checks.filter(x=>x.configured).map(x=>x.id));
 const ai=getAIProviderStatus();
 return json(res,200,{
  ok:true,
  features:features.map(([id,name,description])=>({id,name,description})),
  providers:checks,
  aiProviders:ai,
  capabilities:{
   github:{read:true,createRepo:configured.has("github"),write:configured.has("github"),actions:configured.has("github")},
   ai:{
    gemini:configured.has("google-ai"),
    openai:configured.has("openai"),
    anthropic:configured.has("anthropic"),
    multiProvider:ai.filter(x=>x.configured).length>=2
   },
   deploy:{render:configured.has("render")},
   database:configured.has("database"),
   image:{huggingface:configured.has("huggingface"),gemini:configured.has("google-ai")}
  }
 });
}
