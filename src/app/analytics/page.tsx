import { auth } from "@/lib/auth";
import { getApplicationEventsByDay, getFunnelCounts, getAvgMatchScore } from "@/db/queries";
import { Heatmap } from "@/components/Heatmap";
import { FunnelChart } from "@/components/FunnelChart";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.email) {
    return <main className="p-6">Sign in to see your analytics.</main>;
  }
  const userId = session.user.email;

  const [byDay, funnel, avgMatch] = await Promise.all([
    getApplicationEventsByDay(userId),
    getFunnelCounts(userId),
    getAvgMatchScore(userId),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-8">
      <h1 className="text-xl font-semibold text-ink">Analytics</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-ink-soft">Average match score</h2>
        <div className="flex gap-8">
          <div>
            <div className="text-2xl font-semibold text-ink">
              {avgMatch.overall !== null ? Math.round(avgMatch.overall) : "—"}
            </div>
            <div className="text-sm text-ink-soft">across all scored jobs</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-ink">
              {avgMatch.applied !== null ? Math.round(avgMatch.applied) : "—"}
            </div>
            <div className="text-sm text-ink-soft">across jobs you tracked</div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-ink-soft">Applications per day</h2>
        <Heatmap counts={byDay} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase text-ink-soft">Funnel</h2>
        <FunnelChart counts={funnel} />
      </section>
    </main>
  );
}
