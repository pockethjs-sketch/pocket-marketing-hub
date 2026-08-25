# Design QA

## Visual target

- Pocket reference: `../pocket-kpi-deploy/qa-dashboard.png`
- Marketing Hub implementation: `frontend/src/App.jsx`, `frontend/src/styles.css`
- Comparison capture: `docs/pocket-reskin-comparison.png`
- Implementation capture: `docs/implementation-pocket-reskin.png`
- Reference comparison state: desktop 1440 × 900 px top viewport

The supplied UND HTML files remain requirements references only. Their editorial copy, serif/mono typography, warm palette, decorative numbering, and presentation-style layout are not the visual target.

## Findings

1. Pretendard, cool-gray canvas, white surfaces, cobalt-blue actions, slate text, thin borders, shallow shadows, and 3/5/7px radii now match the Pocket KPI product family.
2. Client selectors show the full names `UND` and `무극` as horizontal Discord-like buttons instead of initials-only squares.
3. The overview uses Pocket's operational hierarchy: compact project header, four KPI cards, weekly flow, action list, channel progress, and activity log.
4. Editorial serif/mono fonts, terracotta/olive brand treatment, giant watermark numerals, decorative `01–04` markers, glass effects, and proposal-style hero composition have been removed.
5. Project dates have a wider metadata column, small operational labels were raised to at least 10–11px in the active Pocket override, and the weekly cards were tightened for higher information density.
6. Desktop and mobile browser smoke tests cover navigation, role visibility, filters, calendar/list toggle, KPI rendering, client switching, overflow, and console health.
7. The UI still uses non-sensitive demo data. Google Sheets connection status is documented separately in `docs/INTEGRATION_STATUS.md` and is not visually overstated.

## Comparison history

- Pass 1: source HTML-based editorial UI; rejected because it looked unlike Pocket and copied presentation anatomy too closely.
- Pass 2: Pocket KPI token replacement and operational component restyling.
- Pass 3: equal-size combined comparison against the existing Pocket KPI screen; no blocking visual defect found.
- Pass 4: date-column width, text legibility, and weekly-card density tightened after visual QA.

## Final result

passed
