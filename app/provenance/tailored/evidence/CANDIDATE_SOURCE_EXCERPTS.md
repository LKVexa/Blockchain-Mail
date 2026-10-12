# Candidate source excerpts — unchanged baseline

These are reference copies, not patched runtime modules. Line numbers refer to the supplied candidate. File hashes are in the candidate archive manifest.

## `package.json`

```text
0001: {
0002:   "name": "app-builder-workspace",
0003:   "private": true,
0004:   "sideEffects": false,
0005:   "type": "module",
0006:   "overrides": {
0007:     "nf3": "0.3.17"
0008:   },
0009:   "scripts": {
0010:     "dev": "node scripts/with-app-env.mjs vite dev --host 0.0.0.0 --port 8080",
0011:     "build": "node scripts/with-app-env.mjs vite build",
0012:     "db:migrate": "node scripts/migrate.mjs",
0013:     "build:with-migrate": "node scripts/with-app-env.mjs vite build && npm run db:migrate",
0014:     "build:dev": "node scripts/with-app-env.mjs vite build --mode development",
0015:     "preview": "node scripts/with-app-env.mjs vite preview",
0016:     "preview:restart": "node scripts/preview.mjs restart",
0017:     "preview:stop": "node scripts/preview.mjs stop",
0018:     "typecheck": "tsc --noEmit",
0019:     "check:auth": "node scripts/check-auth-invariant.mjs",
0020:     "test": "node --test 'scripts/**/*.test.mjs'; s1=$?; node --import ./scripts/register-tests.mjs --experimental-strip-types --test-concurrency=1 --test src/lib/ja21.test.ts src/lib/penteract.test.ts src/lib/bem-mail.test.ts src/lib/remediation.test.ts src/lib/glyphoku/glyphoku.test.ts src/lib/app-data/app-data.test.ts src/lib/app-data/readiness-schedule.test.ts src/lib/auth/gate-identity.test.ts src/lib/auth/sign-in-gate.test.ts; s2=$?; if [ \"$s1\" -ne 0 ] || [ \"$s2\" -ne 0 ]; then exit 1; fi",
0021:     "lint": "eslint .",
0022:     "format": "prettier --write ."
0023:   },
0024:   "dependencies": {
0025:     "@electric-sql/pglite": "^0.5.4",
0026:     "@hookform/resolvers": "^5.7.0",
0027:     "@radix-ui/react-accordion": "^1.2.12",
0028:     "@radix-ui/react-alert-dialog": "^1.1.15",
0029:     "@radix-ui/react-avatar": "^1.1.11",
0030:     "@radix-ui/react-checkbox": "^1.3.3",
0031:     "@radix-ui/react-collapsible": "^1.1.12",
0032:     "@radix-ui/react-dialog": "^1.1.15",
0033:     "@radix-ui/react-dropdown-menu": "^2.1.16",
0034:     "@radix-ui/react-label": "^2.1.8",
0035:     "@radix-ui/react-popover": "^1.1.15",
0036:     "@radix-ui/react-progress": "^1.1.8",
0037:     "@radix-ui/react-radio-group": "^1.3.8",
0038:     "@radix-ui/react-scroll-area": "^1.2.10",
0039:     "@radix-ui/react-select": "^2.2.6",
0040:     "@radix-ui/react-separator": "^1.1.8",
0041:     "@radix-ui/react-slider": "^1.3.6",
0042:     "@radix-ui/react-slot": "^1.2.4",
0043:     "@radix-ui/react-switch": "^1.2.6",
0044:     "@radix-ui/react-tabs": "^1.1.13",
0045:     "@radix-ui/react-toggle": "^1.1.10",
0046:     "@radix-ui/react-toggle-group": "^1.1.11",
0047:     "@radix-ui/react-tooltip": "^1.2.8",
0048:     "@tailwindcss/vite": "^4.3.0",
0049:     "@tanstack/react-query": "^5.101.0",
0050:     "@tanstack/react-router": "^1.170.0",
0051:     "@tanstack/react-start": "^1.168.60",
0052:     "@tanstack/react-table": "^8.21.0",
0053:     "@tanstack/router-plugin": "^1.168.0",
0054:     "@vitejs/plugin-react": "^5.2.0",
0055:     "better-auth": "~1.6.30",
0056:     "class-variance-authority": "^0.7.1",
0057:     "clsx": "^2.1.1",
0058:     "cmdk": "^1.1.1",
0059:     "date-fns": "^4.0.0",
0060:     "jose": "6.2.9",
0061:     "kysely": "^0.28.5",
0062:     "lightningcss": "^1.28.0",
0063:     "lucide-react": "^0.510.0",
0064:     "nitro": "3.0.260610-beta",
0065:     "pg": "^8.16.3",
0066:     "react": "^19.2.0",
0067:     "react-day-picker": "^9.14.0",
0068:     "react-dom": "^19.2.0",
0069:     "react-hook-form": "^7.54.0",
0070:     "react-resizable-panels": "^4.6.5",
0071:     "recharts": "^2.13.0",
0072:     "sonner": "^2.0.7",
0073:     "tailwind-merge": "^3.5.0",
0074:     "tailwindcss": "^4.3.0",
0075:     "tw-animate-css": "^1.3.4",
0076:     "typescript": "^5.7.0",
0077:     "vaul": "^1.1.2",
0078:     "vite": "^8.2.0",
0079:     "zod": "^4.4.0",
0080:     "zustand": "^5.0.0"
0081:   },
0082:   "devDependencies": {
0083:     "@eslint/js": "^9.20.0",
0084:     "@types/node": "^22.16.5",
0085:     "@types/pg": "^8.11.10",
0086:     "@types/react": "^19.2.0",
0087:     "@types/react-dom": "^19.2.0",
0088:     "eslint": "^9.20.0",
0089:     "eslint-config-prettier": "^10.1.1",
0090:     "eslint-plugin-prettier": "^5.2.6",
0091:     "eslint-plugin-react-hooks": "^5.2.0",
0092:     "eslint-plugin-react-refresh": "^0.4.20",
0093:     "globals": "^15.15.0",
0094:     "playwright": "^1.62.0",
0095:     "prettier": "^3.4.0",
0096:     "typescript-eslint": "^8.56.1"
0097:   }
0098: }
```

## `vite.config.ts`

