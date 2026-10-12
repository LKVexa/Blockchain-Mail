import assert from "node:assert/strict";
import test from "node:test";
import { dealPlayable } from "./deal.ts";
import { glyphsFor } from "./glyphs.ts";
import {
  commitDomain,
  emptyInstance,
  freezeDraft,
  issuePermit,
  resolveMailbox,
  sendLocal,
  createRunAuthority,
} from "./registry.ts";
import { PLAYED, inBand, issuanceAllowed, puzzlesRequired, scoreBand, verifyCandidate, dealGivens } from "./rules.ts";
import { replayBoard, runSolver } from "./solver.ts";

function empties(givens: readonly number[]): number {
  return givens.filter((value) => value === 0).length;
}

test("the cipher alphabet is glyphs, and the hard bands step up", () => {
  const alphabet = glyphsFor(16);
  assert.equal(alphabet.length, 16);
  assert.ok(alphabet.includes("1"));
  assert.ok(alphabet.includes("A"));
  assert.ok(alphabet.includes("★"));
  assert.equal(puzzlesRequired(1), 1);
  assert.equal(puzzlesRequired(2), 2);
  assert.equal(issuanceAllowed(3).ok, false);
  assert.ok(scoreBand(2).low > scoreBand(1).high);
  assert.equal(PLAYED.order, 16);
});

test("a dealt cipher is a hard 16×16 with a real search", () => {
  const givens = dealGivens(2, 107);
  assert.equal(givens.length, 256);
  assert.equal(inBand(2, givens), true);
  assert.ok(empties(givens) > empties(dealGivens(1, 54)));
  const solved = runSolver(givens, PLAYED);
  assert.equal(solved.events[0]?.type, "INIT");
  assert.equal(solved.events.at(-1)?.type, "SEARCH_SOLVED");
  assert.ok(solved.events.some((event) => event.type === "GUESS"));
  assert.ok(solved.events.some((event) => event.type === "RETRACT"));
  assert.equal(verifyCandidate(givens, solved.board, PLAYED).ok, true);
  assert.deepEqual(replayBoard(givens, solved.events), solved.board);
  const playable = dealPlayable(1, 54);
  const replay = runSolver(playable, PLAYED);
  assert.ok(replay.events.filter((event) => event.type === "GUESS").length >= 8);
});

test("domain, envelope, and the refusal cases still hold on the cipher", () => {
  const domainPuzzle = dealGivens(1, 2);
  const domainSolved = runSolver(domainPuzzle, PLAYED);
  let instance = emptyInstance();
  const broken = domainSolved.board.slice();
  broken[domainPuzzle.findIndex((value) => value === 0)] = 0;
  assert.equal(commitDomain(instance, "Studio", [{ givens: domainPuzzle, candidate: broken }]).ok, false);
  const authority = createRunAuthority();
  const domainBatch = [{ givens: domainPuzzle, candidate: domainSolved.board }];
  assert.equal(commitDomain(instance, "Studio", domainBatch).ok, false);
  const domainTicket = authority.issue('domain', 1, 'studio', domainBatch);
  const created = commitDomain(instance, "Studio", domainBatch, PLAYED, domainTicket);
  authority.revoke(domainTicket);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  instance = created.instance;
  assert.equal(created.mailbox.address, "owner@studio.glyphoku.localhost");
  assert.equal(resolveMailbox("outsider@example.com", instance).ok, false);
  const frozen = freezeDraft(
    { from: created.mailbox.address, to: created.mailbox.address, bcc: "", subject: "Cipher", body: "Filed." },
    instance,
  );
  assert.equal(frozen.ok, true);
  if (!frozen.ok) return;
  assert.equal(issuePermit(instance, frozen.draft, [{ givens: domainPuzzle, candidate: domainSolved.board }]).ok, false);
  const puzzles = [107, 104836].map((seed) => {
    const givens = dealPlayable(2, seed);
    return { givens, candidate: runSolver(givens, PLAYED).board };
  });
  assert.equal(issuePermit(instance, frozen.draft, puzzles).ok, false);
  const permitTicket = authority.issue('envelope', 2, frozen.draft.digest, puzzles);
  const permit = issuePermit(instance, frozen.draft, puzzles, PLAYED, permitTicket);
  authority.revoke(permitTicket);
  assert.equal(permit.ok, true);
  if (!permit.ok) return;
  assert.equal(permit.instance.g, 3);
  const sent = sendLocal(permit.instance, permit.permit.id, frozen.draft);
  assert.equal(sent.ok, true);
  if (!sent.ok) return;
  const again = sendLocal(sent.instance, permit.permit.id, frozen.draft);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.instance.deliveries.length, 1);
  const orphan = { ...sent.instance, deliveries: [...sent.instance.deliveries, { ...sent.instance.deliveries[0]!, permitId: 'unissued' }] };
  const inconsistent = sendLocal(orphan, permit.permit.id, frozen.draft);
  assert.equal(inconsistent.ok, false);
  if (!inconsistent.ok) assert.equal(inconsistent.code, 'STORE_CORRUPT');
});
