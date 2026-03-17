import Link from "next/link";
import { CoInvestorSignalsDigestRunner } from "@/components/co-investor-signals-digest-runner";
import { prisma } from "@/lib/db";
import {
  DIGEST_KINDS,
  isDigestKind,
  stakeholderSignalsConfig,
  type DigestKind
} from "@/lib/stakeholder-signals-config";

type SearchParams = {
  kind?: string | string[];
  days?: string | string[];
  limit?: string | string[];
  eventType?: string | string[];
};

type AllianceDigestStatus = "YES" | "PROSPECT" | "REVISIT_LATER" | "NO";

type DigestRow = {
  id: string;
  subjectName: string;
  eventType: string;
  headline: string;
  summary: string;
  suggestedOutreach: string | null;
  sourceUrl: string;
  sourceDomain: string | null;
  sourcePublishedAt: Date | null;
  signalDate: Date | null;
  createdAt: Date;
  alliancePriority?: AllianceDigestStatus;
  allianceLabel?: string | null;
  allianceTitle?: string | null;
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

function buildWindowWhere(cutoff: Date, eventType?: string | null) {
  return {
    ...(eventType ? { eventType } : {}),
    OR: [{ sourcePublishedAt: { gte: cutoff } }, { sourcePublishedAt: null, createdAt: { gte: cutoff } }]
  };
}

function buildDigestHref(kind: DigestKind, days: number, limit: number, eventType?: string | null) {
  const params = new URLSearchParams({
    kind,
    days: String(days),
    limit: String(limit)
  });
  if (eventType) {
    params.set("eventType", eventType);
  }
  return `/tests/co-investor-signals-digest?${params.toString()}`;
}

function rowTimestamp(row: Pick<DigestRow, "sourcePublishedAt" | "signalDate" | "createdAt">): number {
  return (row.sourcePublishedAt || row.signalDate || row.createdAt).getTime();
}

function alliancePriorityRank(status: AllianceDigestStatus | null | undefined): number {
  if (status === "YES") return 0;
  if (status === "PROSPECT") return 1;
  if (status === "REVISIT_LATER") return 2;
  return 3;
}

function allianceLabel(status: AllianceDigestStatus | null | undefined): string | null {
  if (status === "YES") return "Alliance Member";
  if (status === "PROSPECT") return "Alliance Prospect";
  if (status === "REVISIT_LATER") return "Alliance Revisit";
  return null;
}

function highestAllianceStatus(statuses: AllianceDigestStatus[]): AllianceDigestStatus {
  if (statuses.includes("YES")) return "YES";
  if (statuses.includes("PROSPECT")) return "PROSPECT";
  if (statuses.includes("REVISIT_LATER")) return "REVISIT_LATER";
  return "NO";
}

function allianceTitle(label: string | null, sourceNames: string[]): string | null {
  if (!label) return null;
  if (sourceNames.length === 0) return label;
  if (sourceNames.length === 1) return `${label} via ${sourceNames[0]}`;
  const uniqueNames = Array.from(new Set(sourceNames));
  const preview = uniqueNames.slice(0, 2).join(", ");
  return uniqueNames.length > 2 ? `${label} via ${preview} + ${uniqueNames.length - 2} more` : `${label} via ${preview}`;
}

function sortDigestRows(rows: DigestRow[]) {
  return [...rows].sort((left, right) => {
    const priorityDelta = alliancePriorityRank(left.alliancePriority) - alliancePriorityRank(right.alliancePriority);
    if (priorityDelta !== 0) return priorityDelta;
    return rowTimestamp(right) - rowTimestamp(left);
  });
}

async function loadDigestRows(kind: DigestKind, cutoff: Date, limit: number, eventType: string | null) {
  const where = buildWindowWhere(cutoff, eventType);
  const distinctWhere = buildWindowWhere(cutoff);

  switch (kind) {
    case "co-investors": {
      const [signals, distinctTypes] = await Promise.all([
        prisma.coInvestorSignalEvent.findMany({
          where,
          include: {
            coInvestor: {
              select: { name: true }
            }
          },
          orderBy: [{ sourcePublishedAt: "desc" }, { createdAt: "desc" }],
          take: limit
        }),
        prisma.coInvestorSignalEvent.findMany({
          where: distinctWhere,
          distinct: ["eventType"],
          select: { eventType: true },
          orderBy: { eventType: "asc" }
        })
      ]);

      return {
        rows: signals.map((signal) => ({
          id: signal.id,
          subjectName: signal.coInvestor.name,
          eventType: signal.eventType,
          headline: signal.headline,
          summary: signal.summary,
          suggestedOutreach: signal.suggestedOutreach,
          sourceUrl: signal.sourceUrl,
          sourceDomain: signal.sourceDomain,
          sourcePublishedAt: signal.sourcePublishedAt,
          signalDate: signal.signalDate,
          createdAt: signal.createdAt
        })),
        eventTypes: distinctTypes.map((entry) => entry.eventType)
      };
    }
    case "contacts": {
      const [signals, distinctTypes] = await Promise.all([
        prisma.contactSignalEvent.findMany({
          where,
          include: {
            contact: {
              select: {
                name: true,
                healthSystemLinks: {
                  select: {
                    healthSystem: {
                      select: {
                        name: true,
                        allianceMemberStatus: true
                      }
                    }
                  }
                }
              }
            }
          },
          orderBy: [{ sourcePublishedAt: "desc" }, { createdAt: "desc" }]
        }),
        prisma.contactSignalEvent.findMany({
          where: distinctWhere,
          distinct: ["eventType"],
          select: { eventType: true },
          orderBy: { eventType: "asc" }
        })
      ]);

      return {
        rows: sortDigestRows(
          signals.map((signal) => {
            const statuses = signal.contact.healthSystemLinks.map(
              (link) => link.healthSystem.allianceMemberStatus as AllianceDigestStatus
            );
            const priority = highestAllianceStatus(statuses);
            const badgeLabel = allianceLabel(priority);
            const matchingHealthSystems = signal.contact.healthSystemLinks
              .filter((link) => link.healthSystem.allianceMemberStatus === priority)
              .map((link) => link.healthSystem.name);

            return {
              id: signal.id,
              subjectName: signal.contact.name,
              eventType: signal.eventType,
              headline: signal.headline,
              summary: signal.summary,
              suggestedOutreach: signal.suggestedOutreach,
              sourceUrl: signal.sourceUrl,
              sourceDomain: signal.sourceDomain,
              sourcePublishedAt: signal.sourcePublishedAt,
              signalDate: signal.signalDate,
              createdAt: signal.createdAt,
              alliancePriority: priority,
              allianceLabel: badgeLabel,
              allianceTitle: allianceTitle(badgeLabel, matchingHealthSystems)
            };
          })
        ).slice(0, limit),
        eventTypes: distinctTypes.map((entry) => entry.eventType)
      };
    }
    case "companies": {
      const [signals, distinctTypes] = await Promise.all([
        prisma.companySignalEvent.findMany({
          where,
          include: {
            company: {
              select: { name: true }
            }
          },
          orderBy: [{ sourcePublishedAt: "desc" }, { createdAt: "desc" }],
          take: limit
        }),
        prisma.companySignalEvent.findMany({
          where: distinctWhere,
          distinct: ["eventType"],
          select: { eventType: true },
          orderBy: { eventType: "asc" }
        })
      ]);

      return {
        rows: signals.map((signal) => ({
          id: signal.id,
          subjectName: signal.company.name,
          eventType: signal.eventType,
          headline: signal.headline,
          summary: signal.summary,
          suggestedOutreach: signal.suggestedOutreach,
          sourceUrl: signal.sourceUrl,
          sourceDomain: signal.sourceDomain,
          sourcePublishedAt: signal.sourcePublishedAt,
          signalDate: signal.signalDate,
          createdAt: signal.createdAt
        })),
        eventTypes: distinctTypes.map((entry) => entry.eventType)
      };
    }
    case "health-systems": {
      const [signals, distinctTypes] = await Promise.all([
        prisma.healthSystemSignalEvent.findMany({
          where,
          include: {
            healthSystem: {
              select: {
                name: true,
                allianceMemberStatus: true
              }
            }
          },
          orderBy: [{ sourcePublishedAt: "desc" }, { createdAt: "desc" }]
        }),
        prisma.healthSystemSignalEvent.findMany({
          where: distinctWhere,
          distinct: ["eventType"],
          select: { eventType: true },
          orderBy: { eventType: "asc" }
        })
      ]);

      return {
        rows: sortDigestRows(
          signals.map((signal) => {
            const priority = signal.healthSystem.allianceMemberStatus as AllianceDigestStatus;
            const badgeLabel = allianceLabel(priority);

            return {
              id: signal.id,
              subjectName: signal.healthSystem.name,
              eventType: signal.eventType,
              headline: signal.headline,
              summary: signal.summary,
              suggestedOutreach: signal.suggestedOutreach,
              sourceUrl: signal.sourceUrl,
              sourceDomain: signal.sourceDomain,
              sourcePublishedAt: signal.sourcePublishedAt,
              signalDate: signal.signalDate,
              createdAt: signal.createdAt,
              alliancePriority: priority,
              allianceLabel: badgeLabel,
              allianceTitle: badgeLabel
            };
          })
        ).slice(0, limit),
        eventTypes: distinctTypes.map((entry) => entry.eventType)
      };
    }
  }
}

export default async function CoInvestorSignalsDigestPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const selectedKind = isDigestKind(asSingle(resolvedSearchParams.kind))
    ? (asSingle(resolvedSearchParams.kind) as DigestKind)
    : "co-investors";
  const days = parsePositiveInt(asSingle(resolvedSearchParams.days), 7, 1, 60);
  const limit = parsePositiveInt(asSingle(resolvedSearchParams.limit), 50, 1, 200);
  const eventType = asSingle(resolvedSearchParams.eventType);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  try {
    const [selectedDigest, coInvestorCount, contactCount, companyCount, healthSystemCount] = await Promise.all([
      loadDigestRows(selectedKind, cutoff, limit, eventType),
      prisma.coInvestorSignalEvent.count({ where: buildWindowWhere(cutoff) }),
      prisma.contactSignalEvent.count({ where: buildWindowWhere(cutoff) }),
      prisma.companySignalEvent.count({ where: buildWindowWhere(cutoff) }),
      prisma.healthSystemSignalEvent.count({ where: buildWindowWhere(cutoff) })
    ]);

    const counts: Record<DigestKind, number> = {
      "co-investors": coInvestorCount,
      contacts: contactCount,
      companies: companyCount,
      "health-systems": healthSystemCount
    };
    const selectedConfig = stakeholderSignalsConfig[selectedKind];

    return (
      <main>
        <section className="panel">
          <h2>Stakeholder Signals Digest</h2>
          <p className="muted">
            Unified beta digest for co-investors, contacts, companies, and health systems. Select a digest below to
            review recent signals and trigger a new sweep.
          </p>

          <div className="detail-tabs detail-subtabs screening-material-tab-bar" aria-label="Digest selectors and actions">
            {DIGEST_KINDS.map((kind) => (
              <Link
                key={kind}
                href={buildDigestHref(kind, days, limit)}
                className={`detail-tab ${selectedKind === kind ? "active" : ""}`}
                aria-current={selectedKind === kind ? "page" : undefined}
              >
                <span className="detail-tab-label-with-badges">
                  <span>{stakeholderSignalsConfig[kind].label}</span>
                  <span className="detail-tab-badge detail-tab-badge-open">{counts[kind]}</span>
                </span>
              </Link>
            ))}
            <CoInvestorSignalsDigestRunner kind={selectedKind} />
          </div>

          <div style={{ paddingTop: "1rem", paddingBottom: "0.75rem" }}>
            <p className="muted">
              <strong>{selectedConfig.label}:</strong> {selectedConfig.searchDescription}
            </p>
            <p className="muted">
              This digest covers the last {days} day{days === 1 ? "" : "s"} and shows up to {limit} saved items for
              the selected entity type.
            </p>
            {selectedKind === "contacts" || selectedKind === "health-systems" ? (
              <p className="muted">Alliance members appear first, followed by Alliance prospects, then other records.</p>
            ) : null}
          </div>

          <p className="muted" style={{ marginTop: 0 }}>
            Quick views:{" "}
            <Link href={buildDigestHref(selectedKind, 1, 30)}>1 day</Link> |{" "}
            <Link href={buildDigestHref(selectedKind, 7, 50)}>7 days</Link> |{" "}
            <Link href={buildDigestHref(selectedKind, 14, 100)}>14 days</Link>
          </p>
          <p className="muted">
            Filter: <Link href={buildDigestHref(selectedKind, days, limit)}>All types</Link>
            {selectedDigest.eventTypes.map((type) => (
              <span key={type}>
                {" "}
                | <Link href={buildDigestHref(selectedKind, days, limit, type)}>{type}</Link>
              </span>
            ))}
          </p>

          {selectedDigest.rows.length === 0 ? (
            <p className="muted">No {selectedConfig.label.toLowerCase()} signals found for this filter yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table table-dense">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>{selectedConfig.singularLabel}</th>
                    <th>Type</th>
                    <th>Headline</th>
                    <th>Summary</th>
                    <th>Suggested Outreach</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDigest.rows.map((signal: DigestRow) => (
                    <tr key={signal.id}>
                      <td>{formatDate(signal.sourcePublishedAt || signal.signalDate || signal.createdAt)}</td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                          <span>{signal.subjectName}</span>
                          {signal.allianceLabel ? (
                            <span className="flag-pill alliance" title={signal.allianceTitle || signal.allianceLabel}>
                              {signal.allianceLabel}
                            </span>
                          ) : null}
                        </div>
                      </td>
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
          <h2>Stakeholder Signals Digest</h2>
          {prismaCode === "P2021" ? (
            <p className="status error">
              Database schema is out of date for this digest. Run <code>npm run db:sync</code> and refresh.
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