```text
0001: import { readdirSync } from "node:fs";
0002: import { join } from "node:path";
0003: import type { Plugin } from "vite";
0004: import { defineConfig } from "vite";
0005: import { tanstackStart } from "@tanstack/react-start/plugin/vite";
0006: import viteReact from "@vitejs/plugin-react";
0007: import tailwindcss from "@tailwindcss/vite";
0008: import { nitro } from "nitro/vite";
0009: // @ts-expect-error JS plugin alongside the TS vite config
0010: import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";
0011: // @ts-expect-error JS plugin alongside the TS vite config
0012: import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";
0013: import { isMigrationFile } from "./scripts/migration-plan.mjs";
0014: 
0015: /** The files `src/lib/db.ts` globs — same directory, same non-recursive scope. */
0016: function hasGlobbedMigrations(root: string): boolean {
0017:   try {
0018:     return readdirSync(join(root, "migrations")).some(isMigrationFile);
0019:   } catch {
0020:     return false;
0021:   }
0022: }
0023: 
0024: /**
0025:  * Finish PGLite bootstrap during dev-server setup (before traffic). Vite awaits
0026:  * async `configureServer` hooks. Production: `src/lib/db` kicks `ensureDbReady`
0027:  * on import.
0028:  *
0029:  * Vite awaiting the hook puts this on time-to-first-render, so an app with no
0030:  * migrations — no schema to apply — skips it entirely rather than paying for a
0031:  * PGLite instance it never queries.
0032:  */
0033: function pgliteBootstrapPlugin(): Plugin {
0034:   return {
0035:     name: "app-builder:pglite-bootstrap",
0036:     apply: "serve",
0037:     async configureServer(server) {
0038:       if (!hasGlobbedMigrations(server.config.root)) return;
0039:       try {
0040:         const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
0041:           ensureDbReady?: () => Promise<void>;
0042:         };
0043:         if (typeof mod.ensureDbReady === "function") {
0044:           await mod.ensureDbReady();
0045:         }
0046:       } catch (err) {
0047:         console.error("[app-builder] DB bootstrap failed:", err);
0048:         throw err;
0049:       }
0050:     },
0051:   };
0052: }
0053: 
0054: /**
0055:  * Live-preview OAuth popup — handled HERE so the agent never has to create a
0056:  * `/auth/popup` route (and cannot break it by scaffolding a React page that
0057:  * paints the full app shell in the popup).
0058:  *
0059:  * `signIn` (client.ts) opens `/auth/popup?providerId=…` in a top-level window.
0060:  * This middleware runs before TanStack Start, calls `handleAuthPopupRequest`,
0061:  * and returns the 302 / completion HTML. Deployed apps do not use the popup
0062:  * (full-page OAuth redirect), so `apply: "serve"` is enough.
0063:  */
0064: function authPopupPlugin(): Plugin {
0065:   return {
0066:     name: "app-builder:auth-popup",
0067:     apply: "serve",
0068:     configureServer(server) {
0069:       // Register immediately (not in a returned post-hook) so we run BEFORE
0070:       // TanStack Start / the SPA HTML fallback. A model-authored
0071:       // `src/routes/auth/popup.tsx` React page must never win this path.
0072:       server.middlewares.use(async (req, res, next) => {
0073:         try {
0074:           const rawUrl = req.url ?? "";
0075:           const pathOnly = rawUrl.split("?", 1)[0] ?? "";
0076:           if (pathOnly !== "/auth/popup") {
0077:             next();
0078:             return;
0079:           }
0080:           if ((req.method ?? "GET").toUpperCase() !== "GET") {
0081:             res.statusCode = 405;
0082:             res.setHeader("content-type", "text/plain; charset=utf-8");
0083:             res.end("Method Not Allowed");
0084:             return;
0085:           }
0086: 
0087:           const host = String(
0088:             req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:8080",
0089:           );
0090:           const proto = String(
0091:             req.headers["x-forwarded-proto"] ??
0092:               ((req.socket as { encrypted?: boolean } | undefined)?.encrypted ? "https" : "http"),
0093:           );
0094:           const requestHeaders = new Headers();
0095:           for (const [key, value] of Object.entries(req.headers)) {
0096:             if (value === undefined) continue;
0097:             if (Array.isArray(value)) {
0098:               for (const v of value) requestHeaders.append(key, v);
0099:             } else {
0100:               requestHeaders.set(key, value);
0101:             }
0102:           }
0103:           // Ensure Host is the public preview host so Better Auth's dynamic
0104:           // baseURL / redirect_uri match the popup origin.
0105:           if (!requestHeaders.has("host")) requestHeaders.set("host", host);
0106: 
0107:           const request = new Request(`${proto}://${host}${rawUrl}`, {
0108:             method: "GET",
0109:             headers: requestHeaders,
0110:           });
0111: 
0112:           const mod = (await server.ssrLoadModule("/src/lib/auth/popup.server.ts")) as {
0113:             handleAuthPopupRequest: (req: Request) => Promise<Response>;
0114:           };
0115:           const response = await mod.handleAuthPopupRequest(request);
0116: 
0117:           res.statusCode = response.status;
0118:           // Preserve multiple Set-Cookie headers (OAuth state + session).
0119:           const setCookies =
0120:             typeof response.headers.getSetCookie === "function"
0121:               ? response.headers.getSetCookie()
0122:               : [];
0123:           response.headers.forEach((value, key) => {
0124:             if (key.toLowerCase() === "set-cookie") return;
0125:             res.setHeader(key, value);
0126:           });
0127:           for (const cookie of setCookies) {
0128:             res.appendHeader("set-cookie", cookie);
0129:           }
0130:           const body = Buffer.from(await response.arrayBuffer());
0131:           res.end(body);
0132:         } catch (err) {
0133:           console.error("[app-builder] /auth/popup handler failed:", err);
0134:           if (!res.headersSent) {
0135:             res.statusCode = 500;
0136:             res.setHeader("content-type", "text/plain; charset=utf-8");
0137:             res.end("auth popup failed");
0138:           }
0139:         }
0140:       });
0141:     },
0142:   };
0143: }
0144: 
0145: // `0.0.0.0:8080` is the live-preview contract — don't change host/port.
0146: // The dev server starts once `src/router.tsx` and `src/routes/` exist — see
0147: // AGENTS.md § "First scaffold".
0148: export default defineConfig(({ command, isPreview }) => ({
0149:   server: {
0150:     host: "0.0.0.0",
0151:     port: 8080,
0152:     strictPort: true,
0153:   },
0154:   preview: {
0155:     host: "127.0.0.1",
0156:     port: 8081,
0157:     strictPort: true,
0158:   },
0159:   resolve: { tsconfigPaths: true },
0160:   plugins: [
0161:     pgliteBootstrapPlugin(),
0162:     // Before tanstackStart so /auth/popup never falls through to the SPA.
0163:     authPopupPlugin(),
0164:     // Dev-only /__app-env, read by scripts/check-auth-invariant.mjs.
0165:     appEnvPlugin(),
0166:     // PWA head + ?install=1 tutorial page; runs before Start/Nitro.
0167:     grokPwaPlugin(),
0168:     tailwindcss(),
0169:     tanstackStart(),
0170:     ...(command === "build" || isPreview
0171:       ? [
0172:           nitro({
0173:             preset: "vercel",
0174:             // Auto-registers server/middleware/* (the PWA install page +
0175:             // manifest + head-tag middleware). Nitro v3 defaults serverDir to
0176:             // false, so removing this silently unwires /?install=1 on deploys.
0177:             serverDir: "./server",
0178:           }),
0179:         ]
0180:       : []),
0181:     viteReact(),
0182:   ],
0183: }));
```

## `src/routes/index.tsx`

```text
0001: import { createFileRoute } from "@tanstack/react-router";
0002: import { GlyphokuStudio } from "@/components/glyphoku/studio";
0003: 
0004: export const Route = createFileRoute("/")({ component: GlyphokuStudio });
```

## `src/routes/__root.tsx`

```text
0001: import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
0002: import { AuthProvider } from "@/lib/auth/provider";
0003: import { PreviewHostBridge } from "@/components/preview-host-bridge";
0004: import appCss from "../styles.css?url";
0005: 
0006: const APP_NAME = "Glyphoku";
0007: 
0008: export const Route = createRootRoute({
0009:   head: () => ({
0010:     meta: [
0011:       { charSet: "utf-8" },
0012:       { name: "viewport", content: "width=device-width, initial-scale=1" },
0013:       { title: APP_NAME },
0014:       { name: "theme-color", content: "#14120f" },
0015:       { name: "description", content: "A local mail desk. The computer solves a hard 16×16 Glyphoku cipher before a domain or an envelope is issued." },
0016:     ],
0017:     links: [
0018:       { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
0019:       { rel: "stylesheet", href: appCss },
0020:       { rel: "manifest", href: "/__grok/manifest.webmanifest" },
0021:       { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
0022:     ],
0023:   }),
0024:   component: () => (
0025:     <html lang="en" suppressHydrationWarning>
0026:       <head>
0027:         <HeadContent />
0028:       </head>
0029:       <body>
0030:         <PreviewHostBridge />
0031:         <AuthProvider>
0032:           <Outlet />
0033:         </AuthProvider>
0034:         <Scripts />
0035:       </body>
0036:     </html>
0037:   ),
0038: });
```

## `src/components/glyphoku/studio.tsx`

```text
0001: import { useEffect, useRef, useState } from "react";
0002: import {
0003:   commitDomain,
0004:   emptyInstance,
0005:   freezeDraft,
0006:   issuePermit,
0007:   normalizeLabel,
0008:   sendLocal,
0009:   type FrozenDraft,
0010:   type Instance,
0011: } from "@/lib/glyphoku/registry";
0012: import { dealPlayable } from "@/lib/glyphoku/deal";
0013: import { glyphKind, glyphText, glyphsFor } from "@/lib/glyphoku/glyphs";
0014: import { PLAYED, issuanceAllowed, puzzlesRequired, verifyCandidate } from "@/lib/glyphoku/rules";
0015: import { createSolver, type Solver } from "@/lib/glyphoku/solver";
0016: 
0017: const STORAGE_KEY = "glyphoku-local-127";
0018: 
0019: type Puzzle = { givens: number[]; candidate: number[] | null };
0020: type Phase = "LIVE SOLVING" | "VERIFYING" | "FAILED" | "READY" | "SENT";
0021: 
0022: type Run = {
0023:   action: "domain" | "envelope";
0024:   label: string;
0025:   draft: FrozenDraft | null;
0026:   puzzles: Puzzle[];
0027:   index: number;
0028:   phase: Phase;
0029:   note: string;
0030: };
0031: 
0032: function loadInstance(): Instance {
0033:   if (typeof window === "undefined") return emptyInstance();
0034:   try {
0035:     const raw = window.localStorage.getItem(STORAGE_KEY);
0036:     if (!raw) return emptyInstance();
0037:     const parsed = JSON.parse(raw) as Instance;
0038:     if (
0039:       !parsed ||
0040:       !Number.isInteger(parsed.g) ||
0041:       parsed.g < 1 ||
0042:       !Array.isArray(parsed.domains) ||
0043:       !Array.isArray(parsed.mailboxes) ||
0044:       !Array.isArray(parsed.permits) ||
0045:       !Array.isArray(parsed.deliveries)
0046:     ) {
0047:       window.localStorage.setItem(`${STORAGE_KEY}-quarantine`, raw);
0048:       return emptyInstance();
0049:     }
0050:     return parsed;
0051:   } catch {
0052:     return emptyInstance();
0053:   }
0054: }
0055: 
0056: function cellClass(index: number, solverKind: string, glyph: string): string {
0057:   const order = PLAYED.order;
0058:   const col = index % order;
0059:   const row = Math.floor(index / order);
0060:   const thickR = col % PLAYED.boxCols === PLAYED.boxCols - 1 && col !== order - 1;
0061:   const thickB = row % PLAYED.boxRows === PLAYED.boxRows - 1 && row !== order - 1;
0062:   const ink = glyphKind(glyph);
0063:   const tone = ink === "letter" ? "text-moss" : ink === "symbol" ? "text-seal" : "text-fg";
0064:   const mark = solverKind === "guess" ? "underline decoration-2 decoration-seal" : solverKind === "given" ? "font-semibold" : "";
0065:   return `grid h-6 w-6 place-items-center font-serif text-[13px] leading-none sm:h-7 sm:w-7 ${thickR ? "border-r-2 border-r-fg" : "border-r border-r-line"} ${thickB ? "border-b-2 border-b-fg" : "border-b border-b-line"} ${tone} ${mark}`;
0066: }
0067: 
0068: export function GlyphokuStudio() {
0069:   const [instance, setInstance] = useState<Instance>(emptyInstance);
0070:   const [ready, setReady] = useState(false);
0071:   const [label, setLabel] = useState("studio");
0072:   const [to, setTo] = useState("");
0073:   const [subject, setSubject] = useState("Bench note");
0074:   const [body, setBody] = useState("The local board is filed.");
0075:   const [run, setRun] = useState<Run | null>(null);
0076:   const [board, setBoard] = useState<number[]>(Array.from({ length: PLAYED.order * PLAYED.order }, () => 0));
0077:   const [kind, setKind] = useState<string[]>(Array.from({ length: PLAYED.order * PLAYED.order }, () => "empty"));
0078:   const [lastEvent, setLastEvent] = useState("Idle");
0079:   const [paused, setPaused] = useState(false);
0080:   const [speed, setSpeed] = useState(24);
0081:   const [composing, setComposing] = useState(false);
0082:   const [counts, setCounts] = useState({ guesses: 0, retractions: 0 });
0083:   const solverRef = useRef<Solver | null>(null);
0084:   const runRef = useRef<Run | null>(null);
0085:   const instanceRef = useRef(instance);
0086:   const pausedRef = useRef(false);
0087:   const speedRef = useRef(1);
0088:   const stepping = useRef(false);
0089: 
0090:   useEffect(() => {
0091:     setInstance(loadInstance());
0092:     setReady(true);
0093:   }, []);
0094: 
0095:   useEffect(() => {
0096:     if (!ready) return;
0097:     window.localStorage.setItem(STORAGE_KEY, JSON.stringify(instance));
0098:     instanceRef.current = instance;
0099:   }, [instance, ready]);
0100: 
0101:   useEffect(() => {
0102:     pausedRef.current = paused;
0103:   }, [paused]);
0104: 
0105:   useEffect(() => {
0106:     speedRef.current = speed;
0107:   }, [speed]);
0108: 
0109:   function paint(solver: Solver, eventLabel: string) {
0110:     const snap = solver.snapshot();
0111:     setBoard(snap.board);
0112:     setKind(snap.kind);
0113:     setLastEvent(eventLabel);
0114:   }
0115: 
0116:   function beginPuzzle(nextRun: Run, givens: number[], resetCounts: boolean) {
0117:     const solver = createSolver(givens, PLAYED);
0118:     solverRef.current = solver;
0119:     const init = solver.step();
0120:     paint(solver, init ? `${init.type} · givens on the grid before search` : "INIT");
0121:     runRef.current = nextRun;
0122:     setRun(nextRun);
0123:     setPaused(false);
0124:     if (resetCounts) setCounts({ guesses: 0, retractions: 0 });
0125:   }
0126: 
0127:   function finishSolved() {
0128:     const solver = solverRef.current;
0129:     const current = runRef.current;
0130:     if (!solver || !current) return;
0131:     const snap = solver.snapshot();
0132:     const puzzle = current.puzzles[current.index];
0133:     if (!puzzle) return;
0134:     const verdict = verifyCandidate(puzzle.givens, snap.board, PLAYED);
0135:     if (!verdict.ok) {
0136:       const failed = { ...current, phase: "FAILED" as const, note: verdict.reason };
0137:       runRef.current = failed;
0138:       setRun(failed);
0139:       solverRef.current = null;
0140:       return;
0141:     }
0142:     const puzzles = current.puzzles.slice();
0143:     puzzles[current.index] = { givens: puzzle.givens, candidate: snap.board };
0144:     if (current.index + 1 < puzzles.length) {
0145:       const advanced: Run = { ...current, puzzles, index: current.index + 1, phase: "LIVE SOLVING", note: "Next board in this batch." };
0146:       beginPuzzle(advanced, puzzles[current.index + 1]!.givens, false);
0147:       return;
0148:     }
0149:     if (current.action === "domain") {
0150:       const result = commitDomain(
0151:         instanceRef.current,
0152:         current.label,
0153:         puzzles.map((item) => ({ givens: item.givens, candidate: item.candidate! })),
0154:       );
0155:       if (!result.ok) {
0156:         const failed = { ...current, puzzles, phase: "FAILED" as const, note: result.reason };
0157:         runRef.current = failed;
0158:         setRun(failed);
0159:         return;
0160:       }
0161:       setInstance(result.instance);
0162:       setTo(result.mailbox.address);
0163:       const done: Run = { ...current, puzzles, phase: "READY", note: `Domain created: ${result.domain.address}` };
0164:       runRef.current = done;
0165:       setRun(done);
0166:       solverRef.current = null;
0167:       return;
0168:     }
0169:     if (!current.draft) return;
0170:     const result = issuePermit(
0171:       instanceRef.current,
0172:       current.draft,
0173:       puzzles.map((item) => ({ givens: item.givens, candidate: item.candidate! })),
0174:     );
0175:     if (!result.ok) {
0176:       const failed = { ...current, puzzles, phase: "FAILED" as const, note: result.reason };
0177:       runRef.current = failed;
0178:       setRun(failed);
0179:       return;
0180:     }
0181:     setInstance(result.instance);
0182:     const done: Run = { ...current, puzzles, phase: "READY", note: "ENVELOPE READY — NOT SENT" };
0183:     runRef.current = done;
0184:     setRun(done);
0185:     solverRef.current = null;
0186:   }
0187: 
0188:   function stepOnce(): boolean {
0189:     const solver = solverRef.current;
0190:     if (!solver || !runRef.current || runRef.current.phase !== "LIVE SOLVING") return true;
0191:     const event = solver.step();
0192:     if (!event) return true;
0193:     paint(solver, `${event.type} · ${event.rule} · depth ${event.depth} · node ${event.nodes}`);
0194:     if (event.type === "GUESS") setCounts((current) => ({ ...current, guesses: current.guesses + 1 }));
0195:     if (event.type === "RETRACT") setCounts((current) => ({ ...current, retractions: current.retractions + 1 }));
0196:     if (event.type === "SEARCH_SOLVED") {
0197:       const verifying = { ...runRef.current, phase: "VERIFYING" as const, note: "Checking givens, rows, columns, and boxes." };
0198:       runRef.current = verifying;
0199:       setRun(verifying);
0200:       finishSolved();
0201:       return true;
0202:     }
0203:     if (event.type === "SEARCH_EXHAUSTED") {
0204:       const failed = { ...runRef.current, phase: "FAILED" as const, note: "The search ended without a candidate. Nothing was issued." };
0205:       runRef.current = failed;
0206:       setRun(failed);
0207:       solverRef.current = null;
0208:       return true;
0209:     }
0210:     return false;
0211:   }
0212: 
0213:   const stepRef = useRef<() => boolean>(() => true);
0214:   stepRef.current = stepOnce;
0215: 
0216:   useEffect(() => {
0217:     const id = window.setInterval(() => {
0218:       if (pausedRef.current || stepping.current) return;
0219:       if (!solverRef.current || runRef.current?.phase !== "LIVE SOLVING") return;
0220:       const count = speedRef.current;
0221:       for (let i = 0; i < count; i++) {
0222:         if (stepRef.current()) break;
0223:       }
0224:     }, 100);
0225:     const onHide = () => {
0226:       if (document.hidden) setPaused(true);
0227:     };
0228:     document.addEventListener("visibilitychange", onHide);
0229:     return () => {
0230:       window.clearInterval(id);
0231:       document.removeEventListener("visibilitychange", onHide);
0232:     };
0233:   }, []);
0234: 
0235:   function startDomain() {
0236:     const allowed = issuanceAllowed(instance.g);
0237:     if (!allowed.ok) {
0238:       setLastEvent(allowed.reason);
0239:       return;
0240:     }
0241:     if (runRef.current?.phase === "LIVE SOLVING") return;
0242:     const named = normalizeLabel(label);
0243:     if (!named.ok) {
0244:       setLastEvent(named.reason);
0245:       return;
0246:     }
0247:     const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
0248:     const ordinal = instance.g;
0249:     setComposing(true);
0250:     setLastEvent("Composing the hard 16×16 cipher…");
0251:     window.setTimeout(() => {
0252:       try {
0253:         const count = puzzlesRequired(ordinal);
0254:         const puzzles: Puzzle[] = [];
0255:         for (let i = 0; i < count; i++) puzzles.push({ givens: dealPlayable(ordinal, seed + i + 1), candidate: null });
0256:         beginPuzzle(
0257:           { action: "domain", label: named.label, draft: null, puzzles, index: 0, phase: "LIVE SOLVING", note: "Hard cipher. A finished animation does not create the domain." },
0258:           puzzles[0]!.givens,
0259:           true,
0260:         );
0261:       } catch (error) {
0262:         setLastEvent(error instanceof Error ? error.message : "The dealer paused.");
0263:       } finally {
0264:         setComposing(false);
0265:       }
0266:     }, 40);
0267:   }
0268: 
0269:   function startEnvelope() {
0270:     const allowed = issuanceAllowed(instance.g);
0271:     if (!allowed.ok) {
0272:       setLastEvent(allowed.reason);
0273:       return;
0274:     }
0275:     const sender = instance.mailboxes[0]?.address;
0276:     if (!sender) {
0277:       setLastEvent("Create a local domain before an envelope.");
0278:       return;
0279:     }
0280:     const frozenDraft = freezeDraft({ from: sender, to, bcc: "", subject, body }, instance);
0281:     if (!frozenDraft.ok) {
0282:       setLastEvent(frozenDraft.reason);
0283:       return;
0284:     }
0285:     const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
0286:     const ordinal = instance.g;
0287:     setComposing(true);
0288:     setLastEvent("Composing the hard 16×16 cipher…");
0289:     window.setTimeout(() => {
0290:       try {
0291:         const count = puzzlesRequired(ordinal);
0292:         const puzzles: Puzzle[] = [];
0293:         for (let i = 0; i < count; i++) puzzles.push({ givens: dealPlayable(ordinal, seed + i + 17), candidate: null });
0294:         beginPuzzle(
0295:           {
0296:             action: "envelope",
0297:             label: "",
0298:             draft: frozenDraft.draft,
0299:             puzzles,
0300:             index: 0,
0301:             phase: "LIVE SOLVING",
0302:             note: "The draft is frozen. This cipher is harder than the domain. Solving does not send it.",
0303:           },
0304:           puzzles[0]!.givens,
0305:           true,
0306:         );
0307:       } catch (error) {
0308:         setLastEvent(error instanceof Error ? error.message : "The dealer paused.");
0309:       } finally {
0310:         setComposing(false);
0311:       }
0312:     }, 40);
0313:   }
0314: 
0315:   function stopRun() {
0316:     solverRef.current = null;
0317:     if (runRef.current) {
0318:       const stopped = { ...runRef.current, phase: "FAILED" as const, note: "Stopped. No resource was issued." };
0319:       runRef.current = stopped;
0320:       setRun(stopped);
0321:     }
0322:   }
0323: 
0324:   const gate = issuanceAllowed(instance.g);
0325:   const mailbox = instance.mailboxes[0]?.address ?? "";
0326:   const openPermit = instance.permits.find((permit) => permit.state === "READY" && permit.draft);
0327: 
0328:   return (
0329:     <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
0330:       <header className="border-b border-line pb-6">
0331:         <p className="font-mono text-xs tracking-widest text-seal">GLYPHOKU · LOCAL 127 · NOT A CURRENCY</p>
0332:         <h1 className="mt-2 font-serif text-5xl">Watch the board, then the registry moves</h1>
0333:         <p className="mt-3 max-w-2xl text-muted">
0334:           The computer solves a 16×16 Glyphoku cipher: digits, letters, and symbols, each once in every row, column, and box. This is the hard band, not a numeral sudoku. The first domain takes one board. The next envelope takes two.
0335:         </p>
0336:       </header>
0337: 
0338:       <dl className="mt-6 grid grid-cols-2 gap-3 font-mono text-xs sm:grid-cols-4">
0339:         <div className="border border-line px-3 py-2">
0340:           <dt className="text-muted">Next ordinal</dt>
0341:           <dd className="text-lg text-fg">g={instance.g}</dd>
0342:         </div>
0343:         <div className="border border-line px-3 py-2">
0344:           <dt className="text-muted">Puzzles required</dt>
0345:           <dd className="text-lg text-fg">{gate.ok ? gate.puzzles : "paused"}</dd>
0346:         </div>
0347:         <div className="border border-line px-3 py-2">
0348:           <dt className="text-muted">Domains</dt>
0349:           <dd className="text-lg text-fg">{instance.domains.length}</dd>
0350:         </div>
0351:         <div className="border border-line px-3 py-2">
0352:           <dt className="text-muted">Inbox</dt>
0353:           <dd className="text-lg text-fg">{instance.deliveries.length}</dd>
0354:         </div>
0355:       </dl>
0356: 
0357:       <section className="mt-6 grid gap-6 lg:grid-cols-[auto_1fr]">
0358:         <div>
0359:           <div className="overflow-x-auto">
0360:             <div
0361:               className="inline-grid border-2 border-fg bg-surface"
0362:               role="grid"
0363:               aria-label="Glyphoku cipher"
0364:               style={{ gridTemplateColumns: `repeat(${PLAYED.order}, 1.75rem)` }}
0365:             >
0366:               {board.map((value, index) => {
0367:                 const glyph = glyphText(PLAYED.order, value);
0368:                 return (
0369:                   <div key={index} role="gridcell" className={cellClass(index, kind[index] ?? "empty", glyph)} aria-label={`row ${Math.floor(index / PLAYED.order) + 1} column ${(index % PLAYED.order) + 1} ${glyph || "empty"}`}>
0370:                     {glyph}
0371:                   </div>
0372:                 );
0373:               })}
0374:             </div>
0375:           </div>
0376:           <p className="mt-2 max-w-md font-mono text-xs text-muted">
0377:             {glyphsFor(PLAYED.order).map((glyph) => (
0378:               <span key={glyph} className={glyphKind(glyph) === "letter" ? "mr-1 text-moss" : glyphKind(glyph) === "symbol" ? "mr-1 text-seal" : "mr-1 text-fg"}>{glyph}</span>
0379:             ))}
0380:             <span className="text-muted">Given is heavy. A guess is underlined.</span>
0381:           </p>
0382:           <p className="mt-2 min-h-11 font-mono text-xs text-fg">{lastEvent}</p>
0383:           <p className="font-mono text-xs text-muted">Guesses {counts.guesses} · Retractions {counts.retractions}</p>
0384:           <div className="mt-2 flex flex-wrap gap-2">
0385:             <button type="button" className="min-h-11 border border-line px-3 font-mono text-xs" onClick={() => setPaused((value) => !value)}>
0386:               {paused ? "Resume" : "Pause"}
0387:             </button>
0388:             <button
0389:               type="button"
0390:               className="min-h-11 border border-line px-3 font-mono text-xs"
0391:               onClick={() => {
0392:                 stepping.current = true;
0393:                 setPaused(true);
0394:                 stepOnce();
0395:                 stepping.current = false;
0396:               }}
0397:             >
0398:               Single step
0399:             </button>
0400:             <button type="button" className="min-h-11 border border-line px-3 font-mono text-xs" onClick={stopRun}>
0401:               Stop
0402:             </button>
0403:             <label className="flex min-h-11 items-center gap-2 font-mono text-xs text-muted">
0404:               Speed
0405:               <select className="min-h-11 border border-line bg-bg px-2 text-fg" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
0406:                 <option value={1}>1×</option>
0407:                 <option value={8}>8×</option>
0408:                 <option value={24}>24×</option>
0409:                 <option value={40}>40×</option>
0410:               </select>
0411:             </label>
0412:           </div>
0413:           {run && (
0414:             <p className="mt-3 text-sm text-muted">
0415:               {run.phase} · puzzle {run.index + 1} of {run.puzzles.length}. {run.note}
0416:             </p>
0417:           )}
0418:         </div>
0419: 
0420:         <div className="grid content-start gap-6">
0421:           <section className="border border-line bg-surface p-4">
0422:             <h2 className="font-serif text-2xl">Create a local domain</h2>
0423:             <p className="mt-2 text-sm text-muted">The name stays inside this browser. It is not a public registration.</p>
0424:             <label className="mt-3 grid gap-1 font-mono text-xs text-muted">
0425:               Label
0426:               <input className="min-h-11 border border-line bg-bg px-3 font-mono text-sm text-fg" value={label} onChange={(event) => setLabel(event.target.value)} />
0427:             </label>
0428:             <button type="button" className="mt-3 min-h-11 bg-seal px-4 font-mono text-xs text-seal-ink disabled:opacity-40" disabled={!gate.ok || composing || run?.phase === "LIVE SOLVING"} onClick={startDomain}>
0429:               Solve & Create Domain
0430:             </button>
0431:             {instance.domains[0] && <p className="mt-3 font-mono text-xs text-moss">{instance.domains[0].address}</p>}
0432:             {mailbox && <p className="font-mono text-xs text-muted">{mailbox}</p>}
0433:           </section>
0434: 
0435:           <section className="border border-line bg-surface p-4">
0436:             <h2 className="font-serif text-2xl">Freeze a message</h2>
0437:             <p className="mt-2 text-sm text-muted">Solving issues one permit. It stays unsent until you press send.</p>
0438:             <label className="mt-3 grid gap-1 font-mono text-xs text-muted">
0439:               To
0440:               <input className="min-h-11 border border-line bg-bg px-3 font-mono text-sm text-fg" value={to} onChange={(event) => setTo(event.target.value)} placeholder={mailbox || "owner@studio.glyphoku.localhost"} />
0441:             </label>
0442:             <label className="mt-3 grid gap-1 font-mono text-xs text-muted">
0443:               Subject
0444:               <input className="min-h-11 border border-line bg-bg px-3 text-sm text-fg" value={subject} maxLength={120} onChange={(event) => setSubject(event.target.value)} />
0445:             </label>
0446:             <label className="mt-3 grid gap-1 font-mono text-xs text-muted">
0447:               Body
0448:               <textarea className="min-h-24 border border-line bg-bg px-3 py-2 text-sm text-fg" value={body} maxLength={4000} onChange={(event) => setBody(event.target.value)} />
0449:             </label>
0450:             <button type="button" className="mt-3 min-h-11 bg-seal px-4 font-mono text-xs text-seal-ink disabled:opacity-40" disabled={!mailbox || !gate.ok || composing || run?.phase === "LIVE SOLVING"} onClick={startEnvelope}>
0451:               Solve for Envelope
0452:             </button>
0453:             {openPermit && (
0454:               <div className="mt-4 border border-seal px-3 py-3">
0455:                 <p className="font-mono text-xs text-seal">ENVELOPE READY — NOT SENT</p>
0456:                 <p className="mt-2 text-sm">{openPermit.draft.subject}</p>
0457:                 <p className="text-sm text-muted">{openPermit.draft.from} → {openPermit.draft.to.join(", ")}</p>
0458:                 <button
0459:                   type="button"
0460:                   className="mt-3 min-h-11 border border-line px-4 font-mono text-xs"
0461:                   onClick={() => {
0462:                     setInstance((current) => {
0463:                       const permit = current.permits.find((item) => item.state === "READY");
0464:                       if (!permit) return current;
0465:                       const result = sendLocal(current, permit.id, permit.draft);
0466:                       if (!result.ok) {
0467:                         setLastEvent(result.reason);
0468:                         return current;
0469:                       }
0470:                       setLastEvent(result.instance === current ? "Already delivered." : "DELIVERED LOCAL");
0471:                       setRun((active) => (active ? { ...active, phase: "SENT", note: "Delivered to the local inbox." } : active));
0472:                       return result.instance;
0473:                     });
0474:                   }}
0475:                 >
0476:                   Send Local Email
0477:                 </button>
0478:               </div>
0479:             )}
0480:           </section>
0481:         </div>
0482:       </section>
0483: 
0484:       <section className="mt-8">
0485:         <h2 className="font-serif text-2xl">Local inbox</h2>
0486:         {instance.deliveries.length === 0 ? (
0487:           <p className="mt-2 text-sm text-muted">Nothing delivered. A queued flag is not a message.</p>
0488:         ) : (
0489:           <ul className="mt-3 grid gap-3">
0490:             {instance.deliveries.map((message) => (
0491:               <li key={message.id} className="border border-line px-3 py-3">
0492:                 <p className="font-mono text-xs text-muted">{message.from} → {message.mailbox}</p>
0493:                 <p className="mt-1 font-serif text-xl">{message.subject}</p>
0494:                 <p className="mt-1 text-sm">{message.body}</p>
0495:               </li>
0496:             ))}
0497:           </ul>
0498:         )}
0499:       </section>
0500: 
0501:       <footer className="mt-10 border-t border-line py-6 font-mono text-xs text-muted">
0502:         <p>
0503:           16×16 cipher, hard band. Speed only changes pacing. Ordinals after g=2 are paused. The 4,800 source controls stay NOT_ASSESSED. No public DNS, no coin.
0504:         </p>
0505:         {!gate.ok && <p className="mt-2 text-seal">{gate.reason}</p>}
0506:       </footer>
0507:     </main>
0508:   );
0509: }
```

## `src/lib/glyphoku/registry.ts`

```text
0001: import { issuanceAllowed, inBand, verifyCandidate, topologyFor, type Topology } from "./rules";
0002: import { sha256 } from "../sha256.ts";
0003: 
0004: export type Domain = { id: string; label: string; address: string; ordinal: number };
0005: export type Mailbox = { id: string; domainId: string; address: string; role: "owner" };
0006: export type Permit = {
0007:   id: string;
0008:   ordinal: number;
0009:   sender: string;
0010:   draftDigest: string;
0011:   recipients: string[];
0012:   bcc: string[];
0013:   state: "READY" | "QUEUED" | "DELIVERED_LOCAL";
0014:   draft: FrozenDraft;
0015: };
0016: export type Delivery = {
0017:   id: string;
0018:   permitId: string;
0019:   mailbox: string;
0020:   from: string;
0021:   to: string[];
0022:   subject: string;
0023:   body: string;
0024: };
0025: 
0026: export type Instance = {
0027:   g: number;
0028:   domains: Domain[];
0029:   mailboxes: Mailbox[];
0030:   permits: Permit[];
0031:   deliveries: Delivery[];
0032:   spentPermits: string[];
0033: };
0034: 
0035: export type FrozenDraft = {
0036:   from: string;
0037:   to: string[];
0038:   bcc: string[];
0039:   subject: string;
0040:   body: string;
0041:   digest: string;
0042: };
0043: 
0044: export function emptyInstance(): Instance {
0045:   return { g: 1, domains: [], mailboxes: [], permits: [], deliveries: [], spentPermits: [] };
0046: }
0047: 
0048: const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/;
0049: const RESERVED = new Set(["localhost", "mail", "www", "glyphoku"]);
0050: 
0051: export function normalizeLabel(raw: string): { ok: true; label: string } | { ok: false; reason: string } {
0052:   const label = raw.trim().toLowerCase();
0053:   if (!LABEL.test(label)) return { ok: false, reason: "Use a short lowercase label: letters, digits, and internal hyphens." };
0054:   if (RESERVED.has(label)) return { ok: false, reason: "That label is reserved." };
0055:   return { ok: true, label };
0056: }
0057: 
0058: export function domainAddress(label: string): string {
0059:   return `${label}.glyphoku.localhost`;
0060: }
0061: 
0062: function digest(value: string): string {
0063:   const bytes = new TextEncoder().encode(value);
0064:   return [...sha256(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
0065: }
0066: 
0067: export function freezeDraft(input: { from: string; to: string; bcc: string; subject: string; body: string }, instance: Instance): { ok: true; draft: FrozenDraft } | { ok: false; reason: string } {
0068:   if (/[\r\n]/.test(input.subject)) return { ok: false, reason: "The subject cannot contain a line break." };
0069:   const subject = input.subject.trim();
0070:   const body = input.body.replace(/\r\n/g, "\n");
0071:   if (subject.length < 1 || subject.length > 120) return { ok: false, reason: "Subject must be 1 to 120 characters." };
0072:   if (body.trim().length < 1 || body.length > 4000) return { ok: false, reason: "Body must be present and at most 4000 characters." };
0073:   const to = splitAddresses(input.to);
0074:   const bcc = splitAddresses(input.bcc);
0075:   if (to.length === 0) return { ok: false, reason: "Name at least one local recipient." };
0076:   const all = [...to, ...bcc];
0077:   for (const address of all) {
0078:     const found = resolveMailbox(address, instance);
0079:     if (!found.ok) return found;
0080:   }
0081:   if (!instance.mailboxes.some((box) => box.address === input.from)) {
0082:     return { ok: false, reason: "The sender is not a local mailbox on this instance." };
0083:   }
0084:   const draft: FrozenDraft = {
0085:     from: input.from,
0086:     to,
0087:     bcc,
0088:     subject,
0089:     body,
0090:     digest: digest(JSON.stringify({ from: input.from, to, bcc, subject, body })),
0091:   };
0092:   return { ok: true, draft };
0093: }
0094: 
0095: function splitAddresses(raw: string): string[] {
0096:   return [...new Set(raw.split(/[,\s]+/).map((part) => part.trim().toLowerCase()).filter(Boolean))];
0097: }
0098: 
0099: export function resolveMailbox(address: string, instance: Instance): { ok: true; address: string } | { ok: false; reason: string } {
0100:   const normalized = address.trim().toLowerCase();
0101:   if (!normalized.endsWith(".glyphoku.localhost")) {
0102:     return { ok: false, reason: "External recipients are refused before any lookup." };
0103:   }
0104:   if (!instance.mailboxes.some((box) => box.address === normalized)) {
0105:     return { ok: false, reason: "That mailbox is not on this local registry." };
0106:   }
0107:   return { ok: true, address: normalized };
0108: }
0109: 
0110: export function commitDomain(
0111:   instance: Instance,
0112:   labelRaw: string,
0113:   puzzles: { givens: readonly number[]; candidate: readonly number[] }[],
0114:   topology: Topology = topologyFor(instance.g),
0115: ): { ok: true; instance: Instance; domain: Domain; mailbox: Mailbox } | { ok: false; reason: string } {
0116:   const allowed = issuanceAllowed(instance.g);
0117:   if (!allowed.ok) return allowed;
0118:   const label = normalizeLabel(labelRaw);
0119:   if (!label.ok) return label;
0120:   if (instance.domains.some((domain) => domain.label === label.label)) {
0121:     return { ok: false, reason: "That local domain already exists." };
0122:   }
0123:   if (puzzles.length !== allowed.puzzles) {
0124:     return { ok: false, reason: `Ordinal ${instance.g} requires ${allowed.puzzles} verified puzzles.` };
0125:   }
0126:   for (const puzzle of puzzles) {
0127:     const verdict = verifyCandidate(puzzle.givens, puzzle.candidate, topology);
0128:     if (!verdict.ok) return verdict;
0129:     if (!inBand(instance.g, puzzle.givens, topology)) {
0130:       return { ok: false, reason: "A puzzle is outside the certified score band." };
0131:     }
0132:   }
0133:   const domain: Domain = {
0134:     id: `dom-${instance.domains.length + 1}`,
0135:     label: label.label,
0136:     address: domainAddress(label.label),
0137:     ordinal: instance.g,
0138:   };
0139:   const mailbox: Mailbox = {
0140:     id: `box-${instance.mailboxes.length + 1}`,
0141:     domainId: domain.id,
0142:     address: `owner@${domain.address}`,
0143:     role: "owner",
0144:   };
0145:   return {
0146:     ok: true,
0147:     domain,
0148:     mailbox,
0149:     instance: {
0150:       ...instance,
0151:       g: instance.g + 1,
0152:       domains: [...instance.domains, domain],
0153:       mailboxes: [...instance.mailboxes, mailbox],
0154:     },
0155:   };
0156: }
0157: 
0158: export function issuePermit(
0159:   instance: Instance,
0160:   draft: FrozenDraft,
0161:   puzzles: { givens: readonly number[]; candidate: readonly number[] }[],
0162:   topology: Topology = topologyFor(instance.g),
0163: ): { ok: true; instance: Instance; permit: Permit } | { ok: false; reason: string } {
0164:   const allowed = issuanceAllowed(instance.g);
0165:   if (!allowed.ok) return allowed;
0166:   if (puzzles.length !== allowed.puzzles) {
0167:     return { ok: false, reason: `Ordinal ${instance.g} requires ${allowed.puzzles} verified puzzles.` };
0168:   }
0169:   for (const puzzle of puzzles) {
0170:     const verdict = verifyCandidate(puzzle.givens, puzzle.candidate, topology);
0171:     if (!verdict.ok) return verdict;
0172:     if (!inBand(instance.g, puzzle.givens, topology)) {
0173:       return { ok: false, reason: "A puzzle is outside the certified score band." };
0174:     }
0175:   }
0176:   const existing = instance.permits.find((permit) => permit.draftDigest === draft.digest && permit.sender === draft.from);
0177:   if (existing) return { ok: true, instance, permit: existing };
0178:   const permit: Permit = {
0179:     id: `env-${instance.permits.length + 1}`,
0180:     ordinal: instance.g,
0181:     sender: draft.from,
0182:     draftDigest: draft.digest,
0183:     recipients: draft.to,
0184:     bcc: draft.bcc,
0185:     state: "READY",
0186:     draft,
0187:   };
0188:   return {
0189:     ok: true,
0190:     permit,
0191:     instance: { ...instance, g: instance.g + 1, permits: [...instance.permits, permit] },
0192:   };
0193: }
0194: 
0195: export function sendLocal(
0196:   instance: Instance,
0197:   permitId: string,
0198:   draft: FrozenDraft,
0199: ): { ok: true; instance: Instance } | { ok: false; reason: string } {
0200:   const permit = instance.permits.find((item) => item.id === permitId);
0201:   if (!permit) return { ok: false, reason: "No envelope permit." };
0202:   if (permit.draftDigest !== draft.digest || permit.sender !== draft.from) {
0203:     return { ok: false, reason: "This permit is bound to a different frozen draft." };
0204:   }
0205:   if (instance.spentPermits.includes(permit.id) || permit.state !== "READY") {
0206:     return { ok: true, instance };
0207:   }
0208:   const recipients = [...new Set([...permit.recipients, ...permit.bcc])];
0209:   const deliveries: Delivery[] = recipients.map((mailbox, index) => ({
0210:     id: `${permit.id}-${index}`,
0211:     permitId: permit.id,
0212:     mailbox,
0213:     from: draft.from,
0214:     to: draft.to,
0215:     subject: draft.subject,
0216:     body: draft.body,
0217:   }));
0218:   return {
0219:     ok: true,
0220:     instance: {
0221:       ...instance,
0222:       spentPermits: [...instance.spentPermits, permit.id],
0223:       permits: instance.permits.map((item) => (item.id === permit.id ? { ...item, state: "DELIVERED_LOCAL" as const } : item)),
0224:       deliveries: [...instance.deliveries, ...deliveries],
0225:     },
0226:   };
0227: }
```

## `src/lib/glyphoku/rules.ts`

```text
0001: /** Glyphoku houses: each glyph once per row, column, and box. */
0002: 
0003: export type Topology = {
0004:   order: number;
0005:   boxRows: number;
0006:   boxCols: number;
0007: };
0008: 
0009: /** The desk plays the 16×16 cipher. Smaller rungs are easier and are not dealt. */
0010: export const PLAYED: Topology = { order: 16, boxRows: 4, boxCols: 4 };
0011: 
0012: export const HORIZON_G = 2;
0013: 
0014: export function topologyFor(_ordinal: number): Topology {
0015:   return PLAYED;
0016: }
0017: 
0018: export function cellCount(topology: Topology): number {
0019:   return topology.order * topology.order;
0020: }
0021: 
0022: export function puzzlesRequired(ordinal: number): number {
0023:   if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 12) {
0024:     throw new Error("ordinal is outside the exact integer range");
0025:   }
0026:   return 2 ** (ordinal - 1);
0027: }
0028: 
0029: export function issuanceAllowed(ordinal: number): { ok: true; puzzles: number } | { ok: false; reason: string } {
0030:   if (!Number.isInteger(ordinal) || ordinal < 1) return { ok: false, reason: "Ordinal is not a positive integer." };
0031:   if (ordinal > HORIZON_G) {
0032:     return {
0033:       ok: false,
0034:       reason: `Issuance is paused at ordinal ${ordinal}. This profile has measured support only through g=${HORIZON_G} (${puzzlesRequired(HORIZON_G)} puzzles).`,
0035:     };
0036:   }
0037:   return { ok: true, puzzles: puzzlesRequired(ordinal) };
0038: }
0039: 
0040: /** Empty cells on the 16×16 cipher. g=2 sits above g=1, at the rulebook's hard line. */
0041: export function scoreBand(ordinal: number): { low: number; high: number } {
0042:   if (ordinal === 1) return { low: 124, high: 132 };
0043:   if (ordinal === 2) return { low: 133, high: 140 };
0044:   throw new Error("no certified score band for this ordinal");
0045: }
0046: 
0047: export function inBand(ordinal: number, givens: readonly number[], topology: Topology = topologyFor(ordinal)): boolean {
0048:   const band = scoreBand(ordinal);
0049:   const empty = givens.filter((value) => value === 0).length;
0050:   return empty >= band.low && empty <= band.high && givens.length === cellCount(topology);
0051: }
0052: 
0053: function boxOf(index: number, topology: Topology): number {
0054:   const row = Math.floor(index / topology.order);
0055:   const col = index % topology.order;
0056:   const boxRow = Math.floor(row / topology.boxRows);
0057:   const boxCol = Math.floor(col / topology.boxCols);
0058:   const boxesAcross = topology.order / topology.boxCols;
0059:   return boxRow * boxesAcross + boxCol;
0060: }
0061: 
0062: export function verifyCandidate(
0063:   givens: readonly number[],
0064:   candidate: readonly number[],
0065:   topology: Topology = PLAYED,
0066: ): { ok: true } | { ok: false; reason: string } {
0067:   const n = cellCount(topology);
0068:   if (givens.length !== n || candidate.length !== n) return { ok: false, reason: "Grid size does not match the topology." };
0069:   const rows = Array.from({ length: topology.order }, () => new Set<number>());
0070:   const cols = Array.from({ length: topology.order }, () => new Set<number>());
0071:   const boxes = Array.from({ length: topology.order }, () => new Set<number>());
0072:   for (let index = 0; index < n; index++) {
0073:     const given = givens[index]!;
0074:     const value = candidate[index]!;
0075:     if (!Number.isInteger(value) || value < 1 || value > topology.order) return { ok: false, reason: "A cell is outside the glyph set." };
0076:     if (given !== 0 && given !== value) return { ok: false, reason: "A given glyph was changed." };
0077:     const row = Math.floor(index / topology.order);
0078:     const col = index % topology.order;
0079:     const box = boxOf(index, topology);
0080:     if (rows[row]!.has(value) || cols[col]!.has(value) || boxes[box]!.has(value)) {
0081:       return { ok: false, reason: "A row, column, or box repeats a glyph." };
0082:     }
0083:     rows[row]!.add(value);
0084:     cols[col]!.add(value);
0085:     boxes[box]!.add(value);
0086:   }
0087:   return { ok: true };
0088: }
0089: 
0090: function popcount(value: number): number {
0091:   let x = value >>> 0;
0092:   x -= (x >>> 1) & 0x55555555;
0093:   x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
0094:   return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
0095: }
0096: 
0097: /** Unique-completion count. Stops at 2. A search that runs away is treated as not unique. */
0098: export function countSolutions(givens: readonly number[], topology: Topology = PLAYED, limit = 2): number {
0099:   const n = topology.order;
0100:   const full = (1 << n) - 1;
0101:   const rows = Array(n).fill(0);
0102:   const cols = Array(n).fill(0);
0103:   const boxes = Array(n).fill(0);
0104:   const empties: number[] = [];
0105:   for (let index = 0; index < givens.length; index++) {
0106:     const value = givens[index]!;
0107:     const row = Math.floor(index / n);
0108:     const col = index % n;
0109:     const box = boxOf(index, topology);
0110:     if (value === 0) empties.push(index);
0111:     else {
0112:       const bit = 1 << (value - 1);
0113:       rows[row] |= bit;
0114:       cols[col] |= bit;
0115:       boxes[box] |= bit;
0116:     }
0117:   }
0118:   let found = 0;
0119:   let nodes = 0;
0120:   const walk = (cursor: number): void => {
0121:     if (found >= limit || nodes > 250000) return;
0122:     if (cursor === empties.length) {
0123:       found++;
0124:       return;
0125:     }
0126:     nodes++;
0127:     let best = cursor;
0128:     let bestBits = 99;
0129:     for (let look = cursor; look < empties.length; look++) {
0130:       const index = empties[look]!;
0131:       const row = Math.floor(index / n);
0132:       const col = index % n;
0133:       const box = boxOf(index, topology);
0134:       const bits = popcount(full & ~(rows[row]! | cols[col]! | boxes[box]!));
0135:       if (bits < bestBits) {
0136:         bestBits = bits;
0137:         best = look;
0138:         if (bits <= 1) break;
0139:       }
0140:     }
0141:     if (bestBits === 0) return;
0142:     if (best !== cursor) {
0143:       const swap = empties[cursor]!;
0144:       empties[cursor] = empties[best]!;
0145:       empties[best] = swap;
0146:     }
0147:     const index = empties[cursor]!;
0148:     const row = Math.floor(index / n);
0149:     const col = index % n;
0150:     const box = boxOf(index, topology);
0151:     let mask = full & ~(rows[row]! | cols[col]! | boxes[box]!);
0152:     while (mask) {
0153:       const bit = mask & -mask;
0154:       mask ^= bit;
0155:       rows[row] |= bit;
0156:       cols[col] |= bit;
0157:       boxes[box] |= bit;
0158:       walk(cursor + 1);
0159:       rows[row] ^= bit;
0160:       cols[col] ^= bit;
0161:       boxes[box] ^= bit;
0162:       if (found >= limit) return;
0163:     }
0164:   };
0165:   walk(0);
0166:   return nodes > 250000 && found < 1 ? 2 : found;
0167: }
0168: 
0169: function random(seed: number): () => number {
0170:   let state = seed >>> 0 || 1;
0171:   return () => {
0172:     state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
0173:     return state / 4294967296;
0174:   };
0175: }
0176: 
0177: function shuffled<T>(values: T[], rng: () => number): T[] {
0178:   const copy = values.slice();
0179:   for (let i = copy.length - 1; i > 0; i--) {
0180:     const j = Math.floor(rng() * (i + 1));
0181:     const swap = copy[i]!;
0182:     copy[i] = copy[j]!;
0183:     copy[j] = swap;
0184:   }
0185:   return copy;
0186: }
0187: 
0188: function candidatesOf(board: readonly number[], index: number, topology: Topology): number[] {
0189:   if (board[index] !== 0) return [];
0190:   const used = new Set<number>();
0191:   const row = Math.floor(index / topology.order);
0192:   const col = index % topology.order;
0193:   const box = boxOf(index, topology);
0194:   for (let i = 0; i < board.length; i++) {
0195:     const value = board[i]!;
0196:     if (value === 0) continue;
0197:     const sameRow = Math.floor(i / topology.order) === row;
0198:     const sameCol = i % topology.order === col;
0199:     const sameBox = boxOf(i, topology) === box;
0200:     if (sameRow || sameCol || sameBox) used.add(value);
0201:   }
0202:   const out: number[] = [];
0203:   for (let value = 1; value <= topology.order; value++) if (!used.has(value)) out.push(value);
0204:   return out;
0205: }
0206: 
0207: function fill(topology: Topology, rng: () => number): number[] | null {
0208:   const board = Array.from({ length: cellCount(topology) }, () => 0);
0209:   const walk = (index: number): boolean => {
0210:     if (index === board.length) return true;
0211:     let next = index;
0212:     while (next < board.length && board[next] !== 0) next++;
0213:     if (next === board.length) return true;
0214:     for (const value of shuffled(candidatesOf(board, next, topology), rng)) {
0215:       board[next] = value;
0216:       if (walk(next + 1)) return true;
0217:       board[next] = 0;
0218:     }
0219:     return false;
0220:   };
0221:   return walk(0) ? board : null;
0222: }
0223: 
0224: /**
0225:  * Deal a unique 16×16 cipher at the hard end of the ordinal's band.
0226:  * The finished grid used to punch givens is discarded.
0227:  */
0228: export function dealGivens(ordinal: number, seed: number, topology: Topology = topologyFor(ordinal)): number[] {
0229:   const band = scoreBand(ordinal);
0230:   const rng = random(seed || 1);
0231:   const solved = fill(topology, rng);
0232:   if (!solved) throw new Error("the dealer could not fill a cipher");
0233:   const givens = solved.slice();
0234:   let empty = 0;
0235:   for (const index of shuffled(givens.map((_, cell) => cell), rng)) {
0236:     if (empty >= band.high) break;
0237:     const saved = givens[index]!;
0238:     givens[index] = 0;
0239:     if (countSolutions(givens, topology, 2) !== 1) givens[index] = saved;
0240:     else empty++;
0241:   }
0242:   if (!inBand(ordinal, givens, topology)) {
0243:     throw new Error("the dealer could not reach the hard cipher band");
0244:   }
0245:   return givens;
0246: }
```

## `src/lib/glyphoku/deal.ts`

```text
0001: import { createSolver } from "./solver";
0002: import { dealGivens, topologyFor } from "./rules";
0003: 
0004: /** Keep the hardest cipher that still finishes: the most guesses under the event cap. */
0005: export function dealPlayable(ordinal: number, seed: number): number[] {
0006:   const cap = ordinal === 1 ? 12000 : 18000;
0007:   const minimumGuesses = ordinal === 1 ? 8 : 12;
0008:   const topology = topologyFor(ordinal);
0009:   let best: { givens: number[]; guesses: number } | null = null;
0010:   for (let attempt = 0; attempt < 4; attempt++) {
0011:     let givens: number[];
0012:     try {
0013:       givens = dealGivens(ordinal, (seed + attempt * 97) >>> 0);
0014:     } catch {
0015:       continue;
0016:     }
0017:     const solver = createSolver(givens, topology);
0018:     let events = 0;
0019:     let guesses = 0;
0020:     let solved = false;
0021:     for (;;) {
0022:       const event = solver.step();
0023:       if (!event) break;
0024:       events++;
0025:       if (event.type === "GUESS") guesses++;
0026:       if (event.type === "SEARCH_SOLVED") {
0027:         solved = true;
0028:         break;
0029:       }
0030:       if (events > cap) break;
0031:     }
0032:     if (solved && guesses >= minimumGuesses && (!best || guesses > best.guesses)) {
0033:       best = { givens, guesses };
0034:     }
0035:   }
0036:   if (!best) throw new Error("No 16×16 cipher in the hard band finished inside the solver budget.");
0037:   return best.givens;
0038: }
```

## `src/lib/glyphoku/solver.ts`

```text
0001: import { cellCount, verifyCandidate, type Topology } from "./rules";
0002: 
0003: export type SolveEventType =
0004:   | "INIT"
0005:   | "ASSIGN"
0006:   | "GUESS"
0007:   | "CONTRADICTION"
0008:   | "RETRACT"
0009:   | "SEARCH_SOLVED"
0010:   | "SEARCH_EXHAUSTED";
0011: 
0012: export type SolveEvent = {
0013:   seq: number;
0014:   type: SolveEventType;
0015:   cell: number | null;
0016:   oldValue: number;
0017:   newValue: number;
0018:   rule: string;
0019:   depth: number;
0020:   nodes: number;
0021: };
0022: 
0023: type Kind = "given" | "derived" | "guess" | "empty";
0024: type Placement = { cell: number; value: number };
0025: type Frame = { cell: number; options: number[]; placed: Placement[] };
0026: 
0027: /**
0028:  * Live search. Each `step` performs the next real mutation.
0029:  * The constructor accepts givens only — there is no solution argument.
0030:  */
0031: export function createSolver(givens: readonly number[], topology: Topology) {
0032:   const n = cellCount(topology);
0033:   if (givens.length !== n) throw new Error("givens do not match the topology");
0034:   const board = givens.slice();
0035:   const kind: Kind[] = givens.map((value) => (value === 0 ? "empty" : "given"));
0036:   const root: Placement[] = [];
0037:   const stack: Frame[] = [];
0038:   let retry: Frame | null = null;
0039:   let seq = 0;
0040:   let nodes = 0;
0041:   let phase: "init" | "search" | "contradict" | "retry" | "done" = "init";
0042:   let outcome: "solved" | "exhausted" | null = null;
0043: 
0044:   function candidates(index: number): number[] {
0045:     if (board[index] !== 0) return [];
0046:     const used = new Set<number>();
0047:     const row = Math.floor(index / topology.order);
0048:     const col = index % topology.order;
0049:     const box =
0050:       Math.floor(row / topology.boxRows) * (topology.order / topology.boxCols) +
0051:       Math.floor(col / topology.boxCols);
0052:     for (let i = 0; i < n; i++) {
0053:       const value = board[i]!;
0054:       if (!value) continue;
0055:       const r = Math.floor(i / topology.order);
0056:       const c = i % topology.order;
0057:       const b =
0058:         Math.floor(r / topology.boxRows) * (topology.order / topology.boxCols) + Math.floor(c / topology.boxCols);
0059:       if (r === row || c === col || b === box) used.add(value);
0060:     }
0061:     const values: number[] = [];
0062:     for (let value = topology.order; value >= 1; value--) if (!used.has(value)) values.push(value);
0063:     return values;
0064:   }
0065: 
0066:   function place(cell: number, value: number, placementKind: "derived" | "guess", into: Placement[]) {
0067:     board[cell] = value;
0068:     kind[cell] = placementKind;
0069:     into.push({ cell, value });
0070:   }
0071: 
0072:   function nakedSingle(): { cell: number; value: number } | null {
0073:     for (let index = 0; index < n; index++) {
0074:       if (board[index] !== 0) continue;
0075:       const values = candidates(index);
0076:       if (values.length === 1) return { cell: index, value: values[0]! };
0077:     }
0078:     return null;
0079:   }
0080: 
0081:   function blocked(): boolean {
0082:     for (let index = 0; index < n; index++) {
0083:       if (board[index] === 0 && candidates(index).length === 0) return true;
0084:     }
0085:     return false;
0086:   }
0087: 
0088:   function event(type: SolveEventType, cell: number | null, oldValue: number, newValue: number, rule: string): SolveEvent {
0089:     seq++;
0090:     return { seq, type, cell, oldValue, newValue, rule, depth: stack.length, nodes };
0091:   }
0092: 
0093:   return {
0094:     givens: givens.slice(),
0095:     snapshot() {
0096:       return { board: board.slice(), kind: kind.slice(), depth: stack.length, nodes, outcome };
0097:     },
0098:     step(): SolveEvent | null {
0099:       if (phase === "done") return null;
0100:       if (phase === "init") {
0101:         phase = "search";
0102:         return event("INIT", null, 0, 0, "GIVENS");
0103:       }
0104:       if (phase === "retry" && retry) {
0105:         const value = retry.options.shift()!;
0106:         retry.placed = [];
0107:         place(retry.cell, value, "guess", retry.placed);
0108:         stack.push(retry);
0109:         retry = null;
0110:         phase = "search";
0111:         nodes++;
0112:         return event("GUESS", stack[stack.length - 1]!.cell, 0, value, "MRV");
0113:       }
0114:       if (phase === "contradict") {
0115:         const frame = stack[stack.length - 1];
0116:         if (!frame) {
0117:           phase = "done";
0118:           outcome = "exhausted";
0119:           return event("SEARCH_EXHAUSTED", null, 0, 0, "NO_BRANCH");
0120:         }
0121:         const last = frame.placed.pop();
0122:         if (!last) {
0123:           stack.pop();
0124:           return event("RETRACT", frame.cell, 0, 0, "BACKTRACK");
0125:         }
0126:         board[last.cell] = 0;
0127:         kind[last.cell] = "empty";
0128:         if (frame.placed.length === 0) {
0129:           stack.pop();
0130:           if (frame.options.length > 0) {
0131:             retry = frame;
0132:             phase = "retry";
0133:           }
0134:         }
0135:         return event("RETRACT", last.cell, last.value, 0, "BACKTRACK");
0136:       }
0137: 
0138:       const into = stack.length > 0 ? stack[stack.length - 1]!.placed : root;
0139:       const single = nakedSingle();
0140:       if (single) {
0141:         place(single.cell, single.value, "derived", into);
0142:         nodes++;
0143:         return event("ASSIGN", single.cell, 0, single.value, "NAKED_SINGLE");
0144:       }
0145:       if (blocked()) {
0146:         phase = "contradict";
0147:         return event("CONTRADICTION", null, 0, 0, "EMPTY_DOMAIN");
0148:       }
0149:       if (board.every((value) => value !== 0)) {
0150:         phase = "done";
0151:         outcome = "solved";
0152:         return event("SEARCH_SOLVED", null, 0, 0, "COMPLETE");
0153:       }
0154:       let bestCell = -1;
0155:       let bestValues: number[] = [];
0156:       for (let index = 0; index < n; index++) {
0157:         if (board[index] !== 0) continue;
0158:         const values = candidates(index);
0159:         if (bestCell < 0 || values.length < bestValues.length) {
0160:           bestCell = index;
0161:           bestValues = values;
0162:         }
0163:       }
0164:       if (bestCell < 0 || bestValues.length === 0) {
0165:         phase = "contradict";
0166:         return event("CONTRADICTION", bestCell < 0 ? null : bestCell, 0, 0, "EMPTY_DOMAIN");
0167:       }
0168:       const placed: Placement[] = [];
0169:       place(bestCell, bestValues[0]!, "guess", placed);
0170:       stack.push({ cell: bestCell, options: bestValues.slice(1), placed });
0171:       nodes++;
0172:       return event("GUESS", bestCell, 0, bestValues[0]!, "MRV");
0173:     },
0174:   };
0175: }
0176: 
0177: export type Solver = ReturnType<typeof createSolver>;
0178: 
0179: /** Run the live stepper to completion. Tests use this; the view calls `step` on a timer. */
0180: export function runSolver(givens: readonly number[], topology: Topology): { events: SolveEvent[]; board: number[] } {
0181:   const solver = createSolver(givens, topology);
0182:   const events: SolveEvent[] = [];
0183:   for (;;) {
0184:     const next = solver.step();
0185:     if (!next) break;
0186:     events.push(next);
0187:     if (events.length > 200000) throw new Error("solver exceeded the local event budget");
0188:   }
0189:   return { events, board: solver.snapshot().board };
0190: }
0191: 
0192: export function replayBoard(givens: readonly number[], events: readonly SolveEvent[]): number[] {
0193:   const board = givens.slice();
0194:   for (const item of events) {
0195:     if (item.type === "ASSIGN" || item.type === "GUESS") {
0196:       if (item.cell === null || board[item.cell] !== 0) throw new Error("event overwrites a filled cell");
0197:       board[item.cell] = item.newValue;
0198:     } else if (item.type === "RETRACT") {
0199:       if (item.cell === null || board[item.cell] !== item.oldValue) throw new Error("retraction does not match the board");
0200:       board[item.cell] = 0;
0201:     }
0202:   }
0203:   return board;
0204: }
```

## `src/lib/glyphoku/glyphs.ts`

```text
0001: /** Cipher alphabets from the Glyphoku board. Values in the solver are 1-based indexes into these. */
0002: 
0003: const SYMBOLS = ["★", "◆", "♠", "♣", "♥", "●", "▲", "■", "☾", "⚑", "✦", "✚"];
0004: 
0005: export function glyphsFor(order: number): readonly string[] {
0006:   if (order === 4) return ["1", "A", "★", "◆"];
0007:   if (order === 9) return ["1", "2", "3", "A", "B", "C", "★", "◆", "♠"];
0008:   if (order === 16) return ["1", "2", "3", "4", "5", "6", "A", "B", "C", "D", "E", "★", "◆", "♠", "♣", "♥"];
0009:   const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
0010:   const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
0011:   const digitCount = Math.max(1, Math.round(order * 0.4));
0012:   const letterCount = Math.max(1, Math.round(order * 0.35));
0013:   const out: string[] = [];
0014:   for (let i = 0; i < digitCount && out.length < order; i++) out.push(digits[i]!);
0015:   for (let i = 0; i < letterCount && out.length < order; i++) out.push(letters[i]!);
0016:   for (let i = 0; i < SYMBOLS.length && out.length < order; i++) out.push(SYMBOLS[i]!);
0017:   let extra = 0;
0018:   while (out.length < order) out.push(letters[letterCount + extra++] ?? `G${out.length}`);
0019:   return out;
0020: }
0021: 
0022: export function glyphText(order: number, value: number): string {
0023:   if (value <= 0) return "";
0024:   return glyphsFor(order)[value - 1] ?? "";
0025: }
0026: 
0027: export function glyphKind(glyph: string): "digit" | "letter" | "symbol" | "empty" {
0028:   if (!glyph) return "empty";
0029:   if (/[0-9]/.test(glyph)) return "digit";
0030:   if (/[A-Za-z]/.test(glyph)) return "letter";
0031:   return "symbol";
0032: }
```

## `src/lib/glyphoku/glyphoku.test.ts`

```text
0001: import assert from "node:assert/strict";
0002: import test from "node:test";
0003: import { dealPlayable } from "./deal.ts";
0004: import { glyphsFor } from "./glyphs.ts";
0005: import {
0006:   commitDomain,
0007:   emptyInstance,
0008:   freezeDraft,
0009:   issuePermit,
0010:   resolveMailbox,
0011:   sendLocal,
0012: } from "./registry.ts";
0013: import { PLAYED, inBand, issuanceAllowed, puzzlesRequired, scoreBand, verifyCandidate, dealGivens } from "./rules.ts";
0014: import { replayBoard, runSolver } from "./solver.ts";
0015: 
0016: function empties(givens: readonly number[]): number {
0017:   return givens.filter((value) => value === 0).length;
0018: }
0019: 
0020: test("the cipher alphabet is glyphs, and the hard bands step up", () => {
0021:   const alphabet = glyphsFor(16);
0022:   assert.equal(alphabet.length, 16);
0023:   assert.ok(alphabet.includes("1"));
0024:   assert.ok(alphabet.includes("A"));
0025:   assert.ok(alphabet.includes("★"));
0026:   assert.equal(puzzlesRequired(1), 1);
0027:   assert.equal(puzzlesRequired(2), 2);
0028:   assert.equal(issuanceAllowed(3).ok, false);
0029:   assert.ok(scoreBand(2).low > scoreBand(1).high);
0030:   assert.equal(PLAYED.order, 16);
0031: });
0032: 
0033: test("a dealt cipher is a hard 16×16 with a real search", () => {
0034:   const givens = dealGivens(2, 1);
0035:   assert.equal(givens.length, 256);
0036:   assert.equal(inBand(2, givens), true);
0037:   assert.ok(empties(givens) > empties(dealGivens(1, 1)));
0038:   const solved = runSolver(givens, PLAYED);
0039:   assert.equal(solved.events[0]?.type, "INIT");
0040:   assert.equal(solved.events.at(-1)?.type, "SEARCH_SOLVED");
0041:   assert.ok(solved.events.some((event) => event.type === "GUESS"));
0042:   assert.ok(solved.events.some((event) => event.type === "RETRACT"));
0043:   assert.equal(verifyCandidate(givens, solved.board, PLAYED).ok, true);
0044:   assert.deepEqual(replayBoard(givens, solved.events), solved.board);
0045:   const playable = dealPlayable(1, 1);
0046:   const replay = runSolver(playable, PLAYED);
0047:   assert.ok(replay.events.filter((event) => event.type === "GUESS").length >= 8);
0048: });
0049: 
0050: test("domain, envelope, and the refusal cases still hold on the cipher", () => {
0051:   const domainPuzzle = dealGivens(1, 2);
0052:   const domainSolved = runSolver(domainPuzzle, PLAYED);
0053:   let instance = emptyInstance();
0054:   const broken = domainSolved.board.slice();
0055:   broken[domainPuzzle.findIndex((value) => value === 0)] = 0;
0056:   assert.equal(commitDomain(instance, "Studio", [{ givens: domainPuzzle, candidate: broken }]).ok, false);
0057:   const created = commitDomain(instance, "Studio", [{ givens: domainPuzzle, candidate: domainSolved.board }]);
0058:   assert.equal(created.ok, true);
0059:   if (!created.ok) return;
0060:   instance = created.instance;
0061:   assert.equal(created.mailbox.address, "owner@studio.glyphoku.localhost");
0062:   assert.equal(resolveMailbox("outsider@example.com", instance).ok, false);
0063:   const frozen = freezeDraft(
0064:     { from: created.mailbox.address, to: created.mailbox.address, bcc: "", subject: "Cipher", body: "Filed." },
0065:     instance,
0066:   );
0067:   assert.equal(frozen.ok, true);
0068:   if (!frozen.ok) return;
0069:   assert.equal(issuePermit(instance, frozen.draft, [{ givens: domainPuzzle, candidate: domainSolved.board }]).ok, false);
0070:   const puzzles = [11, 29].map((seed) => {
0071:     const givens = dealPlayable(2, seed);
0072:     return { givens, candidate: runSolver(givens, PLAYED).board };
0073:   });
0074:   const permit = issuePermit(instance, frozen.draft, puzzles);
0075:   assert.equal(permit.ok, true);
0076:   if (!permit.ok) return;
0077:   assert.equal(permit.instance.g, 3);
0078:   const sent = sendLocal(permit.instance, permit.permit.id, frozen.draft);
0079:   assert.equal(sent.ok, true);
0080:   if (!sent.ok) return;
0081:   const again = sendLocal(sent.instance, permit.permit.id, frozen.draft);
0082:   assert.equal(again.ok, true);
0083:   if (!again.ok) return;
0084:   assert.equal(again.instance.deliveries.length, 1);
0085: });
```

## `scripts/with-app-env.mjs`

```text
0001: #!/usr/bin/env node
0002: /**
0003:  * Run a command with `.grok/app-env.json` merged into its environment.
0004:  *
0005:  * `dev`, `build` and `preview` all route through this wrapper, so the dev
0006:  * server, the built bundle and the preview server can never disagree about
0007:  * `VITE_AUTH_ENABLED` — a divergence that only shows up as a built-output
0008:  * mismatch long after the fact. Anything that starts Vite directly bypasses it.
0009:  *
0010:  * Only `VITE_`-prefixed keys are honored: the file is a build flag carrier, not
0011:  * a secret store, and only `VITE_` vars reach the browser anyway. A real
0012:  * `process.env` entry always wins, so an explicit override still works.
0013:  *
0014:  * That precedence also means the file governs this workspace only. A deployed
0015:  * build runs with the provider's project env, where the deployer sets
0016:  * `VITE_AUTH_ENABLED` itself (today unconditionally `"true"`), so the deployed
0017:  * flag is the platform's, not this file's.
0018:  *
0019:  * Vite picks the values up because `loadEnv` prefix-matches entries already in
0020:  * `process.env`, which is why the merge has to happen before Vite starts.
0021:  */
0022: import { spawn } from "node:child_process";
0023: import { readFileSync, realpathSync } from "node:fs";
0024: import { constants as osConstants } from "node:os";
0025: import { dirname, join } from "node:path";
0026: import { fileURLToPath } from "node:url";
0027: 
0028: export const APP_ENV_REL_PATH = ".grok/app-env.json";
0029: 
0030: const VITE_PREFIX = "VITE_";
0031: 
0032: /**
0033:  * Parse an app-env document, keeping only `VITE_`-prefixed string entries.
0034:  * Anything unparseable is an empty environment — a workspace without the file
0035:  * must behave exactly like today (auth on, no overrides).
0036:  */
0037: export function parseAppEnv(text) {
0038:   let parsed;
0039:   try {
0040:     parsed = JSON.parse(text);
0041:   } catch {
0042:     return {};
0043:   }
0044:   if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
0045:   const env = {};
0046:   for (const [key, value] of Object.entries(parsed)) {
0047:     if (!key.startsWith(VITE_PREFIX)) continue;
0048:     if (typeof value !== "string") continue;
0049:     env[key] = value;
0050:   }
0051:   return env;
0052: }
0053: 
0054: /** The app env recorded under `root`, or `{}` when the file is absent. */
0055: export function readAppEnv(root) {
0056:   try {
0057:     return parseAppEnv(readFileSync(join(root, APP_ENV_REL_PATH), "utf8"));
0058:   } catch {
0059:     return {};
0060:   }
0061: }
0062: 
0063: /** File values under the process environment: an explicit override wins. */
0064: export function mergeAppEnv(appEnv, processEnv) {
0065:   return { ...appEnv, ...processEnv };
0066: }
0067: 
0068: /**
0069:  * Translate a child's `exit` `(code, signal)` into this process's exit status.
0070:  *
0071:  * Do not re-raise the signal with `process.kill(process.pid, signal)`: under
0072:  * qemu-user (amd64 image builds on an arm host) a self-directed signal is
0073:  * routinely delivered as SIGSEGV to the wrong process, which takes down the
0074:  * test worker and fails the image build. `128 + signo` is what a shell reports
0075:  * for a signal-killed command, so a cancelled `vite build` is still a failure.
0076:  */
0077: export function exitStatusFromChild(code, signal) {
0078:   if (signal) {
0079:     const signo = osConstants.signals[signal];
0080:     return 128 + (typeof signo === "number" ? signo : 1);
0081:   }
0082:   return code ?? 1;
0083: }
0084: 
0085: /** The workspace root (this file lives in `<root>/scripts/`). */
0086: export function projectRoot() {
0087:   return dirname(dirname(fileURLToPath(import.meta.url)));
0088: }
0089: 
0090: /**
0091:  * Whether `moduleUrl` is the script node was asked to run.
0092:  *
0093:  * Both sides are resolved through symlinks: node realpaths `import.meta.url`
0094:  * but leaves `process.argv[1]` as typed, so comparing them raw makes a CLI
0095:  * launched through a symlinked path (`/tmp` on macOS) a silent no-op.
0096:  */
0097: export function isMainModule(moduleUrl) {
0098:   const entry = process.argv[1];
0099:   if (!entry) return false;
0100:   try {
0101:     return realpathSync(entry) === fileURLToPath(moduleUrl);
0102:   } catch {
0103:     return false;
0104:   }
0105: }
0106: 
0107: function main(argv) {
0108:   const [command, ...args] = argv;
0109:   if (!command) {
0110:     console.error("usage: node scripts/with-app-env.mjs <command> [args…]");
0111:     process.exit(2);
0112:   }
0113:   const env = mergeAppEnv(readAppEnv(projectRoot()), process.env);
0114:   const child = spawn(command, args, { stdio: "inherit", env });
0115:   // The dev server is long-running and is stopped by signalling this wrapper.
0116:   for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
0117:     process.on(signal, () => child.kill(signal));
0118:   }
0119:   child.on("error", (err) => {
0120:     console.error(`[with-app-env] failed to run ${command}:`, err?.message || err);
0121:     process.exit(127);
0122:   });
0123:   child.on("exit", (code, signal) => {
0124:     process.exit(exitStatusFromChild(code, signal));
0125:   });
0126: }
0127: 
0128: if (isMainModule(import.meta.url)) {
0129:   main(process.argv.slice(2));
0130: }
```
