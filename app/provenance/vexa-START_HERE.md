# Start Vexa127 2.1.0

## New Windows installation

Extract the complete folder to a short path such as `D:\Vexa127`. Do not run from inside the ZIP. No administrator access is required. The application needs Node.js 22.16 or newer with the required built-in SQLite and crypto capabilities; `tools/preflight.mjs` checks them. **No Node executable is bundled.**

Run `CHECK_PACKAGE.cmd`, then `TEST.cmd`, then `RUN.cmd`. With no compatible runtime present, explicitly run `SETUP_RUNTIME.cmd` to provision the optional pinned official Windows-x64 runtime; this is a separate ONLINE action, not ordinary server startup. Runtime setup and the `.cmd` launchers were not executed on Windows in this delivery. Do not disable security protections if Windows refuses a runtime.

Open `http://127.0.0.1:8787` after the console reports that the HTTP and SMTP listeners are ready. Read `state\credentials.secret.json` **locally** and paste the `postmaster@local.test` token into the login form. The second mailbox is `user@local.test`. Compose a message to the second mailbox, lock the first mailbox, and sign into the second to read it. No public email will be sent.

Tokens and keys are generated on first start. Keep them private. After token rotation, the original credential file is stale for that account; retain the newly returned token.

## Existing 2.0.0 state

Make a private backup using the old operator interface and stop the old service. Keep both the backup and prior release. Extract 2.1.0 into a new folder, and in Command Prompt opened in that folder run:

```bat
set "VEXA127_STATE=D:\Vexa127-State"
VERIFY.cmd
RUN.cmd
```

Replace the example with the actual old state directory. Its original keys and credentials must remain together. Do not point at an unrelated Grok catalogue, overwrite a state folder with newly initialized files, run simultaneous writers, or assume the upgrade validates every historical record without running verification. The delivered compatibility exercise covers synthetic 2.0.0 state on Linux, not arbitrary user data or Windows filesystem behavior.

## Port conflict

Choose explicit alternate ports without killing other processes or changing firewall rules:

```bat
set "VEXA127_HTTP_PORT=18887"
set "VEXA127_SMTP_PORT=12525"
RUN.cmd
```

Then open the printed address. All listeners remain literal `127.0.0.1`. A normal start does not fetch DNS/MX records, contact RPC nodes, install npm dependencies or download website assets. Never expose or tunnel this no-TLS service to an untrusted network.

## Linux test environment

```sh
node tools/preflight.mjs
node tools/run-tests.mjs
node src/main.mjs serve
```

`START.sh` is also supplied; where extraction has not retained execute permission, invoke `sh START.sh`. Stop the foreground server using Ctrl+C. The optional Python/Playwright DOM fixture is developer-only and not needed to run the application.

## Acceptance still required

On the actual Windows target, verify startup, authenticated SMTP, direct browser login/send/read, token rotation, logout during a pending operation, pagination past 100 messages, backup/restore, restart and both default/alternate ports. Capture observed outcomes without disabling browser security policy. The delivery includes a bounded working local prototype, not production or independent institutional certification.
