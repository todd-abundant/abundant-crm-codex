"use client";

import * as React from "react";

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
  scaleMin: number;
  scaleMax: number;
};

type LiveSurveyHealthSystem = {
  id: string;
  name: string;
};

function midpoint(min: number, max: number) {
  return Math.round((min + max) / 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function LiveScreeningSurveyClient({ token }: { token: string }) {
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [session, setSession] = React.useState<LiveSurveySession | null>(null);
  const [questions, setQuestions] = React.useState<LiveSurveyQuestion[]>([]);
  const [healthSystems, setHealthSystems] = React.useState<LiveSurveyHealthSystem[]>([]);
  const [answers, setAnswers] = React.useState<Record<string, number>>({});
  const [participantName, setParticipantName] = React.useState("");
  const [participantEmail, setParticipantEmail] = React.useState("");
  const [healthSystemId, setHealthSystemId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [questionIndex, setQuestionIndex] = React.useState(0);
  const [slideDirection, setSlideDirection] = React.useState<"forward" | "backward">("forward");
  const [slideKey, setSlideKey] = React.useState(0);

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
        const nextQuestions = ((payload.questions || []) as LiveSurveyQuestion[]).sort(
          (a, b) => a.displayOrder - b.displayOrder
        );
        const nextHealthSystems = (payload.healthSystems || []) as LiveSurveyHealthSystem[];

        setSession(nextSession);
        setQuestions(nextQuestions);
        setHealthSystems(nextHealthSystems);
        setAnswers(
          nextQuestions.reduce<Record<string, number>>((accumulator, question) => {
            accumulator[question.sessionQuestionId] = midpoint(question.scaleMin, question.scaleMax);
            return accumulator;
          }, {})
        );
        setQuestionIndex(0);
        setSlideDirection("forward");
        setSlideKey(0);
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
  const currentQuestion = questionCount > 0 ? questions[questionIndex] : null;
  const progressPercent = questionCount > 0 ? ((questionIndex + 1) / questionCount) * 100 : 0;
  const currentAnswerValue = currentQuestion ? answers[currentQuestion.sessionQuestionId] : 0;

  function goToNextQuestion() {
    if (!currentQuestion) return;
    if (questionIndex >= questionCount - 1) return;
    setSlideDirection("forward");
    setQuestionIndex((current) => current + 1);
    setSlideKey((current) => current + 1);
  }

  function goToPreviousQuestion() {
    if (!currentQuestion) return;
    if (questionIndex <= 0) return;
    setSlideDirection("backward");
    setQuestionIndex((current) => current - 1);
    setSlideKey((current) => current + 1);
  }

  async function submitSurvey() {
    if (!session) return;
    if (!healthSystemId) {
      setStatus({ kind: "error", text: "Select your health system." });
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

    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/screening-surveys/live/${token}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantName: participantName.trim() || undefined,
          participantEmail: participantEmail.trim() || undefined,
          healthSystemId,
          answers: questions.map((question) => ({
            sessionQuestionId: question.sessionQuestionId,
            score: answers[question.sessionQuestionId]
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

        {!loading && session && session.status !== "LIVE" ? (
          <p className="muted">This survey is not currently accepting responses.</p>
        ) : null}

        {!loading && session && session.status === "LIVE" && !submitted ? (
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
                <label htmlFor="live-survey-health-system">Health system</label>
                <select
                  id="live-survey-health-system"
                  value={healthSystemId}
                  onChange={(event) => setHealthSystemId(event.target.value)}
                  required
                >
                  <option value="">Select organization</option>
                  {healthSystems.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {currentQuestion ? (
              <>
                <div className="live-survey-progress-meta">
                  <strong>{`Question ${questionIndex + 1} of ${questionCount}`}</strong>
                  <span>{`${Math.round(progressPercent)}% complete`}</span>
                </div>
                <div className="live-survey-progress-track" role="progressbar" aria-valuenow={Math.round(progressPercent)} aria-valuemin={0} aria-valuemax={100}>
                  <span className="live-survey-progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>

                <div
                  key={`${currentQuestion.sessionQuestionId}-${slideKey}`}
                  className={`live-survey-question-stage ${
                    slideDirection === "forward" ? "slide-forward" : "slide-backward"
                  }`}
                >
                  <span className="live-survey-category-chip">{currentQuestion.category}</span>
                  <h2>{currentQuestion.prompt}</h2>
                  {currentQuestion.instructions ? (
                    <p className="live-survey-question-instructions">{currentQuestion.instructions}</p>
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
                          [currentQuestion.sessionQuestionId]: clamp(
                            event.target.valueAsNumber,
                            currentQuestion.scaleMin,
                            currentQuestion.scaleMax
                          )
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
                      onClick={goToPreviousQuestion}
                      disabled={questionIndex === 0 || submitting}
                    >
                      Back
                    </button>
                    {questionIndex < questionCount - 1 ? (
                      <button type="button" className="secondary" onClick={goToNextQuestion} disabled={submitting}>
                        Next
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void submitSurvey()}
                        disabled={submitting}
                      >
                        {submitting ? "Submitting..." : "Submit Survey"}
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">No questions available in this survey.</p>
            )}
          </>
        ) : null}

        {submitted ? (
          <div className="live-survey-thankyou">
            <h2>Thank you</h2>
            <p>Your responses were captured successfully.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
