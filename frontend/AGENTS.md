# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Pocket Marketing Hub design decisions

- The visual target is a PandaRank-inspired operational UI: Pretendard, warm white/mist canvas, white surfaces, Pocket dark-navy primary actions, near-black text, generous spacing, 12–24px radii, and broad soft shadows. Green is a success/status color, not the primary brand color. Reuse the visual system only; never copy PandaRank branding, content, or trademarks.
- Do not reintroduce editorial serif or mono typography, cobalt/terracotta/olive primary palettes, decorative `01–04` numbers, giant watermark numerals, English uppercase kickers, glass effects, or presentation-style hero layouts.
- The desktop shell uses a Discord-like client rail and a second project navigation column.
- Desktop navigation uses one persistent top-bar control. Repeated activation cycles `메인 화면 → 현재 프로젝트 메뉴 → 전체 프로젝트 → 메인 화면`; never add separate seam or sidebar arrow buttons. Compact screens keep the same single control for the combined drawer.
- Client selectors in the rail are horizontal name buttons, never initials-only avatars. Preserve each client's own script and brand spelling (for example `UND`, `무극`).
- Keep overview hierarchy to four primary signals, a compact monthly/week flow, attention items, channel progress, and recent updates.
- The `업무` view mirrors the supplied 90-day team-tracker information structure: overall completion, phase progress, workstream progress, phase/workstream filters, and grouped task checklists. Keep the active PandaRank-inspired Pocket visual system; do not reuse the reference file's editorial styling.
- The `실행계획` view is the native, client-readable projection of the approved client-share 90-day plan. Keep it read-only, load it only when entered, use a compact section navigator, sanitize all rendered HTML, and discard the source file's visual styling.
- Supplied project-plan HTML files are requirements references only. Do not copy their visible copy, brand palette, typography, or component anatomy into the live product UI.
- Use a single normalized source and role-based projection. Client mode is read-only and must hide executor names and internal notes.
- GitHub Pages and local production previews use staged Supabase mode: authentication bridging plus tasks/task activity in Supabase, with remaining screens on the authenticated Apps Script API until their migration is complete. Never add bundled demo customer or project data as a fallback.
- Login is required. Pocket uses `POCKET_MANAGER + ADMIN`; NS uses `EXECUTOR_EDITOR + EDIT`. Permission administration and operations maintenance require the Pocket organization in addition to a manager role. Account aliases are normalized only on the server; passwords, digests, manager credentials, and session tokens must never be embedded in the frontend or repository. Public preview and anonymous task writes stay disabled.
- Keep first load progressive. Fetch only the active tab's focused endpoint; do not prefetch `project_snapshot` or all tabs. Cache project+view data in memory for 10 minutes, and use a same-user `sessionStorage` bootstrap snapshot for immediate reload rendering before server revalidation. Clear browser snapshots on logout and invalidate cache generations after refresh, writes, or project changes.
- Treat `docs/INTEGRATION_STATUS.md` as the source of truth for connection claims. Never present controls as persisted until the active server confirms the write.
- Keep one persistent bell button in the common top bar. It lists tasks created within 24 hours, shows a per-project unread count, and stores acknowledgement only in per-tab `sessionStorage`; it must reuse already-loaded task data rather than add a Sheets request to page load.
- Keep Sheet IDs, Apps Script URLs, secret/service-role keys, session tokens, and customer data out of the public frontend and repository. A Supabase publishable key may be injected as a GitHub runtime variable; all operational reads and writes must still pass authenticated project-scoped RLS/RPC or the authenticated Apps Script API.
- Preserve the `POCKET_ONLY` / `PROJECT_TEAM` / `CLIENT` visibility model for all new and migrated rows.
