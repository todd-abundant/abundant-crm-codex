"use client";

import * as React from "react";

type CompanyOption = {
  id: string;
  name: string;
};

type HealthSystemOption = {
  id: string;
  name: string;
  website: string | null;
};

type ParticipantRole = "ABUNDANT" | "COMPANY" | "MEMBER" | "UNKNOWN";
type ScreeningFeedbackSentiment = "POSITIVE" | "MIXED" | "NEUTRAL" | "NEGATIVE";
type Stage = "setup" | "classify" | "quotes";

type ParticipantClassification = {
  speakerName: string;
  role: ParticipantRole;
  healthSystemId: string;
};

type QuoteItem = {
  id: string;
  speakerName: string;
  excerpt: string;
  speaker_org?: string;
  quote?: string;
  type?: "question" | "comment";
  sentiment_rationale?: string;
  specificity_score?: number;
  why_selected?: string;
  sentiment: ScreeningFeedbackSentiment;
  theme: string;
  isQuestion: boolean;
  lineNumber: number;
  timestampSeconds: number | null;
  timestampLabel: string | null;
  healthSystemId: string;
};

type AnalyzeSummary = {
  mode: "participants" | "quotes";
  speakersParsed: number;
  participantsReturned: number;
  membersClassified: number;
  quotesReturned: number;
};

type AnalyzeResponse = {
  summary: AnalyzeSummary;
  participantClassifications?: ParticipantClassification[];
  quotes?: QuoteItem[];
  warnings: string[];
  themes?: {
    name: string;
    definition: string;
  }[];
  error?: string;
};

type DraftQuote = QuoteItem & {
  include: boolean;
};

type SaveResponse = {
  createdCount: number;
  attribution: {
    linkedByProvidedContactCount: number;
    linkedByNameMatchCount: number;
    unlinkedCount: number;
  };
  error?: string;
};

type StatusState = {
  kind: "ok" | "error" | "info";
  text: string;
} | null;

type AnalysisProgressState = {
  mode: AnalysisProgressMode;
  title: string;
  detail: string;
  phase: string;
  estimatedMs: number;
  percent: number;
};

type AnalysisProgressMode = "identify" | "quotes";

type PhaseTimingStats = {
  averageMs: number;
  sampleCount: number;
};

type AnalysisProgressTimingStore = Record<string, PhaseTimingStats>;

type AnalysisProgressPhaseOptions = {
  phase: string;
  fallbackDurationMs: number;
};

const ANALYSIS_PROGRESS_STORAGE_KEY = "transcript-member-insights-progress-timing-v1";

const ANALYSIS_PROGRESS_PHASE_DEFAULTS: Record<AnalysisProgressMode, Record<string, number>> = {
  identify: {
    "identify-prep": 15000,
    "identify-match": 90000,
    "identify-enrich": 23000,
    "identify-done": 14000
  },
  quotes: {
    "quotes-prep": 7000,
    "quotes-extract": 32000,
    "quotes-score": 10000,
    "quotes-done": 7000
  }
};

const ANALYSIS_PROGRESS_PHASE_LABELS: Record<AnalysisProgressMode, Record<string, string>> = {
  identify: {
    "identify-prep": "Preparing transcript for AI parsing",
    "identify-match": "Matching participants to the roster",
    "identify-enrich": "Applying role suggestions",
    "identify-done": "Ready for classification"
  },
  quotes: {
    "quotes-prep": "Preparing quote extraction input",
    "quotes-extract": "Extracting relevant quotes",
    "quotes-score": "Scoring sentiment and themes",
    "quotes-done": "Preparing quote review"
  }
};

const ANALYSIS_PROGRESS_PHASE_ORDER: Record<AnalysisProgressMode, string[]> = {
  identify: ["identify-prep", "identify-match", "identify-enrich", "identify-done"],
  quotes: ["quotes-prep", "quotes-extract", "quotes-score", "quotes-done"]
};

function clampProgressPercent(percent: number) {
  return Math.max(0, Math.min(100, percent));
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function buildProgressTimingStorageKey(mode: AnalysisProgressMode, phase: string) {
  return `${mode}:${phase}`;
}

function sanitizeTimingStore(raw: unknown): AnalysisProgressTimingStore {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const sanitized: AnalysisProgressTimingStore = {};
  const record = raw as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== "object") continue;
    const stats = value as Record<string, unknown>;
    const averageMs = Number(stats.averageMs);
    const sampleCount = Number(stats.sampleCount);
    if (!Number.isFinite(averageMs) || !Number.isFinite(sampleCount)) continue;
    if (averageMs <= 0 || sampleCount <= 0) continue;
    sanitized[key] = {
      averageMs,
      sampleCount
    };
  }

  return sanitized;
}

function loadAnalysisProgressTimingsFromStorage(): AnalysisProgressTimingStore {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(ANALYSIS_PROGRESS_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as unknown;
    return sanitizeTimingStore(parsed);
  } catch {
    return {};
  }
}

async function parseJsonResponse<T>(response: Response): Promise<{ ok: boolean; payload: T }> {
  const body = await response.text();
  try {
    return { ok: response.ok, payload: JSON.parse(body) as T };
  } catch {
    throw new Error(
      `Server returned non-JSON response (${response.status}). First bytes: ${body.slice(0, 220).replace(/\s+/g, " ")}`
    );
  }
}

function saveAnalysisProgressTimingsToStorage(store: AnalysisProgressTimingStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANALYSIS_PROGRESS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage failures
  }
}

type HealthSystemLookupMap = Record<string, string>;

function normalizeHealthSystemLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sortHealthSystemsByName(healthSystems: HealthSystemOption[]): HealthSystemOption[] {
  return [...healthSystems].sort((a, b) => a.name.localeCompare(b.name));
}

type HealthSystemLookupProps = {
  lookupId: string;
  selectedId: string;
  systems: HealthSystemOption[];
  disabled: boolean;
  value: string;
  onSearchValueChange: (value: string) => void;
  onSelect: (healthSystemId: string) => void;
  onCreate: (name: string) => Promise<HealthSystemOption | null>;
};

function HealthSystemLookup({
  lookupId,
  selectedId,
  systems,
  disabled,
  value,
  onSearchValueChange,
  onSelect,
  onCreate
}: HealthSystemLookupProps) {
  const [searchValue, setSearchValue] = React.useState(value);

  React.useEffect(() => {
    setSearchValue(value);
  }, [value]);

  const selectedName = React.useMemo(() => {
    return systems.find((entry) => entry.id === selectedId)?.name || "";
  }, [selectedId, systems]);

  const normalizedValue = React.useMemo(() => normalizeHealthSystemLookup(searchValue), [searchValue]);
  const exactMatch = systems.find(
    (entry) => normalizeHealthSystemLookup(entry.name) === normalizedValue
  );

  const hasNoMatch = Boolean(searchValue.trim()) && !exactMatch;
  const filtered = systems.filter((entry) => {
    const normalizedName = normalizeHealthSystemLookup(entry.name);
    if (!normalizedValue) return true;
    return normalizedName.includes(normalizedValue);
  });

  async function createHealthSystem() {
    const created = await onCreate(searchValue);
    if (!created) {
      return;
    }

    onSelect(created.id);
    setSearchValue(created.name);
    onSearchValueChange(created.name);
  }

  return (
    <div className="health-system-lookup">
      <div className="health-system-search-row">
        <input
          type="text"
          list={lookupId}
          placeholder="Type to find health system"
          value={searchValue}
          onChange={(event) => {
            const nextValue = event.target.value;
            setSearchValue(nextValue);
            onSearchValueChange(nextValue);

        const directMatch = systems.find(
          (entry) => normalizeHealthSystemLookup(entry.name) === normalizeHealthSystemLookup(nextValue)
        );
        if (!nextValue) {
          onSelect("");
          return;
        }

        if (directMatch) {
          if (selectedId !== directMatch.id) {
            onSelect(directMatch.id);
          }
          return;
        }
          }}
          onBlur={() => {
            if (selectedId && !exactMatch) {
              onSelect("");
            }
          }}
          disabled={disabled}
        />
        <datalist id={lookupId}>
          {filtered.map((healthSystem) => (
            <option key={healthSystem.id} value={healthSystem.name} />
          ))}
        </datalist>
        {hasNoMatch ? (
          <button
            type="button"
            className="secondary"
            onClick={() => void createHealthSystem()}
            disabled={disabled || !searchValue.trim()}
          >
            Create New
          </button>
        ) : null}
      </div>
      {selectedId ? <div className="muted">Selected: {selectedName}</div> : null}
      {hasNoMatch ? <div className="muted health-system-empty">No exact match. Create to add a new health system.</div> : null}
      {filtered.length === 0 && !hasNoMatch ? <div className="muted health-system-empty">No matches.</div> : null}
    </div>
  );
}

function sentimentLabel(sentiment: ScreeningFeedbackSentiment) {
  if (sentiment === "POSITIVE") return "Positive";
  if (sentiment === "NEGATIVE") return "Negative";
  if (sentiment === "MIXED") return "Mixed";
  return "Neutral";
}

