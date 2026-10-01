/**
 * BHAI Core Gateway
 *
 * Stable, provider-neutral API facade for BHAI X.
 * The frontend and future BHAI Cloud should talk to this contract,
 * while provider/model selection stays inside aiRouter.js.
 */

import { getAIProviderStatus, generateWithRouter } from "./aiRouter.js";

const MAX_MESSAGES = 40;
const MAX_TEXT = 16000;

function clampText(value, max = MAX_TEXT) {
  return String(value ?? "").slice(0, max);
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-MAX_MESSAGES)
    .filter(m => m && typeof m === "object")
    .map(m => ({
      role: ["user", "assistant", "model"].includes(m.role) ? m.role : "user",
      text: clampText(m.text ?? m.content ?? "")
    }))
    .filter(m => m.text);
}

export function coreStatus() {
  return {
    ok: true,
    service: "BHAI Core",
    version: "1",
    router: "multi-provider",
    providers: getAIProviderStatus()
  };
}

export default async function core(req, res) {
  if (req.method === "GET") return res.json(coreStatus());

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const messages = normalizeMessages(body.messages);

  if (!messages.length) {
    return res.status(400).json({
      ok: false,
      error: "At least one message is required."
    });
  }

  try {
    const result = await generateWithRouter({
      task: clampText(body.task, 8000),
      system: clampText(body.system, 12000),
      messages,
      preferred: clampText(body.preferred, 64),
      role: clampText(body.role || "chat", 32),
      exclude: Array.isArray(body.exclude) ? body.exclude.slice(0, 8) : [],
      fallback: body.fallback !== false,
      model: clampText(body.model, 160)
    });

    return res.json({
      ok: true,
      text: result.text,
      provider: result.provider,
      model: result.model
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      error: String(error?.message || "BHAI Core request failed")
    });
  }
}
