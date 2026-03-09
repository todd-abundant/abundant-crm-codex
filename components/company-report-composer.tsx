"use client";

import * as React from "react";
import { RichTextArea } from "@/components/rich-text-area";
import { getJsonErrorMessage, readJsonResponse } from "@/lib/http-response";

type ReportType = "INTAKE" | "SCREENING" | "OPPORTUNITY";
type ReportStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type ReportSectionMode = "AUTO" | "OVERRIDE";

type ReportSummary = {
  id: string;
  companyId: string;
  type: ReportType;
  typeLabel: string;
  status: ReportStatus;
  templateVersion: number;
  title: string;
  subtitle: string | null;
  audienceLabel: string | null;
  confidentialityLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReportSection = {
  sectionId: string;
  label: string;
  description: string;
  mode: ReportSectionMode;
  isHidden: boolean;
  overrideTitle: string;
  overrideBodyHtml: string;
  autoTitle: string;
  autoBodyHtml: string;
  resolvedTitle: string;
  resolvedBodyHtml: string;
};

type ReportDetail = {
  id: string;
  companyId: string;
  type: ReportType;
  typeLabel: string;
  status: ReportStatus;
  templateVersion: number;
  title: string;
  subtitle: string | null;
  audienceLabel: string | null;
  confidentialityLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  publishedAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  sections: ReportSection[];
  renderedHtml: string;
};

type ReportDocument = {
  id: string;
  type: string;
  title: string;
  url: string;
  notes: string | null;
  uploadedAt: string;
};

const reportTypeOptions: Array<{ value: ReportType; label: string }> = [
  { value: "INTAKE", label: "Intake" },
  { value: "SCREENING", label: "Screening" },
  { value: "OPPORTUNITY", label: "Opportunity" }
];

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
}