export default function TranscriptMemberInsightsTestPage() {
  const [loadingOptions, setLoadingOptions] = React.useState(true);
  const [companies, setCompanies] = React.useState<CompanyOption[]>([]);
  const [healthSystems, setHealthSystems] = React.useState<HealthSystemOption[]>([]);

  const [participantHealthSystemSearch, setParticipantHealthSystemSearch] = React.useState<HealthSystemLookupMap>({});
  const [quoteHealthSystemSearch, setQuoteHealthSystemSearch] = React.useState<HealthSystemLookupMap>({});

  const [companyId, setCompanyId] = React.useState("");
  const [transcript, setTranscript] = React.useState("");

  const [stage, setStage] = React.useState<Stage>("setup");
  const [participantClassifications, setParticipantClassifications] = React.useState<ParticipantClassification[]>([]);
  const [draftQuotes, setDraftQuotes] = React.useState<DraftQuote[]>([]);

  const [runningAnalysis, setRunningAnalysis] = React.useState(false);
  const [savingInsights, setSavingInsights] = React.useState(false);
  const [status, setStatus] = React.useState<StatusState>(null);
  const [analysisProgress, setAnalysisProgress] = React.useState<AnalysisProgressState | null>(null);
  const analysisProgressPercentRef = React.useRef(0);
  const analysisProgressAnimationRef = React.useRef<number | null>(null);
  const activeProgressPhaseRef = React.useRef<{
    mode: AnalysisProgressMode;
    phase: string;
    startedAt: number;
    estimatedDurationMs: number;
  } | null>(null);
  const progressTimingRef = React.useRef<AnalysisProgressTimingStore>(loadAnalysisProgressTimingsFromStorage());
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [, setSummary] = React.useState<AnalyzeSummary | null>(null);

  const selectedCount = React.useMemo(() => draftQuotes.filter((entry) => entry.include).length, [draftQuotes]);
  const selectedWithoutHealthSystem = React.useMemo(
    () => draftQuotes.filter((entry) => entry.include && !entry.healthSystemId).length,
    [draftQuotes]
  );

  const healthSystemNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const healthSystem of healthSystems) {
      map.set(healthSystem.id, healthSystem.name);
    }
    return map;
  }, [healthSystems]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const response = await fetch("/api/tests/zoom-webinars/options", { cache: "no-store" });
        const payload = (await response.json()) as {
          companies?: CompanyOption[];
          healthSystems?: HealthSystemOption[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Failed to load options.");
        }

        if (cancelled) return;

        const companyOptions = Array.isArray(payload.companies) ? payload.companies : [];
        const healthSystemOptions = Array.isArray(payload.healthSystems) ? payload.healthSystems : [];
        setCompanies(companyOptions);
        setHealthSystems(sortHealthSystemsByName(healthSystemOptions));
        setCompanyId((current) => current || companyOptions[0]?.id || "");
      } catch (error) {
        if (cancelled) return;
        setStatus({ kind: "error", text: error instanceof Error ? error.message : "Failed to load options." });
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    }

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  const unresolvedMembers = React.useMemo(
    () => participantClassifications.filter((entry) => entry.role === "MEMBER" && !entry.healthSystemId).length,
    [participantClassifications]
  );

  const unresolvedClassifications = React.useMemo(
    () => participantClassifications.filter((entry) => entry.role === "UNKNOWN").length,
    [participantClassifications]
  );

  const orderedParticipantClassifications = React.useMemo(
    () =>
      participantClassifications
        .map((entry, index) => ({
          entry,
          originalIndex: index,
          sortKey: entry.role === "MEMBER" ? 0 : entry.role === "UNKNOWN" ? 1 : entry.role === "COMPANY" ? 2 : 3
        }))
        .sort((a, b) => {
          if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
          return a.entry.speakerName.localeCompare(b.entry.speakerName);
        }),
    [participantClassifications]
  );

  function getHealthSystemNameById(systemId: string) {
    return healthSystemNameById.get(systemId) || "";
  }

  React.useEffect(() => {
    if (!analysisProgress) return;
    analysisProgressPercentRef.current = analysisProgress.percent;
  }, [analysisProgress]);

function getAdaptivePhaseDuration(mode: AnalysisProgressMode, phase: string, fallbackMs: number) {
  const key = buildProgressTimingStorageKey(mode, phase);
  const timing = progressTimingRef.current[key];
  if (!timing || timing.sampleCount < 1 || !timing.averageMs) {
    return fallbackMs;
  }
  return Math.max(1000, Math.min(120000, timing.averageMs));
}

