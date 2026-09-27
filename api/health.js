export default async function handler(req,res){
  return res.status(200).json({
    ok:true,
    service:"BHAI AI",
    agent:true,
    webAgent:true,
    githubAgent:Boolean(process.env.GITHUB_TOKEN),
    aiConfigured:Boolean(process.env.OPENAI_API_KEY),
    time:new Date().toISOString()
  });
}
