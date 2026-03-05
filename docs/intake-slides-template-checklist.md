# Intake Slides Template Checklist (v1)

Your Intake Report generator is wired and expects a Google Slides template ID to be set in:
- `GOOGLE_INTAKE_SLIDES_TEMPLATE_ID`
- `GOOGLE_DOCS_SERVICE_ACCOUNT_JSON` (service account JSON with Drive + Slides access)

The PDF you shared was not converted into a built template file in this repository; this setup guide helps you create that deck in Google Slides and keep it production-ready.

## 1) Create the template deck in Google Slides
- Start from a copy of your preferred intake PDF layout in Google Slides.
- Add all placeholders as plain text tokens exactly as shown below (double braces included).
- Put every token on the page where content should be replaced.
- Keep one clear section for each token group to avoid accidental replacement conflicts.

## 2) Required permissions
- Give the service account from `GOOGLE_DOCS_SERVICE_ACCOUNT_JSON` access to the template in Drive.
- Ensure the service account can read/copy the template and edit copied reports.
- Place output in a Shared Drive folder to avoid individual-user My Drive quota issues.
- Optional: place the template in a dedicated folder and set `GOOGLE_INTAKE_SLIDES_FOLDER_ID`.

## 3) Configure template ID in Drive URL
- Open the deck in Google Slides.
- Copy the ID from URL:
  - `https://docs.google.com/presentation/d/<TEMPLATE_ID>/edit`
- Set:
  - `GOOGLE_INTAKE_SLIDES_TEMPLATE_ID=<TEMPLATE_ID>`

## 4) Optional shared behavior
- Set `GOOGLE_INTAKE_REPORT_SHARING=writer` for editor access
- or `reader` / `link` if you want other sharing behavior.

## 4) Drive quota recovery (important)
- If you see: `storage quota has been exceeded` during copy, move report output into a Shared Drive:
  - In Google Drive create/open a Shared Drive folder for Intake reports.
  - Set `GOOGLE_INTAKE_SLIDES_FOLDER_ID=<folder-id>`
  - Ensure the service account has write access to that shared drive folder.
  - Regenerate reports. If quota already hit, manually remove old generated reports first.
- On `force=true` regeneration, the API automatically deletes prior `INTAKE_REPORT` documents for that company from Drive before creating the new report.

## 4.1) Service account access checks
- If Intake generation reports missing Google Drive authorization or permissions:
  - Verify `GOOGLE_DOCS_SERVICE_ACCOUNT_JSON` is configured correctly.
  - Ensure the service account has access to both template and destination folder.
  - Retry generation.

## 5) Validate with one test generation
- Open an Intake Card that has no existing report.
- Click generate report and confirm:
  - report opens in Slides,
  - placeholders are replaced,
  - line breaks are preserved in multiline fields.

## 6) Optional visual template polish
- Set title style once at top-level and apply to new placeholders by style/shape name.
- Use a fixed line height and bullet format in multiline sections.
- Add placeholders for sections you may leave as "Not provided" to avoid blank pages.
- To add the Market Landscape placeholder slide automatically, run:
  - `npm run slides:add-market-landscape`
  - Optional override: `npm run slides:add-market-landscape -- --template-id=<TEMPLATE_ID>`
  - Optional source slide override: `npm run slides:add-market-landscape -- --source-slide-id=<SLIDE_ID>`
  - Default source slide is `mlTemplate1772572238132` and the script duplicates that slide so original formatting is preserved.

---

## Template ID for Intake Reports

- Current default template:
  - `13skIsep1Rp2oi1B34jgel58QpTpoUNu0SMV3Y-5dWN8`
- Set env in your run environment:
  - `GOOGLE_INTAKE_SLIDES_TEMPLATE_ID=13skIsep1Rp2oi1B34jgel58QpTpoUNu0SMV3Y-5dWN8`

## Placeholder contract (v1)

These are the tokens used by:
- `lib/pipeline-intake-report.ts`
- `app/api/pipeline/opportunities/[id]/intake-document/route.ts`
- `lib/google-slides-intake.ts`

- `{{COMPANY_NAME}}`
  - Source: `company.name`
- `{{REPORT_DATE}}`
  - Source: generation date in format like `January 1, 2026`
- `{{WEBSITE}}`
  - Source: `company.website`
- `{{LOCATION}}`
  - Source: `company.headquartersCity`, `company.headquartersState`, `company.headquartersCountry`
- `{{DESCRIPTION}}`
  - Source: `company.description`
- `{{PROBLEM}}`
  - Source: `company.atAGlanceProblem`
- `{{SOLUTION}}`
  - Source: `company.atAGlanceSolution`
