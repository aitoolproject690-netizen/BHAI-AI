import test from "node:test";
import assert from "node:assert/strict";
import { mediaLimitFor, mediaQuotaSummary } from "../src/mediaUsagePolicy.js";

test("provider-backed lanes keep existing daily app limits by default", () => {
  assert.equal(mediaLimitFor("image", {}), 10);
  assert.equal(mediaLimitFor("video", {}), 3);
});

test("configured self-hosted image/video endpoints use capacity-based accounting", () => {
  const env = { BHAI_IMAGE_URL: "https://worker.example/image", BHAI_VIDEO_URL: "https://worker.example/video" };
  assert.equal(mediaLimitFor("image", env), null);
  assert.equal(mediaLimitFor("video", env), null);
  assert.equal(mediaQuotaSummary(env).imageMode, "capacity-based");
});

test("daily app limits can be configured or disabled deliberately", () => {
  assert.equal(mediaLimitFor("image", { BHAI_IMAGE_DAILY_LIMIT: "25" }), 25);
  assert.equal(mediaLimitFor("video", { BHAI_VIDEO_DAILY_LIMIT: "unlimited" }), null);
  assert.equal(mediaLimitFor("video", { BHAI_VIDEO_DAILY_LIMIT: "-3" }), 3);
});
