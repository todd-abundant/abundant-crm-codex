"use client";

import * as React from "react";
import Link from "next/link";

type PreliminaryInterest =
  | "N/A"
  | "Need Follow-up"
  | "Passing"
  | "Screening Scheduled"
  | "Interested - Internal Debrief"
  | "Interested - LOI Pending";

type MockScreeningRow = {
  id: string;
  organization: string;
  attendCount: number | null;
  preliminaryInterest: PreliminaryInterest;
  attendees: string[];
  relevantFeedbackNextSteps: string;
  statusUpdate: string;
};

const preliminaryInterestOptions: PreliminaryInterest[] = [
  "N/A",
  "Need Follow-up",
  "Passing",
  "Screening Scheduled",
  "Interested - Internal Debrief",
  "Interested - LOI Pending"
];

const initialRows: MockScreeningRow[] = [
  {
    id: "christianacare",
    organization: "ChristianaCare",
    attendCount: null,
    preliminaryInterest: "N/A",
    attendees: [],
    relevantFeedbackNextSteps: "Need to follow up regarding interest.",
    statusUpdate: "No response yet."
  },
  {
    id: "confluence",
    organization: "Confluence Health",
    attendCount: 1,
    preliminaryInterest: "Need Follow-up",
    attendees: ["Becket Mahnke, MD (Chief Medical Information Officer)"],
    relevantFeedbackNextSteps: "LOI template to be shared after internal review.",
    statusUpdate: "Awaiting internal debrief."
  },
  {
    id: "endeavor",
    organization: "Endeavor Health",
    attendCount: 2,
    preliminaryInterest: "Need Follow-up",
    attendees: [
      "Susan Goodson (Chief Digital Information Officer)",
      "Rajiv Kolagani (Chief Data and AI Officer)"
    ],
    relevantFeedbackNextSteps: "Need to discuss approach for Endeavor given existing conversations.",
    statusUpdate: "Follow-up discussion requested."
  },
  {
    id: "kettering",
    organization: "Kettering Health",
    attendCount: 6,
    preliminaryInterest: "Interested - Internal Debrief",
    attendees: [
      "Nancy Isken (Principal Management Engineer)",
      "Riz Sharalaya (Center for Clinical Innovation)",
      "Ron Connovich (President, Kettering Health Medical Group)"
    ],
    relevantFeedbackNextSteps: "Riz is conducting internal debrief. Need to follow up once LOI is ready.",
    statusUpdate: "Debrief in progress."
  },
  {
    id: "lurie",
    organization: "Lurie Children's Hospital",
    attendCount: null,
    preliminaryInterest: "Screening Scheduled",
    attendees: [],
    relevantFeedbackNextSteps: "Screening call scheduled for January 22.",
    statusUpdate: "Scheduling confirmed."
  },
  {
    id: "medstar",
    organization: "MedStar Health",
    attendCount: 7,
    preliminaryInterest: "Passing",
    attendees: [
      "Mike Maschek (Executive Director of Business Development)",
      "Paul Casey (Chief Medical Officer)"
    ],
    relevantFeedbackNextSteps: "Not likely to have bandwidth in 2026, concern about Epic overlap.",
    statusUpdate: "Passing for now."
  },
  {
    id: "northwestern",
    organization: "Northwestern Medicine",
    attendCount: 2,
    preliminaryInterest: "Interested - LOI Pending",
    attendees: [
      "Matt Fenty (Managing Director, Strategic Partnerships and Innovation)",
      "Charlie Sonday (Associate CMIO, AI Lead)"
    ],
    relevantFeedbackNextSteps: "Requested LOI draft and implementation expectations.",
    statusUpdate: "LOI draft requested."
  },
  {
    id: "stlukes",
    organization: "St. Luke's University Health Network",
    attendCount: 1,
    preliminaryInterest: "Need Follow-up",
    attendees: ["Alex Efron (Investments and Strategic Partnerships)"],
    relevantFeedbackNextSteps: "Need to follow up regarding interest.",
    statusUpdate: "Follow-up outreach queued."
  }
];

function interestPillClass(interest: PreliminaryInterest) {
  if (interest === "Passing") return "screening-status-red";
  if (interest === "Interested - LOI Pending" || interest === "Interested - Internal Debrief") {
    return "screening-status-green";
  }
  if (interest === "Need Follow-up" || interest === "Screening Scheduled") {
    return "screening-status-yellow";
  }
  return "screening-status-grey";
}

