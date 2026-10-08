import crypto from "node:crypto";
import {requireSession} from "./_utils.js";
import {getDb,initDb} from "./db.js";
import {generateWithRouter} from "./aiRouter.js";
import {buildCharacterGenerationPrompt,parseCharacterDraft,makeCharacterIdentity,normalizeCharacter,CHARACTER_SCHEMA_VERSION} from "../src/characterIdentity.js";

const json=(res,status,data)=>res.status(status).json(data);
async function schema(db){
  await db.query(`CREATE TABLE IF NOT EXISTS bhai_character_identities (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, character_id TEXT NOT NULL, name TEXT NOT NULL,
    identity_version INTEGER NOT NULL DEFAULT 1, identity_fingerprint TEXT NOT NULL, identity_json JSONB NOT NULL,
    canonical_prompt TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id,character_id), UNIQUE(account_id,identity_fingerprint)
  )`);
}

export default async function handler(req,res){
  const account=await requireSession(req,res);if(!account)return;
  await initDb().catch(()=>false);const db=await getDb();if(!db)return json(res,503,{error:"DATABASE_URL is required"});await schema(db);
  if(req.method==="GET"){
    const r=await db.query("SELECT character_id,name,identity_version,identity_fingerprint,identity_json,canonical_prompt,created_at,updated_at FROM bhai_character_identities WHERE account_id=$1 ORDER BY created_at DESC",[account.id]);
    return json(res,200,{ok:true,schemaVersion:CHARACTER_SCHEMA_VERSION,characters:r.rows});
  }
  if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
  const input=normalizeCharacter(req.body||{});
  if(!input.name||input.name==="Unnamed Character")return json(res,400,{error:"Character name is required."});
  let draft;
  try{
    const generated=await generateWithRouter({
      task:"create permanent cartoon character identity: "+input.name,
      system:buildCharacterGenerationPrompt(input),
      messages:[{role:"user",text:JSON.stringify(input)}],
      role:"character",fallback:true
    });
    draft=parseCharacterDraft(generated.text,input);
    if(!draft.ok)return json(res,422,{ok:false,error:"Character identity failed validation.",validation:draft.errors});
  }catch(e){
    return json(res,502,{ok:false,error:"Character generation failed: "+String(e?.message||e).slice(0,600),attemptedProviders:e?.attemptedProviders||[]});
  }
  const c=draft.character;
  const id=crypto.randomUUID();
  try{
    const r=await db.query(`INSERT INTO bhai_character_identities
      (id,account_id,character_id,name,identity_version,identity_fingerprint,identity_json,canonical_prompt)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
      RETURNING character_id,name,identity_version,identity_fingerprint,identity_json,canonical_prompt,created_at,updated_at`,
      [id,account.id,c.characterId,c.identity.name,c.identityVersion,c.identityFingerprint,JSON.stringify(c.identity),c.canonicalPrompt]);
    return json(res,201,{ok:true,schemaVersion:CHARACTER_SCHEMA_VERSION,character:r.rows[0],provider:draft.provider||null});
  }catch(e){
    if(String(e?.code)==="23505")return json(res,409,{error:"A character with this permanent identity already exists for this account."});
    throw e;
  }
}
