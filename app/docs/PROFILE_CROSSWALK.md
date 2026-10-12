# Explicit integration profile crosswalk

## Authority for this run

The user requested execution of the attached master prompt/workflow to combine the attached blockchain candidate with the preceding Vexa127 server. This authorized changes in a separate working copy and synthetic local verification. It did not authorize external email, public-chain deployment, real assets, destruction of user state, invented approvals, or rewriting the supplied source as though it prescribed a different architecture.

The tailored source defines `GLYPHOKU_VEM_127/1` and explicitly expects one **browser** registry. Vexa127 has one **server** SQLite authority. We selected a new implementation profile, `GLYPHOKU_VEXA127/2`, to fulfill the combination request. This is an authored design decision with pending institutional review; the source files remain byte-identical in `provenance/tailored`.

| Boundary | Supplied tailored contract | Delivered explicit composition | Acceptance consequence |
|---|---|---|---|
| Registry authority | `glyphoku-local-127` localStorage key, same-origin browser owner | One encrypted `GLYPHOKU_LOCAL_REGISTRY/2` object in Vexa SQLite, signed state pointer | Original browser persistence case not passed by server evidence |
| Exclusive mutation | Web Lock plus reread/write/readback | Existing server process lock, SQLite transaction, signed state commitment and operation lookup | Cross-tab writes serialize at one server; Web Locks absent by design |
| Domain mailbox | Browser registry resource | Same game resource plus actual Vexa mailbox account, created atomically | Real account creation tested, headed original acceptance still blocked |
| Permit | READY browser record | READY record plus signed `GLYPHOKU_GAME_V1` stamp, cost zero, no financial token | No substitution claim for UTXO/ERC-4337 or public postage |
| Delivery | Browser-local recipient rows | Actual encrypted mail object and Inbox/Sent rows with spent permit and receipt in same transaction | API evidence proves local storage/delivery, not a headed journey |
| Solver | Real incremental given-only live solver | Same contract moved to server coordinator, frontend renders bounded frames | Client arrays cannot grant authority; acknowledgments are cooperative only |
| Live visibility | Initial/final render fence and visible pacing | React double-animation-frame acknowledgment, visibility/intersection pause, no pending-frame advance | Actual server navigation blocked; offline mock UI evidence is not sufficient |
| Legacy data | Validate/migrate compatible browser state under source rules | Read-only legacy export; no automatic import or mutation | Full browser schema migration/recovery remains unexecuted |
| Runtime | Supplied hosted framework/lockfile and candidate route | Same Glyphoku component with separate minimal offline entry, existing compiled React wrapper | Whole hosted build/typecheck not claimed; hosted auth/routes inactive |
| Horizon | g=1 domain, g=2 envelope, g≥3 pause | Preserved exactly | Only one game owner mailbox and one permit; unlimited issuance not added |
| Other blockchain apps | BEM/Obscura and nested packs outside authority | Unchanged provenance, not activated or merged | No second chain authority or unreviewed protocol composition |

## Shared transaction boundaries

**Domain:** validate current signed state and expected game revision -> validate one fresh complete live receipt -> insert actual owner account -> serialize encrypted registry revision 1 -> append signed domain/consumed-run event -> commit -> read committed operation -> publish success.

**Envelope:** revalidate canonical draft and two different fresh live receipts -> create signed game stamp -> serialize READY registry revision 2 (g=3) -> append envelope/consumed-run events -> commit -> publish READY, without creating mail rows.

**Send:** revalidate frozen draft/permit/current local accounts -> resolve an existing exact operation without new effects, or check current revision/consent/capacity -> write encrypted mail and one recipient role per unique address plus one Sent role -> consume signed stamp -> persist spent permit, registry revision 3 and operation receipt -> append signed events -> commit. Receipt roles remain immutable when the user later moves a mailbox row to Trash.

The game state is one subsystem of Vexa's signed state, not a second unsynchronized database. The existing credit profile remains tagged separately. A game mailbox cannot bypass its game stamp through the old credit send, stamp cancellation or credential-rotation APIs.

## Parameters selected by this implementation

Preparation: 45-second worker deadline, 46-second external watchdog, 25,000,000 aggregate node ceiling, 64 attempts, 100,000 fill nodes per attempt, 250,000 uniqueness nodes per candidate, 96-MB worker old-generation limit. These are bounded laboratory settings, not source-proven capacity targets. Budget exhaustion refuses issuance; it does not lower the specified difficulty.

Run observer lease: five minutes since the last authenticated run interaction. The desk sends read-only heartbeat polls every ten seconds even while hidden/paused; hidden frames cannot advance. Absolute run lifetime: 120 minutes. Restart invalidates unfinished live capabilities. There is no automatic resource creation from a recovered solver result. Maximum plaintext registry: 8 MiB; encrypted registry object: 12 MiB; only revisions 0–3 for this profile. Public HTTP accepts at most 1.2 MB per JSON request. All initial/final frames and trace roots remain bound to the exact run, instance, action, ordinal and immutable intent.

Review these parameters and new-profile decisions before wider operation. The supplied source is not silently edited to mark them approved.
