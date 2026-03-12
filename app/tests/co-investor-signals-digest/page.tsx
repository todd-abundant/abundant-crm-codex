import Link from "next/link";
import { CoInvestorSignalsDigestRunner } from "@/components/co-investor-signals-digest-runner";
import { prisma } from "@/lib/db";

type SearchParams = {
  days?: string | string[];
  limit?: string | string[];
  eventType?: string | string[];
};

function asSingle(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}

export default async function CoInvestorSignalsDigestPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const days = parsePositiveInt(asSingle(resolvedSearchParams.days), 7, 1, 60);
  const limit = parsePositiveInt(asSingle(resolvedSearchParams.limit), 50, 1, 200);
  const eventType = asSingle(resolvedSearchParams.eventType);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  try {
    const [signals, distinctTypes] = await Promise.all([
      prisma.coInvestorSignalEvent.findMany({
        where: {
          ...(eventType ? { eventType } : {}),
          OR: [{ sourcePublishedAt: { gte: cutoff } }, { sourcePublishedAt: null, createdAt: { gte: cutoff } }]
        },
        include: {
          coInvestor: {
            select: { id: true, name: true }
          }
        },
        orderBy: [{ sourcePublishedAt: "desc" }, { createdAt: "desc" }],
        take: limit
      }),
      prisma.coInvestorSignalEvent.findMany({
        distinct: ["eventType"],
        select: { eventType: true },
        orderBy: { eventType: "asc" }
      })
    ]);

    return (
      <main>
        <section className="panel">
          <h2>Co-Investor Signals Digest</h2>
          <p className="muted">
            Beta daily digest view for relationship-ready investor signals. Use the button below to run a fresh sweep.
          </p>
          <CoInvestorSignalsDigestRunner />
          <p className="muted">
            Showing up to {limit} signals from the last {days} day{days === 1 ? "" : "s"}.
          </p>
          <p className="muted">
            Quick views:{" "}
            <Link href="/tests/co-investor-signals-digest?days=1&limit=30">1 day</Link> |{" "}
            <Link href="/tests/co-investor-signals-digest?days=7&limit=50">7 days</Link> |{" "}
            <Link href="/tests/co-investor-signals-digest?days=14&limit=100">14 days</Link>
          </p>
          <p className="muted">
            Filter: <Link href={`/tests/co-investor-signals-digest?days=${days}&limit=${limit}`}>All types</Link>
            {distinctTypes.map((entry) => (
              <span key={entry.eventType}>
                {" "}
                |{" "}
                <Link
                  href={`/tests/co-investor-signals-digest?days=${days}&limit=${limit}&eventType=${encodeURIComponent(
                    entry.eventType
                  )}`}
                >
                  {entry.eventType}
                </Link>
              </span>
            ))}
          </p>

          {signals.length === 0 ? (
            <p className="muted">No signals found for this filter yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table table-dense">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Co-Investor</th>
                    <th>Type</th>
                    <th>Headline</th>
                    <th>Summary</th>
                    <th>Suggested Outreach</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((signal) => (
                    <tr key={signal.id}>
                      <td>{formatDate(signal.sourcePublishedAt || signal.signalDate || signal.createdAt)}</td>
                      <td>{signal.coInvestor.name}</td>
                      <td>{signal.eventType}</td>
                      <td>{signal.headline}</td>
                      <td>{signal.summary}</td>
                      <td>{signal.suggestedOutreach || "N/A"}</td>
                      <td>
                        <a href={signal.sourceUrl} target="_blank" rel="noreferrer">
                          {signal.sourceDomain || "source"}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    );
  } catch (error) {
    const prismaCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : null;

    return (
      <main>
        <section className="panel">
          <h2>Co-Investor Signals Digest</h2>
          {prismaCode === "P2021" ? (
            <p className="status error">
              Database schema is out of date for this feature branch. Run <code>npm run db:sync</code> and refresh.
            </p>
          ) : (
            <p className="status error">
              Failed to load digest data: {error instanceof Error ? error.message : "Unknown error"}
            </p>
          )}
        </section>
      </main>
    );
  }
}