- `{{IMPACT}}`
  - Source: `company.atAGlanceImpact`
- `{{KEY_STRENGTHS}}`
  - Source: `company.atAGlanceKeyStrengths`
- `{{KEY_CONSIDERATIONS}}`
  - Source: `company.atAGlanceKeyConsiderations`
- `{{HEALTH_SYSTEM}}`
  - Source: `company.leadSourceHealthSystem.name`
  - Fallback: comma-separated screening health-system names, then `Not provided`
- `{{MONTH}}`
  - Source: report generation month (e.g., `March`)
- `{{YEAR}}`
  - Source: report generation year (e.g., `2026`)
- `{{CRITERIA_TITLE}}`
  - Source: configured fixed label `Venture Studio Criteria`
- `{{VENTURE_STUDIO_CRITERIA}}` (also supports `{{VENTURE STUDIO_CRITERIA}}`)
  - Source: `company.pipeline.ventureStudioCriteria`
  - Render format: one full table in a single placeholder value
    - `Category | Criteria | Assessment | Rationale`
    - assessment uses symbol markers (`🟢`, `🟡`, `🔴`, `⚪`) for visual status
    - values are pipe-safe (`|` replaced with full-width pipe) with line breaks normalized to spaces
- Row-level placeholders for table-based templates (recommended for exact visual layout):
  - `{{VSC_HEADLINE}}` for the large headline sentence above the table
  - `{{VSC_ROW_1_CATEGORY}}`, `{{VSC_ROW_1_CRITERIA}}`, `{{VSC_ROW_1_ASSESSMENT}}`, `{{VSC_ROW_1_RATIONALE}}`
  - repeat pattern through row 10 (`{{VSC_ROW_10_*}}`)
  - assessment token value is one of `🟢`, `🟡`, `🔴`, `⚪`
  - rows are emitted in this fixed order:
    - Products & Services, Value Proposition, Prioritization, Differentiation, Defined Buyer, Implementation, Concept Maturity, Team, Market Size, Regulatory Requirements
  - legend line tokens:
    - `{{VSC_LEGEND_GREEN}}`
    - `{{VSC_LEGEND_YELLOW}}`
    - `{{VSC_LEGEND_RED}}`
    - `{{VSC_LEGEND_GREY}}`
- `{{NEXT_STEP}}`
  - Source: `company.pipeline.nextStep`
- Market Landscape (2x2 grid + metadata):
  - `{{MARKET_LANDSCAPE_SECTION_LABEL}}`
  - `{{MARKET_LANDSCAPE_HEADLINE}}`
  - `{{MARKET_LANDSCAPE_SUBHEADLINE}}`
  - `{{MARKET_LANDSCAPE_TEMPLATE}}`
  - `{{MARKET_LANDSCAPE_X_AXIS_LABEL}}`
  - `{{MARKET_LANDSCAPE_Y_AXIS_LABEL}}`
  - `{{MARKET_LANDSCAPE_COLUMN_1_LABEL}}`
  - `{{MARKET_LANDSCAPE_COLUMN_2_LABEL}}`
  - `{{MARKET_LANDSCAPE_ROW_1_LABEL}}`
  - `{{MARKET_LANDSCAPE_ROW_2_LABEL}}`
  - `{{ML_PRIMARY_LABEL}}`
  - `{{ML_SECONDARY_LABEL}}`
  - `{{MARKET_LANDSCAPE_SLIDE_MARKER}}` (idempotency marker for template updates)
  - Card tokens are emitted for `R0C0`, `R0C1`, `R1C0`, `R1C1`:
    - `{{ML_<CELL>_TITLE}}`
    - `{{ML_<CELL>_PRIMARY_BODY}}`
    - `{{ML_<CELL>_SECONDARY_BODY}}`
    - `{{ML_<CELL>_OVERVIEW}}`
    - `{{ML_<CELL>_BUSINESS_MODEL}}`
    - `{{ML_<CELL>_STRENGTHS}}`
    - `{{ML_<CELL>_GAPS}}`
    - `{{ML_<CELL>_VENDORS}}`
    - `{{ML_<CELL>_FOCUS}}`
- `{{RELEVANT_NOTES}}`
  - Source: 20 most recent entity notes + screening summary for alliance members
  - Format:
    - `[Date] Author: note text`
    - `\n\n` then screening summary lines
- `{{SCREENING_LINKS}}`
  - Source: most recent unique screening documents (`title`, `url`, and optional alliance member name)

## Fallback behavior
- Empty values render as `Not provided`.
- Notes/summaries with no data render as readable fallback strings.
- Missing OAuth authorization/scopes or missing template ID return actionable errors.
