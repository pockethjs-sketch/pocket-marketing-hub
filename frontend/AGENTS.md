# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Pocket Marketing Hub design decisions

- The visual target is the existing Pocket KPI operational UI: Pretendard, cool gray canvas, white surfaces, cobalt-blue primary actions, slate text, thin borders, shallow shadows, and compact 3/5/7px radii.
- Do not reintroduce editorial serif or mono typography, terracotta/olive brand palettes, decorative `01–04` numbers, giant watermark numerals, English uppercase kickers, glass effects, or presentation-style hero layouts.
- The desktop shell uses a Discord-like client rail and a second project navigation column.
- Pocket and executor accounts use one icon-only `<< / >>` control that collapses the client rail first and the project navigation second, then restores them in reverse order. Never collapse both desktop columns on the first click. Client accounts start with both columns hidden and use the same top-bar control only when temporary navigation is needed.
- Client selectors in the rail are horizontal name buttons, never initials-only avatars. Preserve each client's own script and brand spelling (for example `UND`, `무극`).
- Keep overview hierarchy to four primary signals, a compact monthly/week flow, attention items, channel progress, and recent updates.
- Supplied project-plan HTML files are requirements references only. Do not copy their visible copy, brand palette, typography, or component anatomy into the live product UI.
- Use a single normalized source and role-based projection. Client mode is read-only and must hide executor names and internal notes.
- GitHub Pages and local production previews use the authenticated Apps Script API. Never add bundled demo customer or project data as a fallback.
- Login UI is temporarily disabled through a server-issued `CLIENT_VIEWER` public preview session. Keep it read-only, pinned to an explicit server-side project allowlist, and reversible through configuration; never embed a manager credential or token in the frontend.
- Treat `docs/INTEGRATION_STATUS.md` as the source of truth for connection claims. Never present controls as persisted until the server confirms the Sheet write.
- Keep Sheet IDs, Apps Script URLs, API tokens, and customer data out of the public frontend and repository. All operational reads and writes must pass through a server-side authenticated, project-scoped API.
- Preserve the `POCKET_ONLY` / `PROJECT_TEAM` / `CLIENT` visibility model for all new and migrated rows.
