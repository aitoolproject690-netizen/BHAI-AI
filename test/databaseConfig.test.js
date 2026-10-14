import test from "node:test";
import assert from "node:assert/strict";
import {createDatabaseClientConfig} from "../api/databaseConfig.js";

const envKeys=["DATABASE_SSL_MODE","DATABASE_SSL_CA"];
function withEnv(values,fn) {
  const previous=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
  try {
    for(const key of envKeys) {
      if(Object.hasOwn(values,key)) process.env[key]=values[key];
      else delete process.env[key];
    }
    fn();
  } finally {
    for(const key of envKeys) {
      if(previous[key]===undefined) delete process.env[key];
      else process.env[key]=previous[key];
    }
  }
}

test("verify-full mode validates TLS and preserves non-TLS URI parameters",()=>{
  withEnv({DATABASE_SSL_MODE:"verify-full",DATABASE_SSL_CA:"-----BEGIN CERTIFICATE-----\\nexample-ca\\n-----END CERTIFICATE-----"},()=>{
    const result=createDatabaseClientConfig("postgresql://user:pass@db.example:5432/app?sslmode=require&application_name=bhai");
    assert.equal(result.ssl.rejectUnauthorized,true);
    assert.match(result.ssl.ca,/BEGIN CERTIFICATE/);
    assert.match(result.connectionString,/application_name=bhai/);
    assert.doesNotMatch(result.connectionString,/sslmode=/);
  });
});

test("disable mode is explicit for a private local database only",()=>{
  withEnv({DATABASE_SSL_MODE:"disable"},()=>{
    const result=createDatabaseClientConfig("postgresql://user:pass@localhost:5432/app");
    assert.equal(result.ssl,false);
  });
});

test("URI verify-full is honored when no environment mode is given",()=>{
  withEnv({},()=>{
    const result=createDatabaseClientConfig("postgresql://user:pass@db.example:5432/app?sslmode=verify-full");
    assert.equal(result.ssl.rejectUnauthorized,true);
    assert.doesNotMatch(result.connectionString,/sslmode=/);
  });
});

test("legacy require mode preserves the historical TLS compatibility default",()=>{
  withEnv({},()=>{
    const result=createDatabaseClientConfig("postgresql://user:pass@db.example:5432/app");
    assert.equal(result.ssl.rejectUnauthorized,false);
  });
});
