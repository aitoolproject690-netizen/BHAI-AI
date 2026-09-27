export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  try{
    const {messages=[],doIt=false}=req.body||{};
    const key=process.env.OPENAI_API_KEY;
    if(!key) return res.status(503).json({error:"AI provider is not configured yet. Add OPENAI_API_KEY to the deployment environment."});
    const system=`You are BHAI AI, a practical personal work agent. Reply in Hinglish when the user does. Be concise and action-oriented. You can plan work, write code, research, and operate connected tools when tools are actually available. Never claim an action was completed unless the connected system confirms it. DO IT mode means the user wants execution, but still respect permissions and ask before irreversible or sensitive actions. Current DO IT mode: ${doIt?"ON":"OFF"}.`;
    const clean=[{role:"system",content:system},...messages.filter(m=>m&&["user","assistant"].includes(m.role)).slice(-20).map(m=>({role:m.role,content:String(m.text||"")}))];
    const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization:`Bearer ${key}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4o-mini",messages:clean,temperature:.2})});
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data?.error?.message||"AI request failed"});
    return res.status(200).json({text:data.choices?.[0]?.message?.content||"No response received."});
  }catch(e){return res.status(500).json({error:e?.message||"Server error"});}
}