// Shared auth for the /api/apply/* routes the local BoofSimplify worker calls — these are NOT
// NextAuth-session routes (the worker runs unattended, off-browser), so every route here checks
// a bearer token against profiles.apply_api_token instead of calling auth().
import { getUserIdForApplyToken } from "@/db/queries";

export async function authenticateApplyRequest(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  return getUserIdForApplyToken(match[1].trim());
}