export function CompanyReportComposer({
  companyId,
  companyName
}: {
  companyId: string;
  companyName: string;
}) {
  const [activeType, setActiveType] = React.useState<ReportType>("INTAKE");
  const [reports, setReports] = React.useState<ReportSummary[]>([]);
  const [selectedReportId, setSelectedReportId] = React.useState<string>("");
  const [report, setReport] = React.useState<ReportDetail | null>(null);
  const [selectedSectionId, setSelectedSectionId] = React.useState<string>("");
  const [loadingList, setLoadingList] = React.useState(false);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [lastExportedDocument, setLastExportedDocument] = React.useState<ReportDocument | null>(null);

  const selectedSection = React.useMemo(
    () => report?.sections.find((entry) => entry.sectionId === selectedSectionId) || null,
    [report, selectedSectionId]
  );

  const loadReportDetail = React.useCallback(
    async (reportId: string) => {
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/pipeline/opportunities/${companyId}/reports/${reportId}`, {
          cache: "no-store"
        });
        const payload = await readJsonResponse(res);
        if (!res.ok) {
          throw new Error(getJsonErrorMessage(payload, "Failed to load report detail."));
        }
        const nextReport = payload.report as ReportDetail;
        setReport(nextReport);
        setSelectedReportId(nextReport.id);
        setSelectedSectionId(nextReport.sections[0]?.sectionId || "");
        setError(null);
      } catch (detailError) {
        setReport(null);
        setSelectedSectionId("");
        setError(detailError instanceof Error ? detailError.message : "Failed to load report detail.");
      } finally {
        setLoadingDetail(false);
      }
    },
    [companyId]
  );

  const loadReports = React.useCallback(
    async (type: ReportType, preferredReportId?: string | null) => {
      setLoadingList(true);
      try {
        const res = await fetch(`/api/pipeline/opportunities/${companyId}/reports?type=${type}`, {
          cache: "no-store"
        });
        const payload = await readJsonResponse(res);
        if (!res.ok) {
          throw new Error(getJsonErrorMessage(payload, "Failed to load reports."));
        }
        const rows = (Array.isArray(payload.reports) ? payload.reports : []) as ReportSummary[];
        setReports(rows);
        const nextReportId = preferredReportId || rows[0]?.id || "";
        if (nextReportId) {
          await loadReportDetail(nextReportId);
        } else {
          setReport(null);
          setSelectedReportId("");
          setSelectedSectionId("");
        }
        setError(null);
      } catch (listError) {
        setError(listError instanceof Error ? listError.message : "Failed to load reports.");
      } finally {
        setLoadingList(false);
      }
    },
    [companyId, loadReportDetail]
  );

  React.useEffect(() => {
    void loadReports(activeType, null);
  }, [activeType, loadReports]);

  const setSection = React.useCallback(
    (sectionId: string, update: Partial<ReportSection>) => {
      setReport((current) => {
        if (!current) return current;
        return {
          ...current,
          sections: current.sections.map((entry) =>
            entry.sectionId === sectionId ? { ...entry, ...update } : entry
          )
        };
      });
    },
    []
  );

  const setMetadata = React.useCallback((update: Partial<ReportDetail>) => {
    setReport((current) => {
      if (!current) return current;
      return { ...current, ...update };
    });
  }, []);

  const createDraft = React.useCallback(async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${companyId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeType
        })
      });
      const payload = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to create report draft."));
      }
      const created = payload.report as ReportDetail;
      setStatus("Report draft created.");
      setLastExportedDocument(null);
      await loadReports(activeType, created.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create report draft.");
    } finally {
      setBusy(false);
    }
  }, [activeType, companyId, loadReports]);

  const saveDraft = React.useCallback(async () => {
    if (!report) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${companyId}/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: report.updatedAt,
          title: report.title,
          subtitle: report.subtitle,
          audienceLabel: report.audienceLabel,
          confidentialityLabel: report.confidentialityLabel,
          periodStart: report.periodStart,
          periodEnd: report.periodEnd,
          sectionState: report.sections.map((entry) => ({
            sectionId: entry.sectionId,
            mode: entry.mode,
            isHidden: entry.isHidden,
            overrideTitle: entry.overrideTitle,
            overrideBodyHtml: entry.overrideBodyHtml
          }))
        })
      });
      const payload = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to save draft."));
      }
      const updated = payload.report as ReportDetail;
      setReport(updated);
      setSelectedSectionId(updated.sections.find((entry) => entry.sectionId === selectedSectionId)?.sectionId || updated.sections[0]?.sectionId || "");
      setStatus("Draft saved.");
      setError(null);
      await loadReports(activeType, updated.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save draft.");
    } finally {
      setBusy(false);
    }
  }, [activeType, companyId, loadReports, report, selectedSectionId]);

  const refreshFromLatestData = React.useCallback(async () => {
    if (!report) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${companyId}/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: report.updatedAt,
          title: report.title,
          subtitle: report.subtitle,
          audienceLabel: report.audienceLabel,
          confidentialityLabel: report.confidentialityLabel,
          periodStart: report.periodStart,
          periodEnd: report.periodEnd,
          sectionState: report.sections.map((entry) => ({
            sectionId: entry.sectionId,
            mode: entry.mode,
            isHidden: entry.isHidden,
            overrideTitle: entry.overrideTitle,
            overrideBodyHtml: entry.overrideBodyHtml
          })),
          refreshFromLatestData: true
        })
      });
      const payload = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to refresh source data."));
      }
      const updated = payload.report as ReportDetail;
      setReport(updated);
      setStatus("Refreshed from latest company data.");
      setError(null);
      await loadReports(activeType, updated.id);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to refresh source data.");
    } finally {
      setBusy(false);
    }
  }, [activeType, companyId, loadReports, report]);

  const resetOverrides = React.useCallback(async () => {
    if (!report) return;
    if (!window.confirm("Reset all section overrides back to AUTO content?")) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${companyId}/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: report.updatedAt,
          title: report.title,
          subtitle: report.subtitle,
          audienceLabel: report.audienceLabel,
          confidentialityLabel: report.confidentialityLabel,
          periodStart: report.periodStart,
          periodEnd: report.periodEnd,
          sectionState: report.sections.map((entry) => ({
            sectionId: entry.sectionId,
            mode: entry.mode,
            isHidden: entry.isHidden,
            overrideTitle: entry.overrideTitle,
            overrideBodyHtml: entry.overrideBodyHtml
          })),
          resetOverrides: true
        })
      });
      const payload = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to reset overrides."));
      }
      const updated = payload.report as ReportDetail;
      setReport(updated);
      setSelectedSectionId(updated.sections[0]?.sectionId || "");
      setStatus("All overrides reset.");
      setError(null);
      await loadReports(activeType, updated.id);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Failed to reset overrides.");
    } finally {
      setBusy(false);
    }
  }, [activeType, companyId, loadReports, report]);

  const previewReport = React.useCallback(async () => {
    if (!report) return;
    setBusy(true);
    setStatus(null);
    try {
      const saveRes = await fetch(`/api/pipeline/opportunities/${companyId}/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: report.updatedAt,
          title: report.title,
          subtitle: report.subtitle,
          audienceLabel: report.audienceLabel,
          confidentialityLabel: report.confidentialityLabel,
          periodStart: report.periodStart,
          periodEnd: report.periodEnd,
          sectionState: report.sections.map((entry) => ({
            sectionId: entry.sectionId,
            mode: entry.mode,
            isHidden: entry.isHidden,
            overrideTitle: entry.overrideTitle,
            overrideBodyHtml: entry.overrideBodyHtml
          }))
        })
      });
      const savePayload = await readJsonResponse(saveRes);
      if (!saveRes.ok) {
        throw new Error(getJsonErrorMessage(savePayload, "Failed to save report before preview."));
      }

      const previewRes = await fetch(`/api/pipeline/opportunities/${companyId}/reports/${report.id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const previewPayload = await readJsonResponse(previewRes);
      if (!previewRes.ok) {
        throw new Error(getJsonErrorMessage(previewPayload, "Failed to generate preview."));
      }
      const previewDetail = previewPayload.report as ReportDetail;
      setReport(previewDetail);
      setStatus("Preview refreshed.");
      setError(null);
      await loadReports(activeType, previewDetail.id);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Failed to generate preview.");
    } finally {
      setBusy(false);
    }
  }, [activeType, companyId, loadReports, report]);

  const exportPdf = React.useCallback(async () => {
    if (!report) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${companyId}/reports/${report.id}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const payload = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to export PDF."));
      }
      const nextReport = payload.report as ReportDetail;
      const document = payload.document as ReportDocument;
      setReport(nextReport);
      setLastExportedDocument(document);
      setStatus("PDF exported and saved in company documents.");
      setError(null);
      await loadReports(activeType, nextReport.id);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export PDF.");
    } finally {
      setBusy(false);
    }
  }, [activeType, companyId, loadReports, report]);

  const publishReport = React.useCallback(async () => {
    if (!report) return;
    if (!window.confirm("Publish this report and lock it as immutable?")) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${companyId}/reports/${report.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const payload = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to publish report."));
      }
      const nextReport = payload.report as ReportDetail;
      const document = payload.document as ReportDocument;
      setReport(nextReport);
      setLastExportedDocument(document);
      setStatus("Report published. This version is now immutable.");
      setError(null);
      await loadReports(activeType, nextReport.id);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Failed to publish report.");
    } finally {
      setBusy(false);
    }
  }, [activeType, companyId, loadReports, report]);

  return (
    <div className="report-composer">
      <div className="report-composer-toolbar">
        <div className="report-type-tabs" role="tablist" aria-label="Report type">
          {reportTypeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`report-type-tab ${activeType === option.value ? "active" : ""}`}
              onClick={() => {
                setActiveType(option.value);
                setStatus(null);
                setError(null);
                setLastExportedDocument(null);
              }}
              disabled={busy}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="actions">
          <button type="button" className="secondary small" onClick={() => void createDraft()} disabled={busy}>
            {busy ? "Working..." : `Create ${reportTypeOptions.find((entry) => entry.value === activeType)?.label} Draft`}
          </button>
          <button type="button" className="ghost small" onClick={() => void saveDraft()} disabled={busy || !report}>
            Save Draft
          </button>
          <button
            type="button"
            className="ghost small"
            onClick={() => void refreshFromLatestData()}
            disabled={busy || !report || report.status !== "DRAFT"}
          >
            Refresh from Latest Data
          </button>
          <button
            type="button"
            className="ghost small"
            onClick={() => void resetOverrides()}
            disabled={busy || !report || report.status !== "DRAFT"}
          >
            Reset Overrides
          </button>
          <button type="button" className="ghost small" onClick={() => void previewReport()} disabled={busy || !report}>
            Preview
          </button>
          <button type="button" className="ghost small" onClick={() => void exportPdf()} disabled={busy || !report}>
            Export PDF
          </button>
          <button
            type="button"
            className="primary small"
            onClick={() => void publishReport()}
            disabled={busy || !report || report.status !== "DRAFT"}
          >
            Publish
          </button>
        </div>
      </div>

      {loadingList ? <p className="muted">Loading reports...</p> : null}
      {error ? <p className="status error">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}
      {lastExportedDocument ? (
        <p className="muted">
          Latest artifact:{" "}
          <a href={lastExportedDocument.url} target="_blank" rel="noreferrer">
            {lastExportedDocument.title}
          </a>
        </p>
      ) : null}

      <div className="report-composer-layout">
        <aside className="report-composer-column report-composer-column-left">
          <h3>{companyName}</h3>
          <p className="muted">{reportTypeOptions.find((entry) => entry.value === activeType)?.label} drafts and versions</p>
          {reports.length === 0 ? <p className="muted">No reports yet for this type.</p> : null}
          <div className="report-card-list">
            {reports.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`report-card ${selectedReportId === entry.id ? "active" : ""}`}
                onClick={() => void loadReportDetail(entry.id)}
                disabled={busy}
              >
                <strong>{entry.title}</strong>
                <span>{entry.status}</span>
                <span className="muted">Updated {formatDate(entry.updatedAt)}</span>
              </button>
            ))}
          </div>
          {report?.sections?.length ? (
            <>
              <h4>Sections</h4>
              <div className="report-section-list">
                {report.sections.map((entry) => (
                  <button
                    key={`${report.id}:${entry.sectionId}`}
                    type="button"
                    className={`report-section-item ${selectedSectionId === entry.sectionId ? "active" : ""}`}
                    onClick={() => setSelectedSectionId(entry.sectionId)}
                  >
                    <span>{entry.label}</span>
                    <small>{entry.mode}{entry.isHidden ? " | Hidden" : ""}</small>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </aside>

        <section className="report-composer-column report-composer-column-center">
          {loadingDetail ? <p className="muted">Loading report detail...</p> : null}
          {!loadingDetail && !report ? <p className="muted">Create or select a report to start editing.</p> : null}
          {report ? (
            <>
              <div className="report-meta-grid">
                <div>
                  <label>Title</label>
                  <input
                    value={report.title}
                    onChange={(event) => setMetadata({ title: event.target.value })}
                    disabled={report.status !== "DRAFT"}
                  />
                </div>
                <div>
                  <label>Subtitle</label>
                  <input
                    value={report.subtitle || ""}
                    onChange={(event) => setMetadata({ subtitle: event.target.value || null })}
                    disabled={report.status !== "DRAFT"}
                  />
                </div>
                <div>
                  <label>Audience</label>
                  <input
                    value={report.audienceLabel || ""}
                    onChange={(event) => setMetadata({ audienceLabel: event.target.value || null })}
                    disabled={report.status !== "DRAFT"}
                  />
                </div>
                <div>
                  <label>Confidentiality</label>
                  <input
                    value={report.confidentialityLabel || ""}
                    onChange={(event) => setMetadata({ confidentialityLabel: event.target.value || null })}
                    disabled={report.status !== "DRAFT"}
                  />
                </div>
                <div>
                  <label>Period Start</label>
                  <input
                    type="date"
                    value={toDateInputValue(report.periodStart)}
                    onChange={(event) => setMetadata({ periodStart: event.target.value || null })}
                    disabled={report.status !== "DRAFT"}
                  />
                </div>
                <div>
                  <label>Period End</label>
                  <input
                    type="date"
                    value={toDateInputValue(report.periodEnd)}
                    onChange={(event) => setMetadata({ periodEnd: event.target.value || null })}
                    disabled={report.status !== "DRAFT"}
                  />
                </div>
              </div>

              <div className="muted">
                Status: {report.status} | Updated {formatDate(report.updatedAt)} | Published {formatDate(report.publishedAt)}
              </div>

              {selectedSection ? (
                <div className="report-section-editor">
                  <h3>{selectedSection.label}</h3>
                  <p className="muted">{selectedSection.description}</p>
                  <div className="report-section-controls">
                    <div>
                      <label>Mode</label>
                      <select
                        value={selectedSection.mode}
                        onChange={(event) =>
                          setSection(selectedSection.sectionId, {
                            mode: event.target.value as ReportSectionMode
                          })
                        }
                        disabled={report.status !== "DRAFT"}
                      >
                        <option value="AUTO">AUTO</option>
                        <option value="OVERRIDE">OVERRIDE</option>
                      </select>
                    </div>
                    <div className="report-checkbox-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedSection.isHidden}
                          onChange={(event) =>
                            setSection(selectedSection.sectionId, {
                              isHidden: event.target.checked
                            })
                          }
                          disabled={report.status !== "DRAFT"}
                        />{" "}
                        Hide Section
                      </label>
                    </div>
                  </div>

                  <label>Override Title</label>
                  <input
                    value={selectedSection.overrideTitle}
                    onChange={(event) =>
                      setSection(selectedSection.sectionId, {
                        overrideTitle: event.target.value
                      })
                    }
                    disabled={report.status !== "DRAFT" || selectedSection.mode !== "OVERRIDE"}
                    placeholder={selectedSection.autoTitle}
                  />

                  <label>Override Body</label>
                  <RichTextArea
                    value={selectedSection.overrideBodyHtml}
                    onChange={(nextValue) =>
                      setSection(selectedSection.sectionId, {
                        overrideBodyHtml: nextValue
                      })
                    }
                    disabled={report.status !== "DRAFT" || selectedSection.mode !== "OVERRIDE"}
                    rows={10}
                    placeholder="Enter custom section content..."
                  />

                  <details className="report-auto-preview">
                    <summary>View AUTO content for this section</summary>
                    <div
                      className="inline-rich-text"
                      dangerouslySetInnerHTML={{
                        __html: selectedSection.autoBodyHtml
                      }}
                    />
                  </details>
                </div>
              ) : (
                <p className="muted">Select a section to edit.</p>
              )}
            </>
          ) : null}
        </section>

        <section className="report-composer-column report-composer-column-right">
          <h3>Live Preview</h3>
          {!report ? <p className="muted">Create or select a report to preview.</p> : null}
          {report ? (
            <iframe
              title="Company report preview"
              className="report-preview-frame"
              srcDoc={report.renderedHtml}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
