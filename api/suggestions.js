const json=(res,status,data)=>res.status(status).json(data);
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const {goal="",completed=[],remaining=[]}=req.body||{};const g=String(goal).toLowerCase();const suggestions=[];
 if(/deploy|website|server/.test(g))suggestions.push("Add post-deploy health check and rollback checkpoint.");
 if(/code|app|project|github/.test(g))suggestions.push("Run automated tests and dependency/security scan before release.");
 if(!completed.includes("backup"))suggestions.push("Create a known-good backup before risky changes.");
 if(!remaining.length)suggestions.push("Run a final self-audit and verify every requested outcome.");
 return json(res,200,{ok:true,suggestions:[...new Set(suggestions)].slice(0,5)});
}