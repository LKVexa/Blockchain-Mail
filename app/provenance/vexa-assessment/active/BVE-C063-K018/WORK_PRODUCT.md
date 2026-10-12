# BVE-C063-K018 — continuation evidence mapping

**Run:** LOCAL127-R03 · **Candidate:** 2.1.0-local.1 · **Source status:** BLOCKED

## Unchanged source contract

**Requirement:** Apply access revocation consistently to cached results.

**Verification:** Exercise the stated edge, transition, recovery, uncertainty, or sensitivity case using the original approved oracle. Compare before-and-after state or conclusions; retain ordering, timing, and version context where relevant.

**Pass criteria:** The edge-case outcome follows the approved specification, preserves required invariants, and exposes unresolved or partial outcomes instead of fabricating certainty. Any changed assumption is reviewed.

## Actual bounded work

Session logout/identity change aborts pending requests and rejects late data, file preparation and obsolete UI errors. Server token rotation refuses the old bearer.

The linked domain artifact is `docs/SECURITY.md`. Tests are T035, T079, T080, T081, T083, T085; exact outcomes and hashes are in EVIDENCE.json. The synthetic upgrade and offline-DOM reports apply only when explicitly referenced there.

## Scope and evidence limits

Logout is not equivalent to every form of access revocation. Already-downloaded files and all remote/cache races are outside this evidence; no direct browser networking acceptance.

Source context: Article section 5.2–5.3; source ranges [[76, 80]]. Mechanism context, not approval or result evidence.

Owner role: Storage engineering and service continuity. Reviewer role: Independent technical verifier; domain specialist where applicable. Named assignments remain null. No source requirement, criterion, source tag or gate was changed to fit these observations.

## Next action

Have an authorized independent reviewer inspect the preserved exact criterion, current artifact and cited fixtures; close the listed scope/oracle gaps before any full-control PASS.
