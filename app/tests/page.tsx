import Link from "next/link";

export default function TestsHomePage() {
  return (
    <main>
      <section className="panel">
        <h2>Beta Tools</h2>
        <div className="candidate-list">
          <Link className="list-row" href="/workbench">
            <div className="list-row-main">
              <strong>Workbench</strong>
              <span className="muted">
                Beta workbench experience for guided planning and execution.
              </span>
            </div>
          </Link>
          <Link className="list-row" href="/tests/transcript-member-insights">
            <div className="list-row-main">
              <strong>Transcript Member Insights</strong>
              <span className="muted">
                Extract member questions/comments from webinar transcripts, classify sentiment + themes, and save
                selected insights into screening feedback.
              </span>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}
