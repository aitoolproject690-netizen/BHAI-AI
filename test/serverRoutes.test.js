import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(new URL("..",import.meta.url).pathname);
const serverSource=fs.readFileSync(path.join(root,"server.js"),"utf8");

test("unknown API routes return explicit 404 instead of falling through to the SPA",()=>{
  const apiGuard=serverSource.indexOf('if(u.pathname.startsWith("/api/")&&!routes[u.pathname]) return sendError(res,404,"API route not found.");');
  const routeDispatch=serverSource.indexOf('if(routes[u.pathname]){');
  const staticFallback=serverSource.indexOf('const root=path.join(__dirname,"dist")');
  assert.ok(apiGuard>=0,"unknown API route guard is missing");
  assert.ok(routeDispatch>apiGuard,"API route guard must run before route dispatch");
  assert.ok(staticFallback>apiGuard,"API route guard must run before static SPA fallback");
});
