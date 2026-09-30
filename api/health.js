export default async function handler(req,res){
  const commit=process.env.RENDER_GIT_COMMIT||"";
  const branch=process.env.RENDER_GIT_BRANCH||"";
  const url=process.env.RENDER_EXTERNAL_URL||"";
  const verified=Boolean(commit&&branch&&url);
  return res.status(200).json({
    ok:true,
    service:"BHAI AI",
    agent:true,
    webAgent:true,
    githubAgent:Boolean(process.env.GITHUB_TOKEN),
    aiConfigured:Boolean(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY),
    provider:"gemini",
    deployment:{verified,commit,branch,url,status:verified?"live":"unknown"},
    time:new Date().toISOString()
  });
}
