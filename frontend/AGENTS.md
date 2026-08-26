# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Pocket Marketing Hub design decisions

- The visual target is a PandaRank-inspired operational UI: Pretendard, warm white/mist canvas, white surfaces, mint-green primary actions (`#22bc7e`), near-black text, generous spacing, 12–24px radii, and broad soft shadows. Reuse the visual system only; never copy PandaRank branding, content, or trademarks.
- Do not reintroduce editorial serif or mono typography, cobalt/terracotta/olive primary palettes, decorative `01–04` numbers, giant watermark numerals, English uppercase kickers, glass effects, or presentation-style hero layouts.
- The desktop shell uses a Discord-like client rail and a second project navigation column.
- Desktop navigation uses one persistent top-bar control. Repeated activation cycles `메인 화면 → 현재 프로젝트 메뉴 → 전체 프로젝트 → 메인 화면`; never add separate seam or sidebar arrow buttons. Compact screens keep the same single control for the combined drawer.
- Client selectors in the rail are horizontal name buttons, never initials-only avatars. Preserve each client's own script and brand spelling (for example `UND`, `무극`).
- Keep overview hierarchy to four primary signals, a compact monthly/week flow, attention items, channel progress, and recent updates.
- The `업무` view mirrors the supplied 90-day team-tracker information structure: overall completion, phase progress, workstream progress, phase/workstream filters, and grouped task checklists. Keep the active PandaRank-inspired Pocket visual system; do not reuse the reference file's editorial styling.
- The `실행계획` view is the native, client-readable projection of the approved client-share 90-day plan. Keep it read-only, load it only when entered, use a compact section navigator, sanitize all rendered HTML, and discard the source file's visual styling.
- Supplied project-plan HTML files are requirements references only. Do not copy their visible copy, brand palette, typography, or component anatomy into the live product UI.
- Use a single normalized source and role-based projection. Client mode is read-only and must hide executor names and internal notes.
- GitHub Pages and local production previews use the authenticated Apps Script API. Never add bundled demo customer or project data as a fallback.
- Login is required. The two current internal operator accounts have the same `POCKET_MANAGER + project ADMIN` authority. Account aliases are normalized only on the server; passwords, digests, manager credentials, and session tokens must never be embedded in the frontend or repository. Public preview and anonymous task writes stay disabled.
- Keep first load progressive: `preview_bootstrap` may contain only the preview session plus client/project/channel navigation data. The public first overview may load in parallel through `preview_overview`; never add overview aggregates or task/content rows back to bootstrap. After the first screen is ready, use one project-scoped `project_snapshot` to prefill the plan/tasks/content/performance/files+activity caches for 10 minutes. Preserve per-tab APIs as failure/timeout fallback and invalidate the cache generation after refresh, writes, logout, or project changes.
- Treat `docs/INTEGRATION_STATUS.md` as the source of truth for connection claims. Never present controls as persisted until the server confirms the Sheet write.
- Keep Sheet IDs, Apps Script URLs, API tokens, and customer data out of the public frontend and repository. All operational reads and writes must pass through a server-side authenticated, project-scoped API.
- Preserve the `POCKET_ONLY` / `PROJECT_TEAM` / `CLIENT` visibility model for all new and migrated rows.
