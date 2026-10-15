# Verification record

Date: October 15, 2026 (Asia/Kolkata).

## Actual results

| Check | Status |
| --- | --- |
| Backend pytest | 43 passed; mocked Gemini responses, real parsers and exporters. |
| Next.js production build | Passed with Node 24.19.0. |
| Lint/typecheck | Both passed. |
| Desktop/mobile browser workflow | All 4 tests passed; actual HTTP parsing, tailoring, and exports with only Gemini mocked. Screenshots inspected at both widths. |
| Sample PDF visual inspection | Passed: one selectable-text page with clear headings, wrapped text, and no clipping. |
| Real Gemini smoke | Not run: no `GEMINI_API_KEY` supplied. |
| Docker image execution | Not run: Docker CLI exists but the Docker Desktop engine is stopped/unavailable. |
| Public deployment/workflow | Not deployed or verified. |

## Repository and live URLs

- Repository: [Lakshay093/tailorcv](https://github.com/Lakshay093/tailorcv), created; source push pending final checks.
- Frontend: not yet deployed.
- Backend: not yet deployed.

## Dependency notes

`npm audit` reports five high findings through the **development-only** `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` dependency chain (GHSA-vfj7-8cjw-p6xm). The current stable braces release remains 3.0.3 and has no patched version in the registry. Do not use `npm audit fix --force` to downgrade the framework config. Production dependency audit (`npm audit --omit=dev`) reports **0 vulnerabilities**. These are build/lint tooling findings, not a claim of a vulnerability-free toolchain.

Starlette 1.8 emits a deprecation warning for its httpx-backed TestClient; the tests still pass. The Gemini SDK currently uses httpx, so it remains pinned. This does not affect production API behavior.

The submission remains incomplete until real Gemini processing and the public Vercel/Render workflow are verified. No successful external checks or URLs are implied by passing mocked tests.
