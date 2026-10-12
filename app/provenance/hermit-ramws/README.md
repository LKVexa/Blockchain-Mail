# HERMIT framing source reference

`src/ramws-framing.cjs` is a byte-for-byte copy of `gateway/ws.js` from the user-supplied `hermit-ramws_2.0.0-ramws.1(3).zip`. The source archive, entry and packaged file SHA-256 values are recorded in `SOURCE.json`; its original license is retained in `LICENSE`.

Only RFC 6455 framing is reused. HERMIT's terminal sessions, SPIRAL commands, execution, deployment files, authentication configuration and `hermit.vws.v2` terminal message protocol are not imported. The separate `src/virtual-mail-socket.mjs` adapter uses `workspace.mail.v1`, existing encrypted mailbox API frames, account-bound admission and a fixed mailbox operation allowlist. It listens through the existing server bound to `127.0.0.1`.

This local transport provides a protected mailbox connection within Workspace391. It does not create a remote SMTP relay, unblock an Internet provider's SMTP port restrictions, or establish a public mail domain.
