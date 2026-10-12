# Runtime, local hosting and Windows execution boundaries

**Series 1.1.0 · Instructions for the later implementation run; Windows has not been executed here**

## Observed baseline, not a recommendation to upgrade

The candidate is an ES-module React/TypeScript application using TanStack Start/Router, Vite and Nitro. Its lockfile resolves React/React DOM 19.3.0, Vite 8.3.2, TypeScript 5.9.3, TanStack Start 1.168.60, TanStack Router 1.170.41, Nitro 3.0.260610-beta, Playwright 1.63.0 and Zod 4.6.5. These are facts from the supplied package-lock.json; they are not a claim about the latest public releases or installed modules. Application dependencies were not installed during this tailoring task.

Node v22.16.0 and npm 10.9.2 were available in the Linux inspection environment. The three standalone Glyphoku tests ran successfully with the candidate's test-alias loader and native type stripping. This does not establish a full app build, TSX execution through Node, a typecheck, or Windows compatibility. The lockfile includes Node requirements; verify the selected runtime against all activated packages before installation or execution. Do not download a remembered private Python runtime for this TypeScript application.

## Safe baseline test command

From the real extracted candidate root, with an already approved compatible Node installation:

```text
node --version
node --import ./scripts/register-tests.mjs --experimental-strip-types --test-concurrency=1 --test src/lib/glyphoku/glyphoku.test.ts
```

This direct command avoids the POSIX shell expressions in the existing aggregate npm test script. It runs only the named baseline tests. Existing files must still be inspected before invoking them in a different target. The loader resolves the candidate's extensionless TS imports; do not omit it and misdiagnose that import failure as a puzzle defect.

The later implementation must add its own negative/integration cases and run typecheck, relevant unchanged-neighbor tests and a full build when approved dependencies are available. Keep any NOT_RUN/BLOCKED result explicit rather than adding success fixtures. An offline environment with uncached dependencies is blocked for that build, not permission to bypass network policy.

## Distinct hosted and local profiles

Baseline `npm run dev` and `vite.config.ts` bind `0.0.0.0:8080`. The code comment identifies this as the hosted preview contract. Preserve it separately when needed by that environment; do not silently break its preview scaffolding while claiming to have made local-only acceptance work. The baseline preview configuration specifies `127.0.0.1:8081`, but configuration text alone does not prove what a produced Nitro/Vercel preview actually binds or what it accesses.

Implement an explicit local profile selecting literal `127.0.0.1`, a reviewed fixed port, strict-port failure and restricted hosts/origins. Verify the effective command/configuration and actual process listener. Never fall back to `0.0.0.0`, an automatic next port or public deployment to get a green result. Do not describe browser mailbox suffixes as listeners or DNS records.

For a reviewed local development profile, the following command shape avoids asking a Windows process launcher to execute a npm `.cmd` shim as an executable:

```text
node scripts/with-app-env.mjs node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 8081 --strictPort
```

This is a **proposed local-profile invocation to verify**, not a tested launcher delivered by this package. It requires reviewed installed dependencies and the local profile's approved auth/PWA/preview behavior. Check that wrappers and plugins do not override the intended bind. Do not run the baseline build-with-migrate command against real identity or mail data.

## Origin and data handling

Choose one exact origin and browser profile for all acceptance observations. Moving from 0.0.0.0-hosted preview to 127.0.0.1, or changing port/scheme, can select a different browser store. Preserve the old origin's data through an explicitly authorized export/import; never claim that a directory copy migrates localStorage automatically. Do not access personal live mail for this test series.

## Normal-user Windows behavior to implement and test

A proposed `.cmd` launcher should anchor paths to its own directory, quote all paths, use only the approved runtime, preserve nonzero exit codes, leave a diagnostic message visible on failure and never request administrator rights by default. A cross-platform Node test runner should spawn `process.execPath` with argument arrays, collect child exit codes and avoid shell-only syntax. These launchers are implementation deliverables, not files already produced or verified in this documentation package.

Check paths containing spaces, a short extraction root, read-only output directories, occupied/forbidden ports, missing runtime, incompatible Node, unavailable browser binaries and interrupted startup. Report the actual diagnostic and log path. Do not disable Smart App Control, firewall rules, signature checks or endpoint controls; a block is a diagnosis to report and resolve by approved packaging, not a request to bypass security.

## Runtime network evidence

For the local-only acceptance environment, inspect browser requests, loaded resources, root auth hooks, preview bridge messages, PWA/service-worker paths, server-side sockets and DNS behavior. Restrict collection to this synthetic test profile and redact unrelated data. Block runtime external network access in the authorized sandbox and show that the required journeys still work. Browser HAR alone does not cover server egress; absence of networking in registry.ts alone covers neither surface.

Build-time package acquisition, when separately permitted, is distinct from runtime policy and requires pinned dependencies and recorded provenance. Keep external message addresses as rejected strings in negative tests; do not attempt actual external delivery.

## Reference basis

See [REFERENCES.md](REFERENCES.md) for primary platform documentation on Vite bind addresses, React batching, Node type stripping, origin-local storage and same-origin Web Locks. All candidate versions, scripts and paths above come from the attached files, not those external pages.
