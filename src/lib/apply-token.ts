// Bearer token for the local BoofSimplify worker (see boof/remote.py) to authenticate against
// /api/apply/* — not a NextAuth session, since the worker runs unattended, off-browser, on the
// user's own machine.
//
// Only the SHA-256 hash is ever stored (profiles.apply_api_token) — same reasoning as a password
// hash: a DB leak alone shouldn't hand out a live credential. Lookup-by-token still works as a
// plain indexed equality check because the hash is deterministic (no per-row salt needed — the
// token itself already has 24 bytes of entropy, so a rainbow-table attack on the hash column
// isn't the realistic threat model here the way it would be for user-chosen passwords).
import { randomBytes, createHash } from "crypto";

export function generateApplyToken(): string {
  return `boof_${randomBytes(24).toString("base64url")}`;
}

export function hashApplyToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
