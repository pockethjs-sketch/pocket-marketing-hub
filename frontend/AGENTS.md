# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Pocket Marketing Hub design decisions

- The visual target is the existing Pocket KPI operational UI: Pretendard, cool gray canvas, white surfaces, cobalt-blue primary actions, slate text, thin borders, shallow shadows, and compact 3/5/7px radii.
- Do not reintroduce editorial serif or mono typography, terracotta/olive brand palettes, decorative `01–04` numbers, giant watermark numerals, English uppercase kickers, glass effects, or presentation-style hero layouts.
- The desktop shell uses a Discord-like client rail and a second project navigation column.
- Client selectors in the rail are horizontal name buttons, never initials-only avatars. Preserve each client's own script and brand spelling (for example `UND`, `무극`).
- Keep overview hierarchy to four primary signals, a compact monthly/week flow, attention items, channel progress, and recent updates.
- Supplied project-plan HTML files are requirements references only. Do not copy their visible copy, brand palette, typography, or component anatomy into the live product UI.
- Use a single normalized source and role-based projection. Client mode is read-only and must hide executor names and internal notes.
- Until authenticated server-side filtering exists, GitHub Pages uses only non-sensitive demo data and must state that the live Google Sheet is not connected.
- Treat `docs/INTEGRATION_STATUS.md` as the source of truth for connection claims. Never present demo UI controls as persisted inputs, and never label the Sheet as connected until the completion criteria in that document pass.
- Keep Sheet IDs, Apps Script URLs, API tokens, and customer data out of the public frontend and repository. All operational reads and writes must pass through a server-side authenticated, project-scoped API.
- Resolve the `POCKET_ONLY` / `PROJECT_TEAM` / `CLIENT` visibility model and migrate existing rows before replacing demo data with live data.
