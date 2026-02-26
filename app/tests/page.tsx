import Link from "next/link";

export default function TestsHomePage() {
  return (
    <main>
      <section className="hero">
        <h1>Tests</h1>
        <p>Operational tools and MVP experiments that are intentionally isolated from core workflows.</p>
      </section>

      <section className="panel">
        <h2>Available Test Tools</h2>
        <div className="candidate-list">
          <Link className="list-row" href="/tests/snov-contact-lookup">
            <div className="list-row-main">
              <strong>Snov.io Contact Lookup</strong>
              <span className="muted">
                Use Snov API credentials to test low-volume contact lookups by email or by full name + domain.
              </span>
            </div>
          </Link>
          <Link className="list-row" href="/tests/zoom-webinar-import">
            <div className="list-row-main">
              <strong>Zoom Webinar Import</strong>
              <span className="muted">
                Pull attendees from a past Zoom webinar, match contacts and health systems, then preview/import
                into screening participants.
              </span>
            </div>
          </Link>
          <Link className="list-row" href="/tests/bookyourdata-contact-lookup">
            <div className="list-row-main">
              <strong>BookYourData Contact Lookup</strong>
              <span className="muted">
                Submit name, organization, and/or email to the BookYourData API and inspect whether valid contact
                matches are returned.
              </span>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}
