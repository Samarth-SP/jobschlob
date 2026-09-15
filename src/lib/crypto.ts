// AES-256-GCM at-rest encryption for user-supplied secrets (their own Anthropic/OpenAI API keys —
// see lib/llm-client.ts) stored in profiles.llm_config. Keyed by a server-only secret so a DB leak
// alone doesn't hand out a user's third-party API keys in plaintext — the same posture this app
// already takes with its own secrets (env vars / GitHub Actions secrets / Vercel env vars), just
// extended to secrets a user gives *us* to hold on their behalf.
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function key(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) throw new Error("SETTINGS_ENCRYPTION_KEY is not set — required to store or read a user-supplied API key");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("SETTINGS_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes — generate with: openssl rand -base64 32");
  return buf;
}

// iv (12 bytes) + authTag (16 bytes) + ciphertext, all in one base64 string — a single jsonb
// string value per key rather than three fields to keep in sync.
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
