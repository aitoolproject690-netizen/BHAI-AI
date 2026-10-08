import crypto from "node:crypto";

const generatedSecret=crypto.randomBytes(32).toString("hex");

function expectedSecret(){
  return String(process.env.BHAI_INTERNAL_SECRET||generatedSecret);
}

function safeEqual(a,b){
  const aa=Buffer.from(String(a||""));
  const bb=Buffer.from(String(b||""));
  return aa.length>0 && aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}

export function isInternalRequest(req){
  return safeEqual(req?.headers?.["x-bhai-internal-secret"],expectedSecret())
    && /^[A-Za-z0-9._:@-]{1,300}$/.test(String(req?.headers?.["x-bhai-account-id"]||""));
}

export function internalHeaders(accountId){
  return {
    "x-bhai-internal-secret":expectedSecret(),
    "x-bhai-account-id":String(accountId||"")
  };
}

export function internalAuthConfigured(){
  return Boolean(process.env.BHAI_INTERNAL_SECRET);
}
