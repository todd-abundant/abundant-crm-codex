# Pipeline Management Foundation

This document maps Abundant's operating narrative into the CRM pipeline model implemented in this iteration.

## Lifecycle Stages

1. Intake
- Schedule intake date.
- Record decision to advance or decline.
- Store intake report artifacts.

2. Venture Studio Negotiation
- Track venture studio services negotiation and S1 term sheet as opportunities.
- Use stage, likelihood, amount, notes, next steps, and estimated close date.

3. Screening
- Track webinar and individual screening events.
- Track participating health systems and contacts by event.

4. LOI Collection
- Track LOI status per participating health system.
- Monitor signed LOI count against target threshold.

5. Investment + Portfolio
- Track S1 investment timing/amount and portfolio-added date.
- Track fundraise summary and co-investors.

6. Commercial Negotiation + Expansion
- Track commercial contract negotiations as opportunities.
- Track ongoing prospect pursuits after initial contracts.

## Data Model (Implemented)

- `CompanyPipeline`: phase, intake decision, target LOIs, S1 + portfolio markers.
- `CompanyDocument`: intake/screening/contracts/LOI files and URLs.
- `CompanyOpportunity`: generic CRM opportunities for venture studio, term sheet, contracts, pursuits.
- `CompanyScreeningEvent`: webinars and individual sessions.
- `CompanyScreeningParticipant`: health system/contact attendance per screening event.
- `CompanyLoi`: LOI status per health system.
- `CompanyFundraise`: fundraise round summary.
- `CompanyFundraiseInvestor`: co-investor participation within each fundraise.

## API + UI (Implemented)

- `GET /api/companies/:id/pipeline`: returns pipeline snapshot for a company.
- `PATCH /api/companies/:id/pipeline`: saves full pipeline snapshot.
- `CompanyPipelineManager` UI is embedded in company detail for direct editing.

## What Comes Next

- Intake report generation automation.
- Screening report quantitative/qualitative scoring model.
- Commercial contract entity-level tracking and reporting rollups.
- Portfolio KPI dashboards and automated reminders.