function recordProgressPhaseTiming(mode: AnalysisProgressMode, phase: string, elapsedMs: number) {
  const clampedElapsed = Math.max(700, Math.min(120000, elapsedMs));
    const key = buildProgressTimingStorageKey(mode, phase);
    const existing = progressTimingRef.current[key];

    if (!existing) {
      progressTimingRef.current[key] = {
        averageMs: clampedElapsed,
        sampleCount: 1
      };
      saveAnalysisProgressTimingsToStorage(progressTimingRef.current);
      return;
    }

    const nextCount = existing.sampleCount + 1;
    const nextAverage = existing.averageMs * (existing.sampleCount / nextCount) + clampedElapsed / nextCount;
    progressTimingRef.current[key] = {
      averageMs: nextAverage,
      sampleCount: nextCount
    };
    saveAnalysisProgressTimingsToStorage(progressTimingRef.current);
  }

  function finalizeActiveProgressPhase() {
    if (!activeProgressPhaseRef.current) return;
    const elapsedMs = nowMs() - activeProgressPhaseRef.current.startedAt;
    recordProgressPhaseTiming(activeProgressPhaseRef.current.mode, activeProgressPhaseRef.current.phase, elapsedMs);
    activeProgressPhaseRef.current = null;
  }

  function clearProgressAnimation() {
    if (!analysisProgressAnimationRef.current) return;
    cancelAnimationFrame(analysisProgressAnimationRef.current);
    analysisProgressAnimationRef.current = null;
  }

  function animateProgressTo({
    mode,
    title,
    detail,
    targetPercent,
    phase,
    fallbackDurationMs
  }: {
    mode: AnalysisProgressMode;
    title: string;
    detail: string;
    targetPercent: number;
    phase: string;
    fallbackDurationMs: number;
  }) {
    const normalizedTargetPercent = clampProgressPercent(targetPercent);
    const durationMs = getAdaptivePhaseDuration(mode, phase, fallbackDurationMs);
    finalizeActiveProgressPhase();
    activeProgressPhaseRef.current = {
      mode,
      phase,
      startedAt: nowMs(),
      estimatedDurationMs: durationMs
    };

    clearProgressAnimation();
    const startPercent = clampProgressPercent(analysisProgressPercentRef.current);
    const startAt = nowMs();

    if (startPercent === normalizedTargetPercent) {
      setAnalysisProgress((current) =>
        current
          ? {
              ...current,
              mode,
              title,
              detail,
              phase,
              estimatedMs: durationMs,
              percent: normalizedTargetPercent
            }
          : {
              mode,
              title,
              detail,
              phase,
              estimatedMs: durationMs,
              percent: normalizedTargetPercent
            }
      );
      analysisProgressPercentRef.current = normalizedTargetPercent;
      return;
    }

    const tick = () => {
      const elapsed = nowMs() - startAt;
      const ratio = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - ratio, 2);
      const nextPercent = startPercent + (normalizedTargetPercent - startPercent) * eased;
      setAnalysisProgress((current) =>
        current
          ? {
              ...current,
              mode,
              title,
              detail,
              phase,
              estimatedMs: durationMs,
              percent: nextPercent
            }
          : {
              mode,
              title,
              detail,
              phase,
              estimatedMs: durationMs,
              percent: nextPercent
            }
      );
      analysisProgressPercentRef.current = nextPercent;
      if (ratio < 1) {
        analysisProgressAnimationRef.current = requestAnimationFrame(tick);
      } else {
        analysisProgressAnimationRef.current = null;
      }
    };

    analysisProgressAnimationRef.current = requestAnimationFrame(tick);
  }

  function openAnalysisProgress(
    mode: AnalysisProgressMode,
    title: string,
    detail: string,
    percent: number,
    options: AnalysisProgressPhaseOptions
  ) {
    animateProgressTo({
      mode,
      title,
      detail,
      targetPercent: percent,
      phase: options.phase,
      fallbackDurationMs: options.fallbackDurationMs
    });
  }

  function updateAnalysisProgress(
    mode: AnalysisProgressMode,
    detail: string,
    percent: number,
    options: AnalysisProgressPhaseOptions
  ) {
    animateProgressTo({
      mode,
      title: analysisProgress?.title || "Transcript Analysis",
      detail,
      targetPercent: percent,
      phase: options.phase,
      fallbackDurationMs: options.fallbackDurationMs
    });
  }

  async function createHealthSystemAndAssign(name: string): Promise<HealthSystemOption | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const normalized = normalizeHealthSystemLookup(trimmed);
    const alreadyExists = healthSystems.find((entry) => normalizeHealthSystemLookup(entry.name) === normalized);
    if (alreadyExists) return alreadyExists;

    const response = await fetch("/api/health-systems", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed })
    });

    const payload = (await response.json()) as { healthSystem?: HealthSystemOption; error?: string };
    if (!response.ok) {
      throw new Error(payload.error || "Failed to create health system.");
    }

    const created = payload.healthSystem
      ? {
          id: payload.healthSystem.id,
          name: payload.healthSystem.name,
          website: payload.healthSystem.website || null
        }
      : null;

    if (!created) return null;

    setHealthSystems((current) => sortHealthSystemsByName([...current, created]));
    return created;
  }

  function closeAnalysisProgress() {
    finalizeActiveProgressPhase();
    clearProgressAnimation();
    setAnalysisProgress(null);
  }

  function buildPayloadClassifications() {
    return participantClassifications.map((entry) => ({
      speakerName: entry.speakerName,
      role: entry.role,
      healthSystemId: entry.healthSystemId || null
    }));
  }

  function resetToSetup() {
    setStage("setup");
    setParticipantClassifications([]);
    setDraftQuotes([]);
    setWarnings([]);
    setSummary(null);
    setParticipantHealthSystemSearch({});
    setQuoteHealthSystemSearch({});
  }

  function updateParticipantClassification(index: number, patch: Partial<ParticipantClassification>) {
    setParticipantClassifications((current) =>
      current.map((entry, currentIndex) => {
        if (currentIndex !== index) return entry;
        if (patch.role && patch.role !== "MEMBER") {
          return { ...entry, role: patch.role, healthSystemId: "" };
        }
        if (patch.healthSystemId !== undefined) {
          return { ...entry, healthSystemId: patch.healthSystemId || "" };
        }
        return { ...entry, ...patch };
      })
    );
    setSummary(null);
    setDraftQuotes([]);
  }

  function updateQuote(id: string, include: boolean) {
    setDraftQuotes((current) =>
      current.map((entry) => {
        if (entry.id !== id) return entry;
        return { ...entry, include };
      })
    );
  }

  function updateQuoteHealthSystem(id: string, healthSystemId: string) {
    setDraftQuotes((current) =>
      current.map((entry) => {
        if (entry.id !== id) return entry;
        return { ...entry, healthSystemId };
      })
    );
  }

  function updateAllQuotes(nextValue: boolean) {
    setDraftQuotes((current) => current.map((entry) => ({ ...entry, include: nextValue })));
  }

  async function identifyParticipants(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!companyId) {
      setStatus({ kind: "error", text: "Select a company first." });
      return;
    }

    if (transcript.trim().length < 20) {
      setStatus({ kind: "error", text: "Paste a transcript first." });
      return;
    }

    setRunningAnalysis(true);
    setStatus({ kind: "info", text: "Identifying participants from transcript with AI." });
    setWarnings([]);
    setDraftQuotes([]);
    setSummary(null);
    openAnalysisProgress(
      "identify",
      "Identifying participants",
      "Sending transcript to AI for participant extraction...",
      15,
      {
        phase: "identify-prep",
        fallbackDurationMs: ANALYSIS_PROGRESS_PHASE_DEFAULTS.identify["identify-prep"]
      }
    );

    try {
      updateAnalysisProgress(
        "identify",
        "Matching participants to Abundant roster and contacts...",
        35,
        {
          phase: "identify-match",
          fallbackDurationMs: ANALYSIS_PROGRESS_PHASE_DEFAULTS.identify["identify-match"]
        }
      );
      const response = await fetch("/api/tests/transcript-member-insights/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          transcript,
          maxInsights: 80
        })
      });

      const { payload } = await parseJsonResponse<AnalyzeResponse>(response);
      if (!response.ok) {
        throw new Error(payload.error || "Failed to identify participants.");
      }
      updateAnalysisProgress(
        "identify",
        "Applying AI role suggestions to your participant list...",
        75,
        {
          phase: "identify-enrich",
          fallbackDurationMs: ANALYSIS_PROGRESS_PHASE_DEFAULTS.identify["identify-enrich"]
        }
      );

      const suggestions = Array.isArray(payload.participantClassifications)
        ? payload.participantClassifications
        : [];
      setParticipantClassifications(
        suggestions.map((entry) => ({
          speakerName: entry.speakerName,
          role: entry.role,
          healthSystemId: entry.healthSystemId || ""
        }))
      );
      const initialSearchTerms = suggestions.reduce<Record<string, string>>((acc, entry, index) => {
        acc[String(index)] = entry.healthSystemId ? getHealthSystemNameById(entry.healthSystemId) || "" : "";
        return acc;
      }, {});
      setParticipantHealthSystemSearch(initialSearchTerms);
      setSummary(payload.summary || null);
      setWarnings(payload.warnings || []);
      updateAnalysisProgress(
        "identify",
        "Preparing classification screen...",
        100,
        {
          phase: "identify-done",
          fallbackDurationMs: ANALYSIS_PROGRESS_PHASE_DEFAULTS.identify["identify-done"]
        }
      );
      setStage("classify");
      setStatus({
        kind: "ok",
        text: `Found ${suggestions.length} participants. Mark each as Abundant / Company / Health System member.`
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to identify participants."
      });
    } finally {
      setRunningAnalysis(false);
      closeAnalysisProgress();
    }
  }

  async function extractMemberQuotes() {
    if (!participantClassifications.length) {
      setStatus({ kind: "error", text: "Identify speakers first." });
      return;
    }

    const memberCount = participantClassifications.filter((entry) => entry.role === "MEMBER").length;

    setRunningAnalysis(true);
    setStatus({
      kind: "info",
      text: memberCount
        ? "Extracting member quotes and assigning sentiment/theme with AI."
        : "No explicit member classifications yet, extracting from transcript anyway for review."
    });
    openAnalysisProgress(
      "quotes",
      "Extracting member quotes",
      memberCount
        ? "Sending member roster and transcript to AI for quote extraction..."
        : "No member-rostered participants; preparing best-effort extraction...",
      15,
      {
        phase: "quotes-prep",
        fallbackDurationMs: ANALYSIS_PROGRESS_PHASE_DEFAULTS.quotes["quotes-prep"]
      }
    );

    try {
      updateAnalysisProgress(
        "quotes",
        "Generating excerpt and theme extraction from transcript...",
        40,
        {
          phase: "quotes-extract",
          fallbackDurationMs: ANALYSIS_PROGRESS_PHASE_DEFAULTS.quotes["quotes-extract"]
        }
      );
      const response = await fetch("/api/tests/transcript-member-insights/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          transcript,
          participantClassifications: buildPayloadClassifications(),
          maxInsights: 15
        })
      });

      const { payload } = await parseJsonResponse<AnalyzeResponse>(response);
      if (!response.ok) {
        throw new Error(payload.error || "Failed to extract member quotes.");
      }
      updateAnalysisProgress(
        "quotes",
        "Matching quotes to members and scoring sentiment/theme...",
        75,
        {
          phase: "quotes-score",
          fallbackDurationMs: ANALYSIS_PROGRESS_PHASE_DEFAULTS.quotes["quotes-score"]
        }
      );

      const quotes = Array.isArray(payload.quotes) ? payload.quotes : [];
      setDraftQuotes(
        quotes.map((entry) => ({
          ...entry,
          include: true
        }))
      );
      const nextSearchTerms = quotes.reduce<Record<string, string>>((acc, entry) => {
        acc[entry.id] = getHealthSystemNameById(entry.healthSystemId) || "";
        return acc;
      }, {});
      setQuoteHealthSystemSearch(nextSearchTerms);
      setSummary(payload.summary || null);
      setWarnings(payload.warnings || []);
      updateAnalysisProgress(
        "quotes",
        "Ready to review and save selected quotes...",
        100,
        {
          phase: "quotes-done",
          fallbackDurationMs: ANALYSIS_PROGRESS_PHASE_DEFAULTS.quotes["quotes-done"]
        }
      );
      setStage("quotes");
      setStatus({
        kind: "ok",
        text: `Extracted ${quotes.length} member quotes from the transcript.`
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to extract member quotes."
      });
    } finally {
      setRunningAnalysis(false);
      closeAnalysisProgress();
    }
  }

  async function saveSelectedInsights() {
    if (!companyId) {
      setStatus({ kind: "error", text: "Select a company first." });
      return;
    }

    const selected = draftQuotes.filter((entry) => entry.include);
    if (!selected.length) {
      setStatus({ kind: "error", text: "Select at least one quote to save." });
      return;
    }

    if (selected.some((entry) => !entry.healthSystemId)) {
      setStatus({
        kind: "error",
        text: "Every selected quote must have a health system assigned."
      });
      return;
    }

    setSavingInsights(true);
    setStatus({ kind: "info", text: "Saving selected insights to screening feedback..." });

    try {
      const response = await fetch("/api/tests/transcript-member-insights/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          category: "Transcript Insight",
          insights: selected.map((entry) => ({
            speakerName: entry.speakerName,
            excerpt: entry.excerpt,
            sentiment: entry.sentiment,
            theme: entry.theme,
            healthSystemId: entry.healthSystemId
          }))
        })
      });

      const { payload } = await parseJsonResponse<SaveResponse>(response);
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save insights.");
      }

      setStatus({
        kind: "ok",
        text: `Saved ${payload.createdCount} feedback ${payload.createdCount === 1 ? "item" : "items"}.`
      });
      setDraftQuotes((current) => current.filter((entry) => !entry.include));
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "Failed to save insights." });
    } finally {
      setSavingInsights(false);
    }
  }

  function setStatusMessage(error: unknown, fallback: string) {
    setStatus({
      kind: "error",
      text: error instanceof Error ? error.message : fallback
    });
  }

  async function createHealthSystemForPicker(name: string): Promise<HealthSystemOption | null> {
    try {
      return await createHealthSystemAndAssign(name);
    } catch (error) {
      setStatusMessage(error, "Failed to create health system.");
      return null;
    }
  }

  const canLoadForm = !loadingOptions && !!companyId && !!transcript.trim() && !runningAnalysis && !savingInsights;
  const canAdvance = stage === "classify" && participantClassifications.length > 0 && !runningAnalysis && !savingInsights;
  const progressCurrentPhaseLabel = React.useMemo(() => {
    if (!analysisProgress) return "";
    const { mode, phase, estimatedMs } = analysisProgress;
    const label = ANALYSIS_PROGRESS_PHASE_LABELS[mode]?.[phase] ?? phase;
    const details = activeProgressPhaseRef.current;
    if (!details || details.phase !== phase) {
      return `${label} (estimated ${Math.max(1, Math.round(estimatedMs / 1000))}s)`;
    }
    const elapsedMs = Math.max(0, nowMs() - details.startedAt);
    const remainingMs = Math.max(0, details.estimatedDurationMs - elapsedMs);
    const estimatedSeconds = Math.max(1, Math.round(estimatedMs / 1000));
    const remainingSeconds = Math.max(0, Math.round(remainingMs / 1000));
    return `${label} (about ${estimatedSeconds}s; ~${remainingSeconds}s remaining)`;
  }, [analysisProgress]);

  const analysisPhaseOrder = React.useMemo(
    () => (analysisProgress ? ANALYSIS_PROGRESS_PHASE_ORDER[analysisProgress.mode] : []),
    [analysisProgress]
  );
  const activePhaseIndex = React.useMemo(() => {
    if (!analysisProgress) return -1;
    const index = analysisPhaseOrder.indexOf(analysisProgress.phase);
    return index === -1 ? -1 : index;
  }, [analysisProgress, analysisPhaseOrder]);

  const progressBarPhaseRows = React.useMemo(() => {
    if (!analysisProgress) return [];
    return analysisPhaseOrder.map((phase, index) => ({
      phase,
      label: ANALYSIS_PROGRESS_PHASE_LABELS[analysisProgress.mode][phase] || phase,
      status:
        index < activePhaseIndex ? "completed" : index === activePhaseIndex ? "active" : "pending"
    }));
  }, [analysisProgress, analysisPhaseOrder, activePhaseIndex]);

  return (
    <main>
      <section className="hero">
        <h1>Transcript Member Insights (Test)</h1>
        <p>
          Select the company, paste a transcript, let AI identify speakers, classify participants, then extract member quotes for
          sentiment and theme tagging.
        </p>
      </section>

      {stage === "setup" ? (
        <section className="panel">
          <h2>1) Paste Transcript</h2>

          <form onSubmit={identifyParticipants} className="tool-form">
            <div className="row-3">
              <div>
                <label htmlFor="company-select">Company</label>
                <select
                  id="company-select"
                  value={companyId}
                  onChange={(event) => {
                    setCompanyId(event.target.value);
                    resetToSetup();
                  }}
                  required
                  disabled={runningAnalysis || savingInsights}
                >
                  <option value="" disabled>
                    Select company
                  </option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="transcript-input">Transcript</label>
              <textarea
                id="transcript-input"
                rows={16}
                placeholder="Paste transcript text here..."
                value={transcript}
                onChange={(event) => {
                  setTranscript(event.target.value);
                  if (stage !== "setup") resetToSetup();
                }}
                disabled={runningAnalysis || savingInsights}
              />
            </div>

            <div className="actions">
              <button className="primary" type="submit" disabled={!canLoadForm}>
                {runningAnalysis && stage === "setup" ? "Identifying Participants..." : "Next: Identify Speakers"}
              </button>
              <button className="secondary" type="button" onClick={resetToSetup} disabled={runningAnalysis || savingInsights}>
                Reset
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {stage === "classify" && participantClassifications.length > 0 ? (
        <section className="panel">
          <h2>Classify Participants</h2>

          <div className="summary-grid">
            <span className="flag-pill">Participants: {participantClassifications.length}</span>
            <span className={`flag-pill ${unresolvedClassifications > 0 ? "flag-pill-warning" : ""}`}>
              Unclassified: {unresolvedClassifications}
            </span>
            <span className={`flag-pill ${unresolvedMembers > 0 ? "flag-pill-warning" : ""}`}>
              Members without health system: {unresolvedMembers}
            </span>
          </div>

          <div className="participants-table-wrap">
            <table className="insight-table">
              <thead>
                <tr>
                  <th>Speaker</th>
                  <th>Role</th>
                  <th>Health System</th>
                </tr>
              </thead>
              <tbody>
                {orderedParticipantClassifications.map(({ entry, originalIndex }) => {
                  const rowKey = String(originalIndex);
                  const lookupValue = participantHealthSystemSearch[rowKey] ?? getHealthSystemNameById(entry.healthSystemId) ?? "";
                  return (
                    <tr key={rowKey}>
                      <td>{entry.speakerName}</td>
                      <td>
                        <select
                          value={entry.role}
                          onChange={(event) =>
                            updateParticipantClassification(originalIndex, {
                              role: event.target.value as ParticipantRole
                            })
                          }
                          disabled={runningAnalysis || savingInsights}
                        >
                          <option value="UNKNOWN">Unknown</option>
                          <option value="MEMBER">Health System Member</option>
                          <option value="COMPANY">Company Employee</option>
                          <option value="ABUNDANT">Abundant Employee</option>
                        </select>
                      </td>
                    <td>
                      {entry.role === "MEMBER" ? (
                        <HealthSystemLookup
                          lookupId={`member-health-system-${rowKey}`}
                          selectedId={entry.healthSystemId}
                          systems={healthSystems}
                          disabled={runningAnalysis || savingInsights}
                          value={lookupValue}
                          onSearchValueChange={(value) => {
                            setParticipantHealthSystemSearch((current) => ({
                              ...current,
                              [rowKey]: value
                            }));
                          }}
                          onSelect={(healthSystemId) => {
                            updateParticipantClassification(originalIndex, {
                              role: entry.role,
                              healthSystemId
                            });
                            setParticipantHealthSystemSearch((current) => ({
                              ...current,
                              [rowKey]: healthSystemId ? getHealthSystemNameById(healthSystemId) : ""
                            }));
                          }}
                          onCreate={createHealthSystemForPicker}
                        />
                      ) : (
                        <span className="muted">N/A</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="actions">
            <button className="secondary" type="button" onClick={() => setStage("setup")} disabled={runningAnalysis || savingInsights}>
              Back
            </button>
            <button
              className="primary"
              type="button"
              onClick={() => void extractMemberQuotes()}
              disabled={!canAdvance}
            >
              {runningAnalysis && stage === "classify" ? "Extracting Quotes..." : "Next: Extract Member Quotes"}
            </button>
          </div>
        </section>
      ) : null}

      {stage === "quotes" ? (
        <section className="panel">
          <h2>Member Quotes</h2>
          <div className="summary-grid">
            <span className="flag-pill">Extracted: {draftQuotes.length}</span>
            <span className="flag-pill">Selected: {selectedCount}</span>
            {selectedWithoutHealthSystem > 0 ? (
              <span className="flag-pill flag-pill-warning">Unassigned selected quotes: {selectedWithoutHealthSystem}</span>
            ) : null}
          </div>

          {warnings.length > 0 ? (
            <div className="warning-box">
              <strong>Analysis Notes</strong>
              <ul>
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="actions">
            <button className="secondary" type="button" onClick={() => setStage("classify")} disabled={runningAnalysis || savingInsights}>
              Back to Classification
            </button>
            <button className="secondary" type="button" onClick={() => updateAllQuotes(true)} disabled={savingInsights}>
              Select All
            </button>
            <button className="secondary" type="button" onClick={() => updateAllQuotes(false)} disabled={savingInsights}>
              Select None
            </button>
            <button
              className="primary"
              type="button"
              onClick={() => void saveSelectedInsights()}
              disabled={savingInsights || selectedCount === 0 || selectedWithoutHealthSystem > 0}
            >
              {savingInsights ? "Saving..." : "Save Selected"}
            </button>
          </div>

          <div className="insight-table-wrap">
            <table className="insight-table">
              <thead>
                <tr>
                  <th>Save</th>
                  <th>Speaker</th>
                  <th>Health System</th>
                  <th>Sentiment</th>
                  <th>Theme</th>
                  <th>Excerpt</th>
                </tr>
              </thead>
              <tbody>
                {draftQuotes.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={entry.include}
                        onChange={(event) => updateQuote(entry.id, event.target.checked)}
                        disabled={savingInsights}
                      />
                    </td>
                    <td>
                      <div className="speaker-name">{entry.speakerName}</div>
                      <div className="speaker-meta">
                        Line {entry.lineNumber}
                        {entry.timestampLabel ? ` @ ${entry.timestampLabel}` : ""}
                      </div>
                      {entry.isQuestion ? <span className="question-chip">Question</span> : null}
                    </td>
                    <td>
                      <HealthSystemLookup
                        lookupId={`quote-health-system-${entry.id}`}
                        selectedId={entry.healthSystemId}
                        systems={healthSystems}
                        disabled={runningAnalysis || savingInsights}
                        value={quoteHealthSystemSearch[entry.id] || getHealthSystemNameById(entry.healthSystemId) || ""}
                        onSearchValueChange={(value) => {
                          setQuoteHealthSystemSearch((current) => ({
                            ...current,
                            [entry.id]: value
                          }));
                        }}
                        onSelect={(healthSystemId) => {
                          updateQuoteHealthSystem(entry.id, healthSystemId);
                          setQuoteHealthSystemSearch((current) => ({
                            ...current,
                            [entry.id]: healthSystemId ? getHealthSystemNameById(healthSystemId) : ""
                          }));
                        }}
                        onCreate={createHealthSystemForPicker}
                      />
                    </td>
                    <td>
                      <span className={`sentiment-pill sentiment-${entry.sentiment.toLowerCase()}`}>{sentimentLabel(entry.sentiment)}</span>
                    </td>
                    <td>{entry.theme}</td>
                    <td className="excerpt">{entry.excerpt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {status ? (
        <p className={`status ${status.kind === "ok" ? "ok" : status.kind === "error" ? "error" : ""}`}>{status.text}</p>
      ) : null}

      {analysisProgress ? (
        <div className="analysis-progress-overlay" role="dialog" aria-modal="true">
          <div className="analysis-progress-modal">
            <div className="analysis-progress-spinner" aria-hidden="true" />
            <h3>{analysisProgress.title}</h3>
            <p className="muted analysis-progress-detail">{analysisProgress.detail}</p>
            {progressCurrentPhaseLabel ? <p className="muted analysis-progress-value">{progressCurrentPhaseLabel}</p> : null}
            {progressBarPhaseRows.length ? (
              <div className="analysis-progress-steps">
                {progressBarPhaseRows.map((entry) => (
                  <div key={entry.phase} className={`analysis-progress-step ${entry.status}`}>
                    <span className={`analysis-progress-dot ${entry.status}`} />
                    <span>{entry.label}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="analysis-progress-track" aria-hidden="true">
              <div
                className="analysis-progress-fill"
                style={{ width: `${Math.max(0, Math.min(100, analysisProgress.percent))}%` }}
              />
            </div>
            <div className="muted analysis-progress-value">{Math.round(analysisProgress.percent)}% complete</div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .tool-form {
          display: grid;
          gap: 12px;
        }

        .row-3 {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .summary-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 8px 0 12px;
        }

        .warning-box {
          border: 1px solid #f59e0b;
          background: #fffbeb;
          border-radius: 8px;
          padding: 10px;
          margin-bottom: 12px;
        }

        .warning-box strong {
          display: block;
          margin-bottom: 6px;
        }

        .warning-box ul {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 4px;
        }

        .participants-table-wrap,
        .insight-table-wrap {
          overflow-x: auto;
          border: 1px solid var(--colorBorder);
          border-radius: 8px;
          background: #ffffff;
        }

        .insight-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 980px;
        }

        .insight-table th,
        .insight-table td {
          border-bottom: 1px solid #edf2f7;
          padding: 8px;
          vertical-align: top;
          text-align: left;
        }

        .insight-table th {
          background: #f8fafc;
          position: sticky;
          top: 0;
          z-index: 1;
        }

        .speaker-name {
          font-weight: 700;
          color: #0a2f5a;
        }

        .speaker-meta {
          color: #64748b;
          font-size: 12px;
          margin-top: 2px;
        }

        .excerpt {
          white-space: pre-wrap;
          line-height: 1.4;
          max-height: 170px;
          overflow: auto;
        }

        .health-system-lookup {
          display: grid;
          gap: 6px;
        }

        .health-system-search-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .health-system-search-row input {
          min-width: 220px;
          flex: 1;
        }

        .health-system-empty {
          font-size: 11px;
          color: #64748b;
        }

        .analysis-progress-overlay {
          position: fixed;
          inset: 0;
          display: grid;
          place-items: center;
          z-index: 30;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(1px);
        }

        .analysis-progress-modal {
          width: min(560px, calc(100% - 24px));
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 16px 18px;
          background: #ffffff;
          box-shadow: 0 12px 36px rgba(2, 8, 23, 0.2);
        }

        .analysis-progress-spinner {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 3px solid #dbeafe;
          border-top-color: #2563eb;
          margin-bottom: 8px;
          animation: spin 1s linear infinite;
        }

        .analysis-progress-modal h3 {
          margin: 0 0 8px;
          font-size: 1.04rem;
        }

        .analysis-progress-detail {
          margin: 0 0 10px;
          line-height: 1.4;
          color: #334155;
        }

        .analysis-progress-track {
          border: 1px solid #e2e8f0;
          background: #e2e8f0;
          height: 12px;
          border-radius: 999px;
          overflow: hidden;
        }

        .analysis-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #0ea5e9, #2563eb);
          border-radius: 999px;
          transition: width 220ms ease;
        }

        .analysis-progress-steps {
          display: grid;
          gap: 5px;
          margin: 10px 0;
          font-size: 12px;
        }

        .analysis-progress-step {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #64748b;
        }

        .analysis-progress-step.completed {
          color: #0f766e;
        }

        .analysis-progress-step.active {
          color: #0f172a;
          font-weight: 700;
        }

        .analysis-progress-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
          border: 1px solid transparent;
          background: #cbd5e1;
        }

        .analysis-progress-dot.completed {
          background: #10b981;
        }

        .analysis-progress-dot.active {
          background: #2563eb;
        }

        .analysis-progress-value {
          margin-top: 8px;
          font-size: 11px;
          font-weight: 700;
          color: #0f172a;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .question-chip {
          display: inline-flex;
          align-items: center;
          padding: 2px 6px;
          border-radius: 999px;
          border: 1px solid #38bdf8;
          background: #e0f2fe;
          color: #075985;
          font-size: 11px;
          font-weight: 700;
          margin-top: 6px;
        }

        .sentiment-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 700;
          border: 1px solid transparent;
        }

        .sentiment-positive {
          background: #ecfdf5;
          color: #065f46;
          border-color: #a7f3d0;
        }

        .sentiment-mixed {
          background: #eff6ff;
          color: #1e40af;
          border-color: #bfdbfe;
        }

        .sentiment-neutral {
          background: #f8fafc;
          color: #334155;
          border-color: #cbd5e1;
        }

        .sentiment-negative {
          background: #fff1f2;
          color: #9f1239;
          border-color: #fecdd3;
        }

        .actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin: 8px 0 0;
        }

        .flag-pill-warning {
          border-color: #f59e0b;
          color: #92400e;
          background: #fffbeb;
        }

        @media (max-width: 1024px) {
          .row-3 {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
