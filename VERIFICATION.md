# Verification record

Date: October 15, 2026 (Asia/Kolkata).

## Actual results

| Check | Status |
| --- | --- |
| Backend pytest | 47 passed; mocked Gemini responses, real SDK serialization, parsers, and exporters. |
| Next.js production build | Passed with Node 24.19.0. |
| Lint/typecheck | Both passed. |
| Desktop/mobile browser workflow | All 4 tests passed; actual HTTP parsing, tailoring, and exports with only Gemini mocked. Screenshots inspected at both widths. |
| Sample PDF visual inspection | Passed: one selectable-text page with clear headings, wrapped text, and no clipping. |
| Real Gemini smoke | Passed with `gemini-3.6-flash`: structuring, JD analysis, tailoring, factual validation, PDF and DOCX exports. |
| Docker image execution | Not run: Docker CLI exists but the Docker Desktop engine is stopped/unavailable. |
| Public frontend | Deployed to Vercel; unauthenticated HTTPS GET returned 200 and contained the TailorCV workspace. |
| Public complete workflow | Backend deployment and API connection in progress. Gemini and Render credentials verified locally. |
| GitHub Actions | First two Linux runs passed backend, lint/typecheck/build, and desktop/mobile browser jobs. |

## Repository and live URLs

- Repository: [Lakshay093/tailorcv](https://github.com/Lakshay093/tailorcv), source pushed on `codex/tailorcv`.
- Frontend: [tailorcv-orcin.vercel.app](https://tailorcv-orcin.vercel.app). The UI is public; API-backed features await the backend connection.
- Backend: not yet deployed.

## Remaining external setup

1. Sign in to Render or connect the Render integration. The browser currently shows Render's sign-in page; no Render API key or CLI session is available.
2. Import root `render.yaml` from the repository (default branch `codex/tailorcv`). Set `GEMINI_API_KEY` and `ALLOWED_ORIGINS=https://tailorcv-orcin.vercel.app`; the Blueprint generates `RESUME_SIGNING_KEY` and sets production mode. Confirm the chosen compute plan and account eligibility.
3. Set Vercel `NEXT_PUBLIC_API_BASE_URL` to the actual Render HTTPS URL and redeploy the frontend. The current deployment intentionally has no invented API URL and shows a service-unavailable notice.
4. Run the real-provider smoke script and the public upload/customize/edit/download workflow. Record the actual model result and backend URL here.

Vercel project `tailorcv` is configured with root `frontend`, Next.js, Node 24.x, `npm ci`, and `npm run build`. Publication used authenticated CLI upload. Automatic Git deployments are not connected: Vercel requires adding a GitHub Login Connection to that account. This is independent of the working GitHub connector and local git credentials.

## Dependency notes

`npm audit` reports five high findings through the **development-only** `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` dependency chain (GHSA-vfj7-8cjw-p6xm). The current stable braces release remains 3.0.3 and has no patched version in the registry. Do not use `npm audit fix --force` to downgrade the framework config. Production dependency audit (`npm audit --omit=dev`) reports **0 vulnerabilities**. These are build/lint tooling findings, not a claim of a vulnerability-free toolchain.

Starlette 1.8 emits a deprecation warning for its httpx-backed TestClient; the tests still pass. The Gemini SDK currently uses httpx, so it remains pinned. This does not affect production API behavior.

ESLint 9.39.5 is the latest compatible major for the peer ranges of Next.js's React/import/accessibility lint plugins. npm marks ESLint 9 unsupported; moving to ESLint 10 currently produces peer-range warnings. This maintenance limitation is confined to development tooling. Runtime dependencies are unaffected.

The submission remains incomplete until real Gemini processing and the public Vercel/Render workflow are verified. No successful external checks or URLs are implied by passing mocked tests.
