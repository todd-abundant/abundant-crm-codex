/* eslint-disable @next/next/no-img-element */
"use client";

import * as React from "react";
import {
  SCREENING_SURVEY_RESPONDENT_COOKIE_MAX_AGE_SECONDS,
  SCREENING_SURVEY_RESPONDENT_COOKIE_NAME,
  serializeScreeningSurveyRespondentProfileCookie
} from "@/lib/screening-survey-respondent-cookie";

type LiveSurveySession = {
  id: string;
  title: string;
  status: "DRAFT" | "LIVE" | "CLOSED";
  companyName: string;
  openedAt: string | null;
  closedAt: string | null;
};

type LiveSurveyQuestion = {
  sessionQuestionId: string;
  questionId: string;
  displayOrder: number;
  category: string;
  prompt: string;
  instructions: string | null;
  drivesScreeningOpportunity?: boolean;
  scaleMin: number;
  scaleMax: number;
};

type LiveSurveyHealthSystem = {
  id: string;
  name: string;
};

type LiveSurveyParticipantProfile = {
  participantName: string | null;
  participantEmail: string | null;
  healthSystemId: string | null;
  healthSystemName: string;
};

type LiveSurveyAnswer = {
  score: number;
  skipped: boolean;
};

function midpoint(min: number, max: number) {
  return Math.round((min + max) / 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeOrganizationName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findMatchingHealthSystem(
  value: string,
  healthSystems: LiveSurveyHealthSystem[]
) {
  const normalizedValue = normalizeOrganizationName(value);
  if (!normalizedValue) return null;

  return (
    healthSystems.find((entry) => normalizeOrganizationName(entry.name) === normalizedValue) || null
  );
}

function rankHealthSystemMatch(name: string, query: string) {
  const normalizedName = normalizeOrganizationName(name);
  const normalizedQuery = normalizeOrganizationName(query);
  if (!normalizedQuery) return 0;
  if (normalizedName === normalizedQuery) return 3;
  if (normalizedName.startsWith(normalizedQuery)) return 2;
  if (normalizedName.includes(normalizedQuery)) return 1;
  return 0;
}

export function LiveScreeningSurveyClient({ token }: { token: string }) {
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [session, setSession] = React.useState<LiveSurveySession | null>(null);
  const [questions, setQuestions] = React.useState<LiveSurveyQuestion[]>([]);
  const [healthSystems, setHealthSystems] = React.useState<LiveSurveyHealthSystem[]>([]);
  const [answers, setAnswers] = React.useState<Record<string, LiveSurveyAnswer>>({});
  const [participantName, setParticipantName] = React.useState("");
  const [participantEmail, setParticipantEmail] = React.useState("");
  const [organizationName, setOrganizationName] = React.useState("");
  const [impressions, setImpressions] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [slideDirection, setSlideDirection] = React.useState<"forward" | "backward">("forward");
  const [slideKey, setSlideKey] = React.useState(0);
  const [organizationLookupOpen, setOrganizationLookupOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStatus(null);

    void (async () => {
      try {
        const res = await fetch(`/api/screening-surveys/live/${token}`, {
          cache: "no-store"
        });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.error || "Failed to load survey");
        }
        if (cancelled) return;

        const nextSession = payload.session as LiveSurveySession;
        const nextQuestions = ((payload.questions || []) as LiveSurveyQuestion[]).sort((a, b) => {
          if (a.displayOrder !== b.displayOrder) {
            return a.displayOrder - b.displayOrder;
          }
          return a.sessionQuestionId.localeCompare(b.sessionQuestionId);
        });
        const nextHealthSystems = (payload.healthSystems || []) as LiveSurveyHealthSystem[];
        const participantProfile =
          (payload.participantProfile as LiveSurveyParticipantProfile | null | undefined) || null;

        setSession(nextSession);
        setQuestions(nextQuestions);
        setHealthSystems(nextHealthSystems);
        setParticipantName(participantProfile?.participantName || "");
        setParticipantEmail(participantProfile?.participantEmail || "");
        setOrganizationName(participantProfile?.healthSystemName || "");
        setAnswers(
          nextQuestions.reduce<Record<string, LiveSurveyAnswer>>((accumulator, question) => {
            accumulator[question.sessionQuestionId] = {
              score: midpoint(question.scaleMin, question.scaleMax),
              skipped: false
            };
            return accumulator;
          }, {})
        );
        setStepIndex(0);
        setSlideDirection("forward");
        setSlideKey(0);
        setImpressions("");
        setSubmitted(false);
      } catch (error) {
        if (!cancelled) {
          setStatus({
            kind: "error",
            text: error instanceof Error ? error.message : "Failed to load survey"
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const questionCount = questions.length;
  const totalSteps = questionCount > 0 ? questionCount + 2 : 1;
  const questionPosition = stepIndex - 1;
  const isIntroStep = stepIndex === 0;
  const currentQuestion =
    questionCount > 0 && questionPosition >= 0 && questionPosition < questionCount
      ? questions[questionPosition]
      : null;
  const isImpressionStep = questionCount > 0 && stepIndex === totalSteps - 1;
  const progressPercent = totalSteps > 0 ? ((stepIndex + 1) / totalSteps) * 100 : 0;
  const currentAnswer = currentQuestion ? answers[currentQuestion.sessionQuestionId] : null;
  const currentAnswerValue = currentAnswer?.score ?? 0;
  const isLiveSession = session?.status === "LIVE";
  const isPreviewSession = Boolean(session) && session?.status !== "LIVE";
  const previewStateLabel = session?.status === "DRAFT" ? "draft" : "closed";
  const progressLabel = isIntroStep
    ? `Step 1 of ${totalSteps}`
    : currentQuestion
      ? `Question ${questionPosition + 1} of ${questionCount}`
      : "Final Feedback";
  const resolvedOrganizationName = organizationName.trim();
  const matchedHealthSystem = findMatchingHealthSystem(resolvedOrganizationName, healthSystems);
  const sortedHealthSystems = React.useMemo(
    () => [...healthSystems].sort((a, b) => a.name.localeCompare(b.name)),
    [healthSystems]
  );
  const organizationSuggestions = React.useMemo(() => {
    if (!resolvedOrganizationName) {
      return sortedHealthSystems.slice(0, 12);
    }

    return sortedHealthSystems
      .map((entry) => ({
        entry,
        score: rankHealthSystemMatch(entry.name, resolvedOrganizationName)
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.entry.name.localeCompare(b.entry.name);
      })
      .slice(0, 12)
      .map((entry) => entry.entry);
  }, [resolvedOrganizationName, sortedHealthSystems]);
  const showUseTypedOrganizationOption = Boolean(resolvedOrganizationName) && !matchedHealthSystem;

  const persistRespondentProfileCookie = React.useCallback(() => {
    if (typeof document === "undefined") return;

    const trimmedName = participantName.trim();
    const trimmedEmail = participantEmail.trim().toLowerCase();
    if (!trimmedName && !trimmedEmail) return;
    if (!resolvedOrganizationName) return;

    const cookieValue = serializeScreeningSurveyRespondentProfileCookie({
      participantName: trimmedName || null,
      participantEmail: trimmedEmail || null,
      healthSystemId: matchedHealthSystem?.id || null,
      healthSystemName: resolvedOrganizationName
    });

    document.cookie = [
      `${SCREENING_SURVEY_RESPONDENT_COOKIE_NAME}=${cookieValue}`,
      `Max-Age=${SCREENING_SURVEY_RESPONDENT_COOKIE_MAX_AGE_SECONDS}`,
      "Path=/",
      "SameSite=Lax",
      window.location.protocol === "https:" ? "Secure" : ""
    ]
      .filter(Boolean)
      .join("; ");
  }, [
    matchedHealthSystem?.id,
    resolvedOrganizationName,
    participantEmail,
    participantName
  ]);

  React.useEffect(() => {
    persistRespondentProfileCookie();
  }, [persistRespondentProfileCookie]);

  function handleOrganizationLookupBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextFocusedElement = event.relatedTarget;
    if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) {
      return;
    }
    setOrganizationLookupOpen(false);
  }

  function selectOrganization(nextOrganizationName: string) {
    setOrganizationName(nextOrganizationName);
    setOrganizationLookupOpen(false);
  }

  function goToNextStep() {
    if (totalSteps === 0) return;
    if (stepIndex >= totalSteps - 1) return;
    setSlideDirection("forward");
    setStepIndex((current) => current + 1);
    setSlideKey((current) => current + 1);
  }

  function goToPreviousStep() {
    if (stepIndex <= 0) return;
    setSlideDirection("backward");
    setStepIndex((current) => current - 1);
    setSlideKey((current) => current + 1);
  }

  function skipCurrentQuestion() {
    if (!currentQuestion) return;
    setAnswers((current) => {
      const existing = current[currentQuestion.sessionQuestionId];
      return {
        ...current,
        [currentQuestion.sessionQuestionId]: {
          score: existing?.score ?? midpoint(currentQuestion.scaleMin, currentQuestion.scaleMax),
          skipped: true
        }
      };
    });
    goToNextStep();
  }

  function handleStartSurvey() {
    persistRespondentProfileCookie();
    goToNextStep();
  }

  async function submitSurvey() {
    if (!session) return;
    if (!resolvedOrganizationName) {
      setStatus({
        kind: "error",
        text: "Enter your organization."
      });
      return;
    }
    if (!participantName.trim() && !participantEmail.trim()) {
      setStatus({ kind: "error", text: "Provide your name or email." });
      return;
    }
    if (questionCount === 0) {
      setStatus({ kind: "error", text: "Survey has no questions configured." });
      return;
    }
    const impressionText = impressions.trim();
    if (!impressionText) {
      setStatus({
        kind: "error",
        text: "Please add one to two sentences about your overall impressions."
      });
      return;
    }

    setSubmitting(true);
    setStatus(null);
    try {
      if (!isLiveSession) {
        setSubmitted(true);
        setStatus({
          kind: "ok",
          text: `Preview complete. No responses were stored because this survey is ${previewStateLabel}, but this browser may remember your respondent details for prefilling.`
        });
        return;
      }

      const res = await fetch(`/api/screening-surveys/live/${token}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantName: participantName.trim() || undefined,
          participantEmail: participantEmail.trim() || undefined,
          healthSystemId: matchedHealthSystem?.id,
          healthSystemName: resolvedOrganizationName,
          impressions: impressionText,
          answers: questions.map((question) => ({
            sessionQuestionId: question.sessionQuestionId,
            score: answers[question.sessionQuestionId]?.skipped
              ? null
              : (answers[question.sessionQuestionId]?.score ??
                midpoint(question.scaleMin, question.scaleMax)),
            skipped: answers[question.sessionQuestionId]?.skipped ?? false
          }))
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to submit survey");
      setSubmitted(true);
      setStatus({ kind: "ok", text: "Response submitted. Thank you." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to submit survey"
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="live-survey-main">
      <section className="live-survey-card">
        <div className="live-survey-brand">
          <img src="/icon.svg" alt="Abundant logo" className="live-survey-logo" />
          <div>
            <p className="live-survey-eyebrow">Abundant Webinar Survey</p>
            <h1>{session?.title || "Loading survey"}</h1>
            <p className="muted">{session?.companyName || " "}</p>
          </div>
        </div>

        {loading ? <p className="muted">Loading survey...</p> : null}
        {status ? <p className={`status ${status.kind}`}>{status.text}</p> : null}

        {!loading && !session ? <p className="muted">Survey unavailable.</p> : null}

        {!loading && isPreviewSession ? (
          <div className="live-survey-preview-banner" role="note" aria-live="polite">
            <strong>{session?.status === "DRAFT" ? "Draft Survey Preview" : "Closed Survey Preview"}</strong>
            <p>
              This survey is open for testing only. Responses will not be submitted or stored because
              this survey is {previewStateLabel}. This browser may still remember your respondent
              details for prefilling.
            </p>
          </div>
        ) : null}

        {!loading && session && !submitted ? (
          <>
            <div className="live-survey-form">
              <div className="live-survey-row">
                <div>
                  <label htmlFor="live-survey-name">Name (optional if email is provided)</label>
                  <input
                    id="live-survey-name"
                    value={participantName}
                    onChange={(event) => setParticipantName(event.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label htmlFor="live-survey-email">Email (optional if name is provided)</label>
                  <input
                    id="live-survey-email"
                    type="email"
                    value={participantEmail}
                    onChange={(event) => setParticipantEmail(event.target.value)}
                    placeholder="you@healthsystem.org"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="live-survey-health-system">Health system or organization</label>
                <div
                  className="live-survey-organization-lookup"
                  onFocus={() => setOrganizationLookupOpen(true)}
                  onBlur={handleOrganizationLookupBlur}
                >
                  <input
                    id="live-survey-health-system"
                    value={organizationName}
                    onChange={(event) => {
                      setOrganizationName(event.target.value);
                      setOrganizationLookupOpen(true);
                    }}
                    placeholder="Start typing an organization name"
                    required
                    autoComplete="organization"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={organizationLookupOpen}
                    aria-controls="live-survey-organization-results"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setOrganizationLookupOpen(false);
                      }
                    }}
                  />
                  {organizationLookupOpen ? (
                    <div
                      id="live-survey-organization-results"
                      className="live-survey-organization-results"
                      role="listbox"
                      aria-label="Organization matches"
                    >
                      {showUseTypedOrganizationOption ? (
                        <button
                          type="button"
                          className="live-survey-organization-option active"
                          onClick={() => selectOrganization(resolvedOrganizationName)}
                          role="option"
                          aria-selected="true"
                        >
                          <span className="live-survey-organization-option-name">
                            Use &quot;{resolvedOrganizationName}&quot;
                          </span>
                          <span className="live-survey-organization-option-subtitle">
                            Continue with this typed organization
                          </span>
                        </button>
                      ) : null}
                      {organizationSuggestions.length === 0 ? (
                        <p className="muted live-survey-organization-empty">
                          No matching organizations found yet.
                        </p>
                      ) : (
                        organizationSuggestions.map((entry) => (
                          <button
                            type="button"
                            key={entry.id}
                            className={`live-survey-organization-option ${
                              matchedHealthSystem?.id === entry.id ? "active" : ""
                            }`}
                            onClick={() => selectOrganization(entry.name)}
                            role="option"
                            aria-selected={matchedHealthSystem?.id === entry.id}
                          >
                            <span className="live-survey-organization-option-name">{entry.name}</span>
                            <span className="live-survey-organization-option-subtitle">
                              {matchedHealthSystem?.id === entry.id
                                ? "Selected existing organization"
                                : "Use existing organization"}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
                <p className="muted">
                  Start typing to narrow the list, or enter a new organization name if it is not listed.
                </p>
              </div>
            </div>

            {questionCount > 0 ? (
              <>
                <p className="live-survey-skip-tip">
                  Use the <strong>Skip</strong> button if you are not the right person to answer a
                  question.
                </p>
                <div className="live-survey-progress-meta">
                  <strong>{progressLabel}</strong>
                  <span>{`${Math.round(progressPercent)}% complete`}</span>
                </div>
                <div
                  className="live-survey-progress-track"
                  role="progressbar"
                  aria-valuenow={Math.round(progressPercent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span className="live-survey-progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>

                {isIntroStep ? (
                  <div
                    key={`intro-step-${slideKey}`}
                    className={`live-survey-question-stage ${
                      slideDirection === "forward" ? "slide-forward" : "slide-backward"
                    }`}
                  >
                    <span className="live-survey-category-chip">Instructions</span>
                    <h2>Before you begin</h2>
                    <p className="live-survey-question-instructions">
                      Please answer each question with a score from the slider. If a question is better
                      answered by someone else, use <strong>Skip</strong>.
                    </p>
                    <ul className="live-survey-instruction-list">
                      <li>Skip is available on every question.</li>
                      <li>Skipped questions are captured and excluded from score averages.</li>
                      <li>You can go back at any time before submitting.</li>
                    </ul>
                    <div className="live-survey-nav">
                      <span />
                      <button
                        type="button"
                        className="secondary"
                        onClick={handleStartSurvey}
                        disabled={submitting}
                      >
                        {isPreviewSession ? "Start Preview" : "Start Survey"}
                      </button>
                    </div>
                  </div>
                ) : currentQuestion ? (
                  <div
                    key={`${currentQuestion.sessionQuestionId}-${slideKey}`}
                    className={`live-survey-question-stage ${
                      slideDirection === "forward" ? "slide-forward" : "slide-backward"
                    }`}
                  >
                    <div className="live-survey-question-head">
                      <span className="live-survey-category-chip">{currentQuestion.category}</span>
                      <button
                        type="button"
                        className="live-survey-skip-button"
                        onClick={skipCurrentQuestion}
                        disabled={submitting}
                      >
                        Skip
                      </button>
                    </div>
                    <h2>{currentQuestion.prompt}</h2>
                    {currentQuestion.instructions ? (
                      <p className="live-survey-question-instructions">{currentQuestion.instructions}</p>
                    ) : null}
                    {currentAnswer?.skipped ? (
                      <p className="live-survey-question-instructions">
                        This question is currently marked as skipped.
                      </p>
                    ) : null}
                    <div className="live-survey-scale">
                      <span>{currentQuestion.scaleMin}</span>
                      <input
                        type="range"
                        min={currentQuestion.scaleMin}
                        max={currentQuestion.scaleMax}
                        step={1}
                        value={currentAnswerValue}
                        onChange={(event) =>
                          setAnswers((current) => ({
                            ...current,
                            [currentQuestion.sessionQuestionId]: {
                              score: clamp(
                                event.target.valueAsNumber,
                                currentQuestion.scaleMin,
                                currentQuestion.scaleMax
                              ),
                              skipped: false
                            }
                          }))
                        }
                      />
                      <span>{currentQuestion.scaleMax}</span>
                      <strong>{currentAnswerValue}</strong>
                    </div>
                    <div className="live-survey-nav">
                      <button
                        type="button"
                        className="ghost"
                        onClick={goToPreviousStep}
                        disabled={stepIndex === 0 || submitting}
                      >
                        Back
                      </button>
                      <button type="button" className="secondary" onClick={goToNextStep} disabled={submitting}>
                        {questionPosition < questionCount - 1 ? "Next" : "Final Question"}
                      </button>
                    </div>
                  </div>
                ) : isImpressionStep ? (
                  <div
                    key={`impression-step-${slideKey}`}
                    className={`live-survey-question-stage ${
                      slideDirection === "forward" ? "slide-forward" : "slide-backward"
                    }`}
                  >
                    <span className="live-survey-category-chip">Qualitative Feedback</span>
                    <h2>In one to two sentences, what are your overall impressions?</h2>
                    <p className="live-survey-question-instructions">
                      This helps us capture qualitative themes from your feedback.
                    </p>
                    <div className="live-survey-text-response">
                      <label htmlFor="live-survey-impressions">Impressions</label>
                      <textarea
                        id="live-survey-impressions"
                        value={impressions}
                        onChange={(event) => setImpressions(event.target.value)}
                        maxLength={1200}
                        rows={5}
                        placeholder="Share your overall impression, concerns, and level of interest."
                      />
                      <p className="muted">{`${impressions.length}/1200 characters`}</p>
                    </div>
                    <div className="live-survey-nav">
                      <button
                        type="button"
                        className="ghost"
                        onClick={goToPreviousStep}
                        disabled={stepIndex === 0 || submitting}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void submitSurvey()}
                        disabled={submitting}
                      >
                        {submitting
                          ? (isPreviewSession ? "Finishing..." : "Submitting...")
                          : (isPreviewSession ? "Finish Preview" : "Submit Survey")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">No questions available in this survey.</p>
            )}
          </>
        ) : null}

        {submitted ? (
          <div className="live-survey-thankyou">
            <h2>{isPreviewSession ? "Preview complete" : "Thank you"}</h2>
            <p>
              {isPreviewSession
                ? `No responses were stored because this survey is ${previewStateLabel}. This browser may still remember your respondent details for prefilling.`
                : "Your responses were captured successfully."}
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
