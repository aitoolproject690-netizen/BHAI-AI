const DEFAULT_LIMITS = Object.freeze({ image: 10, video: 3 });

/**
 * App-level quotas apply only to provider-backed media. Explicit self-hosted
 * endpoints use server capacity instead of an artificial per-account daily cap.
 * A configured *_DAILY_LIMIT of "0" or "unlimited" also means no app-level cap.
 */
export function mediaLimitFor(type, env = process.env, fallback = DEFAULT_LIMITS[type] ?? 10) {
  const kind = String(type || "").toLowerCase() === "video" ? "video" : "image";
  const endpoint = String(env[kind === "video" ? "BHAI_VIDEO_URL" : "BHAI_IMAGE_URL"] || "").trim();
  if (endpoint) return null;

  const raw = env[kind === "video" ? "BHAI_VIDEO_DAILY_LIMIT" : "BHAI_IMAGE_DAILY_LIMIT"];
  if (raw == null || String(raw).trim() === "") return fallback;
  const value = String(raw).trim().toLowerCase();
  if (value === "0" || value === "unlimited" || value === "infinity") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1000000) return fallback;
  return parsed;
}

export function mediaQuotaSummary(env = process.env) {
  const imageLimit = mediaLimitFor("image", env);
  const videoLimit = mediaLimitFor("video", env);
  return {
    imageLimit,
    videoLimit,
    imageMode: imageLimit == null ? "capacity-based" : "daily-app-limit",
    videoMode: videoLimit == null ? "capacity-based" : "daily-app-limit",
    selfHostedImageConfigured: Boolean(String(env.BHAI_IMAGE_URL || "").trim()),
    selfHostedVideoConfigured: Boolean(String(env.BHAI_VIDEO_URL || "").trim())
  };
}
