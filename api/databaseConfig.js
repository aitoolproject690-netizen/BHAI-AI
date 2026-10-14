import fs from "node:fs";

function readPem(value, name) {
  if (!value) return "";
  const normalized=String(value).replace(/\\n/g,"\n").trim();
  if (normalized.includes("-----BEGIN ")) return normalized;
  throw new Error(name+" must contain the PEM certificate/key text, not a file path.");
}

function readOptionalFile(filePath, name) {
  if (!filePath) return "";
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch (error) {
    throw new Error("Unable to read "+name+" file: "+String(error?.message||error));
  }
}

/**
 * Build one consistent node-postgres config for the API and background worker.
 *
 * DATABASE_SSL_MODE supports verify-full (recommended), verify-ca, require, and
 * disable. DATABASE_SSL_CA accepts PEM contents for a private root CA.
 * TLS-related query keys are lifted out of DATABASE_URL first because the
 * node-postgres connection-string parser replaces the explicit ssl object when
 * those keys are present.
 *
 * Backward compatibility: absent an explicit mode, honor sslmode in the URI;
 * otherwise preserve the historical require-TLS/no-certificate-check behavior.
 * Production hosts should explicitly set DATABASE_SSL_MODE=verify-full.
 */
export function createDatabaseClientConfig(connectionString=process.env.DATABASE_URL) {
  const raw=String(connectionString||"").trim();
  if (!raw) throw new Error("DATABASE_URL is required.");

  let normalized=raw;
  let urlMode="";
  let caPath="";
  let certPath="";
  let keyPath="";
  try {
    const url=new URL(raw);
    urlMode=String(url.searchParams.get("sslmode")||"").trim().toLowerCase();
    caPath=url.searchParams.get("sslrootcert")||"";
    certPath=url.searchParams.get("sslcert")||"";
    keyPath=url.searchParams.get("sslkey")||"";
    for (const key of ["sslmode","sslrootcert","sslcert","sslkey","ssl"]) {
      url.searchParams.delete(key);
    }
    normalized=url.toString();
  } catch (error) {
    if (raw.includes("://")) {
      throw new Error("DATABASE_URL is not a valid database URL.");
    }
  }

  const explicitMode=String(process.env.DATABASE_SSL_MODE||"").trim().toLowerCase();
  const ca=readPem(process.env.DATABASE_SSL_CA,"DATABASE_SSL_CA")||readOptionalFile(caPath,"sslrootcert");
  const cert=readOptionalFile(certPath,"sslcert");
  const key=readOptionalFile(keyPath,"sslkey");
  const mode=explicitMode||urlMode||(ca?"verify-full":"require");

  if (mode==="disable") return {connectionString:normalized,ssl:false};
  if (!["verify-full","verify-ca","require","no-verify","prefer"].includes(mode)) {
    throw new Error("Unsupported DATABASE_SSL_MODE. Use verify-full, verify-ca, require, or disable.");
  }

  const ssl={
    rejectUnauthorized:mode==="verify-full"||mode==="verify-ca",
    ...(ca?{ca}:{}),
    ...(cert?{cert}:{}),
    ...(key?{key}:{}),
    ...(mode==="verify-ca"?{checkServerIdentity:()=>undefined}:{})
  };
  return {connectionString:normalized,ssl};
}
