import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(appRoot, ".env");

// Botkeep stores protected environment values in the container's .env file.
// Load them before the server imports API modules that read process.env.
// Existing platform-injected environment variables keep precedence.
try {
  process.loadEnvFile(envPath);
  console.log("[CONFIG] Loaded protected .env file");
} catch (error) {
  if (error?.code !== "ENOENT") {
    // Never log environment values or the contents of the file.
    console.error("[CONFIG] Unable to load .env file:", String(error?.message || error));
  }
}
