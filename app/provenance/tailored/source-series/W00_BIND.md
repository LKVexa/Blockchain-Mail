# W00 — Bind the machine

**Status: NOT_STARTED**

## Do

Open the workspace. Confirm these files exist and are the ones you will change, if you change any:

- `src/lib/glyphoku/registry.ts`
- `src/lib/glyphoku/rules.ts`
- `src/lib/glyphoku/deal.ts`
- `src/lib/glyphoku/solver.ts`
- `src/lib/glyphoku/glyphs.ts`
- `src/components/glyphoku/studio.tsx`

Record the profile string `GLYPHOKU_VEM_127/1`. Record that storage is `glyphoku-local-127` on loopback in the browser, not a server mailbox. Record that `src/lib/bem-mail.ts` is out of scope.

## Pass

The bind note names those six files, the storage key, and the out-of-scope lab. No new mail transport was added.

## Fail

A second registry, an SMTP client, or a public DNS name appears in the bind note as if it were this machine.

## Evidence

File list and a one-paragraph bind note. No test result is required yet.
