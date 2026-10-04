let client=null;
let ready=null;
export async function getDb(){
 if(ready)return ready;
 ready=(async()=>{
  if(!process.env.DATABASE_URL)return null;
  try{
   const {Client}=await import("pg");
   const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:5000});
   await c.connect(); client=c; return c;
  }catch(e){console.error("Database unavailable:",e.message);client=null;return null}
 })();
 return ready;
}
export async function initDb(){
 const c=await getDb(); if(!c)return false;
 await c.query("CREATE TABLE IF NOT EXISTS bhai_memory (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await c.query("CREATE TABLE IF NOT EXISTS bhai_jobs (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await c.query("CREATE TABLE IF NOT EXISTS bhai_checkpoints (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await c.query("CREATE TABLE IF NOT EXISTS bhai_history (id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await c.query("CREATE TABLE IF NOT EXISTS bhai_dna (project_key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 return true;
}
