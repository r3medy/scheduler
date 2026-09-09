# Dependency advisory decisions — September 9, 2026

The September 9 audit of the old Next.js 16.2.12 lockfile returned **2 critical,
4 high, 6 moderate, 1 low** findings. This supersedes the September 8 report
(3 high, 4 moderate, 1 low). Advisory databases changed between checks.

The candidate is being updated to Next.js / eslint-config-next **16.3.3** and
the existing Babel override is being updated to **7.29.7**. Final post-update
audit and verification results are recorded in [release-status.md](release-status.md).

## Security updates

- Next.js 16.3.3 addresses [Windows filesystem RCE](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) and [AVIF image optimizer RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4). The Windows finding is relevant to this local environment; the old version is not an acceptable release candidate.
- Its declared PostCSS version is 8.5.23, clearing the earlier [source-map file read](https://github.com/postcss/postcss/security/advisories/GHSA-6g55-p6wh-862q), [map traversal](https://github.com/postcss/postcss/security/advisories/GHSA-r28c-9q8g-f849), [incomplete fix](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp), and [CSS stringification XSS](https://github.com/postcss/postcss/security/advisories/GHSA-qx2v-qp2m-jg93) version ranges. No forced PostCSS override is needed.
- Its Sharp range permits 0.35.4, addressing both [libvips issues](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj) and [libheif issues](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c). Sharp is runtime-reachable through `next/image` in `components/auth/auth-shell.tsx`; optional installation was never considered a mitigation. Recheck the installed version and optimized-logo response after installation.
- Babel 7.29.7 is outside the [source-map file-read advisory](https://github.com/babel/babel/security/advisories/GHSA-4x5r-pxfx-6jf8) range. The advisory's stated 7.29.1 minimum was not available from the registry; the published 7.29.7 remains within the existing major. `pnpm-workspace.yaml` pins Babel, so updating indirect parents alone would not remove the old 7.29.0.

## Residual tooling findings and decisions

| Path / advisory | Reachability evidence | Decision |
| --- | --- | --- |
| `shadcn > @modelcontextprotocol/sdk > express/body-parser > qs@6.15.3`; moderate [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx), [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) | The application imports `shadcn/tailwind.css` in `app/globals.css`, not its MCP/Express server. Scripts start Next.js; no application Express/qs import or MCP listener was found. Installing the package does not activate that server, but its CLI can do so separately. | Retain for its CSS import; do not expose the bundled MCP/Express tooling as part of this service. Update the transitive tree to qs >=6.16.0 in a separately validated dependency refresh. This is a deferred tooling risk, not a patched finding. |
| `vitest@3.2.7` and its `@vitest/mocker@3.2.7`; two moderate package findings for [GHSA-82fw-gwwq-j7x9](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9) | The advisory's unauthenticated path requires the standalone mocker/interceptor plugin on a reachable Vite WebSocket. `vitest.config.ts` uses jsdom; the project runs `vitest run`, has no browser/API server configuration, and does not import those standalone plugins. Production scripts run Next.js. | Defer the major test-runner migration to Vitest >=4.1.11. Do not expose a standalone mocker server or run untrusted tests with secrets. Current unit-test execution does not expose the described network endpoint. |

These are assessments of this application's current paths, not a guarantee
that affected packages cannot be exploited in a different environment. Review
again before exposing tooling, adding image uploads/proxies/remote patterns,
or compiling user-supplied code/CSS. Keep untrusted builds away from secrets.

## Reproduction

Run `pnpm audit --json` and inspect `findings.paths`. Check exact installed
Next.js, Sharp, PostCSS, and Babel versions after the frozen-lockfile install.
Search `app`, `components`, and `lib` for image, compiler, Express, and mocker
imports; inspect `next.config.ts`, `vitest.config.ts`, scripts, and `public/`.
Verify the configured production server serves the fixed optimized PNG logo
and rejects external optimizer URLs. Record build, tests, and browser results
for the updated lockfile before release.
