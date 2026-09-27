export default async function handler(req,res){
  return res.status(200).json({
    ok:true,
    service:"BHAI AI",
    agent:true,
    webAgent:true,
    githubAgent:Boolean(process.env.GITHUB_TOKEN),
    aiConfigured:Boolean(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY),
    provider:"gemini",
    time:new Date().toISOString()
  });
}
