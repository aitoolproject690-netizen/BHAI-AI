let client = null;
let ready = null;
let connectionFailures = 0;
let retryAfter = 0;

function scheduleRetry() {
  const delayMs = Math.min(30_000, 1_000 * (2 ** Math.min(connectionFailures - 1, 5)));
  retryAfter = Date.now() + delayMs;
}

function invalidateClient(candidate, error) {
  if (client !== candidate) return;
  client = null;
  ready = null;
  connectionFailures += 1;
  scheduleRetry();
  console.error("Database connection lost:", String(error?.message || error));
}

export async function getDb() {
  if (client) return client;
  if (ready) return ready;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || Date.now() < retryAfter) return null;

  ready = (async () => {
    let candidate = null;
    try {
      const { Client } = await import("pg");
      candidate = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
      });
      await candidate.connect();
      client = candidate;
      connectionFailures = 0;
      retryAfter = 0;
      candidate.on("error", error => invalidateClient(candidate, error));
      return client;
    } catch (error) {
      if (candidate) {
        try { await candidate.end(); } catch {}
      }
      connectionFailures += 1;
      scheduleRetry();
      console.error("Database unavailable:", String(error?.message || error));
      return null;
    } finally {
      // Do not memoize a failed connection forever. Render Postgres can be
      // unavailable temporarily (including after Free-plan expiry/upgrade);
      // later requests must be able to retry without requiring a code change.
      if (!client) ready = null;
    }
  })();

  return ready;
}

export async function initDb() {
  const c = await getDb();
  if (!c) return false;
  await c.query("CREATE TABLE IF NOT EXISTS bhai_memory (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await c.query("CREATE TABLE IF NOT EXISTS bhai_jobs (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await c.query("CREATE TABLE IF NOT EXISTS bhai_checkpoints (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await c.query("CREATE TABLE IF NOT EXISTS bhai_history (id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await c.query("CREATE TABLE IF NOT EXISTS bhai_dna (project_key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  return true;
}
