# PandaRank visual-system QA

- source visual truth: `docs/pandarank-source-desktop.png`
- implementation screenshot: `docs/hub-after-pandarank.png`
- combined comparison: `docs/pandarank-comparison-desktop.png`
- viewport: 1440 × 1000 CSS px
- source pixels: 1440 × 1000 at device scale factor 1
- implementation pixels: 1440 × 1000 at device scale factor 1
- state: UND overview, desktop, both navigation columns collapsed

## Full-view comparison evidence

The combined capture confirms the intended PandaRank visual language is present without replacing the existing dashboard information architecture: near-white canvas, white elevated surfaces, mint-green emphasis, near-black high-weight headings, generous section spacing, soft broad shadows, and larger rounded cards.

## Focused region comparison evidence

A separate crop was not required. The full-size 1440 × 1000 comparison keeps the hero, metric cards, panel headers, active state, type hierarchy, radii, and shadows readable in one frame.

## Required fidelity surfaces

- Fonts and typography: Pretendard remains the product font; headings now use heavier optical weights, tighter tracking, and near-black color consistent with the reference.
- Spacing and layout rhythm: card padding, section gaps, radii, and elevation were increased while preserving the existing operational grid.
- Colors and visual tokens: cobalt was replaced by PandaRank-like mint (`#22bc7e`), deep green (`#008656`), white, mist gray, and near-black.
- Image quality and asset fidelity: no PandaRank brand imagery or logos were copied. The source imagery is not applicable to this dashboard and the existing icon library remains intact.
- Copy and content: Pocket Marketing Hub copy and customer data were preserved; no PandaRank content or branding was introduced.

## Findings

- No actionable P0, P1, or P2 visual mismatch remains for the requested visual-system transfer.
- P3: the expanded two-column navigation was not included in this capture; its selectors use the same tokens and states but can receive a separate visual pass later.

## Comparison history

1. Before: compact cobalt KPI styling, thin shadows, and small radii did not match the reference.
2. Fix: replaced visual tokens and component surfaces with the mint/white/near-black system, larger radii, softer elevation, heavier typography, and roomier spacing.
3. After: `docs/pandarank-comparison-desktop.png` shows the updated visual treatment at the same desktop viewport.

## Implementation checklist

- [x] Typography and hierarchy
- [x] Background and surface colors
- [x] Card radii and elevation
- [x] Primary/active/control states
- [x] Dashboard spacing rhythm
- [x] Build and automated tests

final result: passed

---

# Team-tracker structure QA

- source visual truth: `docs/teamtracker-reference.png`
- implementation screenshot: `docs/task-view-after.png`
- combined comparison: `docs/task-view-comparison.png`
- viewport: 1440 × 1100 CSS px
- source pixels: 1440 × 1100 at device scale factor 1
- implementation pixels: 1440 × 1100 at device scale factor 1
- state: UND `업무` view, 구축 phase selected, desktop

## Full-view comparison evidence

The implementation preserves the source tracker hierarchy: overall completion, four phase summaries, workstream summaries, phase/workstream filtering, and workstream-grouped task checklists. The editorial source styling was intentionally replaced with the active Pocket mint/white card system.

## Focused region comparison evidence

No separate crop was needed. At 1440 × 1100, progress labels, phase counts, team counts, filter state, task metadata, and status chips remain legible in the combined comparison.

## Required fidelity surfaces

- Fonts and typography: source hierarchy is retained with Pretendard and the current Pocket optical weights.
- Spacing and layout rhythm: summary-to-filter-to-task-list order matches the source while cards use the active 16–18px radius and soft elevation.
- Colors and visual tokens: current mint/white/near-black product tokens are retained as requested.
- Image quality and asset fidelity: the reference contains no required raster imagery; existing library icons and native controls are retained.
- Copy and content: labels come from the live task model; reference task copy was used only in the isolated QA capture.

## Findings

- No actionable P0, P1, or P2 mismatch remains for the requested structure transfer.
- P3: the source has a separate channel publishing-quota editor. It was not added because the current task model has no quota or counter fields; inventing those controls would create non-persisted behavior.

## Comparison history

1. Before: the `업무` view was a single flat table.
2. Fix: added overall, phase, and workstream progress summaries plus grouped checklist sections and retained the existing filters.
3. After: `docs/task-view-comparison.png` verifies the hierarchy at the same viewport.

## Implementation checklist

- [x] Overall completion summary
- [x] Phase progress cards and filtering
- [x] Workstream progress cards and filtering
- [x] Grouped task checklists
- [x] Responsive layout rules
- [x] Build and automated tests

final result: passed
