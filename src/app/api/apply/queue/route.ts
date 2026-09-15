import { NextResponse } from "next/server";
import { authenticateApplyRequest } from "@/lib/apply-auth";
import { getQueuedApplyTasks, getIdentity, getProfile } from "@/db/queries";
import { toBoofIdentity } from "@/lib/apply-identity";

export const runtime = "nodejs";

// Pulled by the local BoofSimplify worker (boof/remote.py), not the browser — see
// lib/apply-auth.ts. Returns everything the worker's existing pipeline
// (boof/apply/{formscan,mapping,filler,browser}.py) needs to run unchanged: the job URL, a
// download link for the tailored resume, and a `profile` object shaped like BoofSimplify's own
// (see boof/profile/schema.py) so mapping.build_facts()/llm_answers() can consume it directly.
//
// jobschlob has no per-bullet evidence bank (unlike BoofSimplify's own profile store) — only a
// free-text background blob — so `experiences`/`projects` are deliberately empty here and the
// background goes in as a single raw_facts entry instead. Screening-question answers the worker's
// mapping.llm_answers() generates for these tasks will have less to draw on than BoofSimplify's
// native evidence-bank flow; deterministic fields (name/email/phone/work authorization/etc, from
// `identity`) are unaffected.
export async function GET(req: Request) {
  const userId = await authenticateApplyRequest(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [rows, identity, background] = await Promise.all([getQueuedApplyTasks(userId), getIdentity(userId), getProfile(userId)]);

  const tasks = rows.map(({ task, job, document }) => ({
    taskId: task.id,
    job: { id: job.id, title: job.title, company: job.company, location: job.location, url: job.url },
    documentUrl: document?.blobUrl ? `${new URL(req.url).origin}/api/apply/document?taskId=${task.id}` : null,
    profile: {
      identity: toBoofIdentity(identity),
      raw_facts: background.trim() ? [background.trim()] : [],
      experiences: [],
      projects: [],
      education: [],
      skills: {},
    },
  }));

  return NextResponse.json({ tasks });
}
