import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setFilters } from "@/db/queries";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined);
  await setFilters(session.user.email, {
    minScore: typeof body.minScore === "number" ? body.minScore : undefined,
    locations: strings(body.locations),
    company: typeof body.company === "string" && body.company ? body.company : undefined,
    categories: strings(body.categories),
    levels: strings(body.levels),
  });

  return NextResponse.json({ ok: true });
}
