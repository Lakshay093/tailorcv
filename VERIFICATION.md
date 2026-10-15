# Verification record

Date: October 15, 2026 (Asia/Kolkata).

## Actual results

| Check | Status |
| --- | --- |
| Backend pytest | 47 passed; mocked Gemini responses, real SDK serialization, parsers, and exporters. |
| Next.js production build | Passed with Node 24.19.0. |
| Lint/typecheck | Both passed. |
| Desktop/mobile browser workflow | All 6 tests passed after the Resume Studio redesign; actual HTTP parsing, tailoring, and exports with only Gemini mocked. Includes immediate previews, help, confirmed reset, connection recovery, download focus, and preserved inputs. Screenshots inspected at both widths. |
| Sample PDF visual inspection | Passed: one selectable-text page with clear headings, wrapped text, and no clipping. |
| Real Gemini smoke | Passed with `gemini-3.6-flash`: structuring, JD analysis, tailoring, factual validation, PDF and DOCX exports. |
| Docker image execution | Render built the Docker image, started the container, and passed `/health`. Local Docker Desktop execution was unavailable because its engine was stopped. |
| Public frontend | Deployed to Vercel; unauthenticated HTTPS GET returned 200 and contained the TailorCV workspace. |
| Public complete workflow before the redesign | Passed one live Playwright test against the deployed Vercel frontend and Render API with real Gemini. Verified upload, JD, customization, protected fields, unselected projects, editing, PDF/DOCX/TXT downloads, desktop/mobile layouts, and no browser exceptions. |
| Public redesign verification | Published successfully to Vercel; confirmed the new heading, upload-first flow, and immediate original-resume preview on the public site. The new full live test did **not** complete: Gemini returned temporary unavailability, then a generation was rejected by factual validation, and the last attempt returned `PROVIDER_QUOTA`. Inputs and the original resume remained visible. No further provider calls were made after the quota response. Exports and the rest of the redesigned workflow passed all six mocked-provider browser tests. |
| Public downloaded documents | Extracted the actual downloaded PDF and DOCX: both contained the latest edited Unicode summary and excluded missing-keyword analysis. The selectable-text PDF rendered cleanly on one page. |
| GitHub Actions | Linux backend, lint/typecheck/build, and all six mocked desktop/mobile browser tests passed on redesign commit `2ec08d9`. |

## Repository and live URLs

- Repository: [Lakshay093/tailorcv](https://github.com/Lakshay093/tailorcv), source pushed on `codex/tailorcv`.
- Frontend: [tailorcv-orcin.vercel.app](https://tailorcv-orcin.vercel.app).
- Backend: [tailorcv-api-amdh.onrender.com](https://tailorcv-api-amdh.onrender.com/health).
- API documentation: [interactive OpenAPI docs](https://tailorcv-api-amdh.onrender.com/docs).

## Deployment state and maintenance

No external setup remains for the submitted public workflow. Render runs the Docker backend on a Free instance in Singapore with production mode, a generated signing secret, `gemini-3.6-flash`, and the exact Vercel origin in CORS. Vercel has `NEXT_PUBLIC_API_BASE_URL=https://tailorcv-api-amdh.onrender.com` for production, preview, and development. Preview domains require their own explicit CORS entry before use.

The Resume Studio redesign is deployed at the same public URL, with upload-first inputs, immediate resume preview, desktop step navigation, mobile shortcuts, help and reset dialogs, and export controls above the document. Vercel deployment `dpl_7cprf91dSzFaZJ6KBP9gkUuTUTWY` is ready. A public health check observed a 23.62-second backend cold start; the frontend health timeout is now 90 seconds. The current external limitation is the Gemini quota reported during the final live test. No billing, plan, credential, or model changes were made for the redesign.

Render's Free instance can sleep after 15 idle minutes, causing a cold start. Select suitable paid compute separately for production service guarantees. Rate limiting remains per process, not a distributed account quota. Parsing, font coverage, standardized formatting, and heuristic-score limitations are documented in the README.

The real provider initially exposed an SDK OpenAPI-schema serialization mismatch and excessive nested schema bounds. Both were corrected, covered by real-SDK transport tests, and reverified against Google. `gemini-3.8-flash` returned high-demand errors; the configured and verified model is `gemini-3.6-flash`.

Vercel project `tailorcv` is configured with root `frontend`, Next.js, Node 24.x, `npm ci`, and `npm run build`. Publication used authenticated CLI upload. Automatic Git deployments are not connected: Vercel requires adding a GitHub Login Connection to that account. This is independent of the working GitHub connector and local git credentials.

## Dependency notes

`npm audit` reports five high findings through the **development-only** `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` dependency chain (GHSA-vfj7-8cjw-p6xm). The current stable braces release remains 3.0.3 and has no patched version in the registry. Do not use `npm audit fix --force` to downgrade the framework config. Production dependency audit (`npm audit --omit=dev`) reports **0 vulnerabilities**. These are build/lint tooling findings, not a claim of a vulnerability-free toolchain.

Starlette 1.8 emits a deprecation warning for its httpx-backed TestClient; the tests still pass. The Gemini SDK currently uses httpx, so it remains pinned. This does not affect production API behavior.

ESLint 9.39.5 is the latest compatible major for the peer ranges of Next.js's React/import/accessibility lint plugins. npm marks ESLint 9 unsupported; moving to ESLint 10 currently produces peer-range warnings. This maintenance limitation is confined to development tooling. Runtime dependencies are unaffected.

The repository and public application are available, and real-provider verification is separate from the 47 backend checks and six mocked browser checks. To rerun the public test once Gemini quota is available, set `LIVE_APP_URL=https://tailorcv-orcin.vercel.app` and run `npm run test:live` from `frontend/`. It makes actual Gemini calls using only synthetic sample data. The live test allows one visible customization retry for temporary provider failures or factual rejection, records every rejected attempt, and stops immediately on quota errors.
