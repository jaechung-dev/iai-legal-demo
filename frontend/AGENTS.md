# Agent notes

Frontend stack: **Vite + React 19 + React Router v7 + TypeScript** — migrated off
Next.js. There is no SSR, no `app/` router, and no `next` dependency; do not
reintroduce it.

- Routes are declared in `src/App.tsx` with `<Routes>`; pages live in `src/pages/`.
- `@/` resolves to the `frontend/` root (see `vite.config.ts` / `tsconfig`), e.g. `@/context/auth`, `@/lib/config`.
- Public build config is baked in at build time via `define` in `vite.config.ts`, sourced from `.env.production` (committed) and `.env.local` (gitignored) — there is no runtime env.
- Auth is a custom JWT flow kept in `localStorage` (`src/context/auth.tsx`).
- The landing page is pre-rendered at build (`scripts/prerender.mjs`); keep the boot gate in `index.html` intact.
- Keep the Vitest unit tests and Playwright e2e green (`npm test`, `npm run test:e2e`).