export function ScreeningDetailSlide6Mock() {
  const [rows, setRows] = React.useState<MockScreeningRow[]>(initialRows);
  const [selectedId, setSelectedId] = React.useState<string>(initialRows[0].id);

  const selectedRow = rows.find((row) => row.id === selectedId) || rows[0];

  function updateSelectedRow(patch: Partial<MockScreeningRow>) {
    setRows((current) =>
      current.map((row) => (row.id === selectedId ? { ...row, ...patch } : row))
    );
  }

  function attendeesText(row: MockScreeningRow) {
    return row.attendees.join("\n");
  }

  return (
    <main>
      <section className="hero">
        <div className="actions" style={{ marginTop: 0 }}>
          <Link href="/pipeline" className="top-nav-link top-nav-link-quiet">
            Back to Pipeline
          </Link>
        </div>
        <h1>Screening Detail Mock (Slide 6)</h1>
        <p>Static mock with editable fields for screening status tracking.</p>
      </section>

      <section className="panel">
        <h2>Alliance Screening Status</h2>
        <p className="muted">
          Mocked to mirror the slide layout while supporting data entry and modification.
        </p>

        <div className="screening-mock-layout">
          <div className="screening-overview-table-wrap">
            <table className="screening-overview-table">
              <thead>
                <tr>
                  <th scope="col">Organization</th>
                  <th scope="col">Attend? (#)</th>
                  <th scope="col">Preliminary Interest</th>
                  <th scope="col">Attendees</th>
                  <th scope="col">Relevant Feedback + Next Steps</th>
                  <th scope="col">Status Update</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const active = row.id === selectedId;
                  return (
                    <tr key={row.id} className={active ? "active" : undefined}>
                      <td>
                        <button
                          type="button"
                          className={`screening-overview-select ${active ? "active" : ""}`}
                          onClick={() => setSelectedId(row.id)}
                        >
                          {row.organization}
                        </button>
                      </td>
                      <td>
                        {row.attendCount === null ? (
                          <span className="muted">NA</span>
                        ) : (
                          <span className="screening-attendance-pill">{`\u25cf (${row.attendCount})`}</span>
                        )}
                      </td>
                      <td>
                        <span className={`screening-status-pill ${interestPillClass(row.preliminaryInterest)}`}>
                          {row.preliminaryInterest}
                        </span>
                      </td>
                      <td>
                        {row.attendees.length === 0 ? (
                          <span className="muted">No attendees listed</span>
                        ) : (
                          <div className="screening-attendee-list">
                            {row.attendees.map((attendee) => (
                              <p key={`${row.id}-${attendee}`}>{attendee}</p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <p className="screening-summary">{row.relevantFeedbackNextSteps}</p>
                      </td>
                      <td>
                        <p className="screening-summary">{row.statusUpdate}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <aside className="screening-mock-editor">
            <h3>Edit Selected Organization</h3>
            <p className="muted">{selectedRow.organization}</p>

            <label>Preliminary Interest</label>
            <select
              value={selectedRow.preliminaryInterest}
              onChange={(event) =>
                updateSelectedRow({
                  preliminaryInterest: event.target.value as PreliminaryInterest
                })
              }
            >
              {preliminaryInterestOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label>Attendance Count</label>
            <input
              type="number"
              min="0"
              value={selectedRow.attendCount ?? ""}
              placeholder="NA"
              onChange={(event) => {
                const value = event.target.value.trim();
                if (!value) {
                  updateSelectedRow({ attendCount: null });
                  return;
                }
                const numeric = Number(value);
                updateSelectedRow({ attendCount: Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : null });
              }}
            />

            <label>Attendees (one per line)</label>
            <textarea
              value={attendeesText(selectedRow)}
              onChange={(event) =>
                updateSelectedRow({
                  attendees: event.target.value
                    .split("\n")
                    .map((entry) => entry.trim())
                    .filter(Boolean)
                })
              }
            />

            <label>Relevant Feedback + Next Steps</label>
            <textarea
              value={selectedRow.relevantFeedbackNextSteps}
              onChange={(event) => updateSelectedRow({ relevantFeedbackNextSteps: event.target.value })}
            />

            <label>Status Update</label>
            <textarea
              value={selectedRow.statusUpdate}
              onChange={(event) => updateSelectedRow({ statusUpdate: event.target.value })}
            />
          </aside>
        </div>
      </section>
    </main>
  );
}
