import { NextResponse } from "next/server";
import { authenticateApplyRequest } from "@/lib/apply-auth";
import { importOfferRunwayListings, unwrapOfferRunwayDoc } from "@/lib/import-offer-runway";

export const runtime = "nodejs";
// A forceRescore batch runs one LLM call per job (mapWithConcurrency in import-offer-runway.ts
// bounds concurrency, not total count) — give it real headroom rather than the platform default.
export const maxDuration = 300;

// Bearer-token path for importing "Offer Runway" listings (see src/lib/import-offer-runway.ts) —
// for a machine that has a jobschlob apply-api token but not this deployment's DATABASE_URL (e.g.
// a deployment a friend owns/hosts). scripts/import-offer-runway.ts is the direct-DB equivalent;
// same logic either way, just a different way to authenticate as the right user.
export async function POST(req: Request) {
  const userId = await authenticateApplyRequest(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const raw = body?.listings;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "body must be { listings: [...] }" }, { status: 400 });
  }

  const docs = raw.map(unwrapOfferRunwayDoc);
  const dryRun = body?.dryRun === true;
  const forceRescore = body?.forceRescore === true;
  const result = await importOfferRunwayListings(userId, docs, { dryRun, forceRescore });

  return NextResponse.json({ ok: true, ...result });
}
