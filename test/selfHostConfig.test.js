import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), "utf8");

test("BHAI-X is not directly published to the host", () => {
  const compose = read("docker-compose.selfhost.yml");
  assert.match(compose, /expose:\s*\n\s*- "10000"/);
  assert.doesNotMatch(compose, /ports:\s*\n\s*- "10000:10000"/);
});

test("BHAI-X uses the shared-network Core by default", () => {
  const compose = read("docker-compose.selfhost.yml");
  assert.match(compose, /BHAI_CORE_URL: \$\{BHAI_CORE_URL:-http:\/\/bhai-core:10000\}/);
  assert.doesNotMatch(compose, /BHAI_MOBILE_NODE_TOKEN/);
});

test("BHAI-X container runs as non-root", () => {
  const dockerfile = read("Dockerfile");
  assert.match(dockerfile, /USER node/);
});

test("BHAI-X CORS is opt-in", () => {
  const source = read("server.js");
  assert.match(source, /BHAI_CORS_ORIGIN/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin",allowedOrigin/);
});
