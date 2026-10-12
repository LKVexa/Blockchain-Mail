import assert from "node:assert/strict";
import test from "node:test";
import { entropyFromLattice } from "./penteract.ts";
import {
  ISSUER_LIMIT,
  STORAGE_KEY,
  ensureLattice,
  openSession,
  resetLattice,
  storageFault,
  testingStorage,
  useLattice,
  validLattice,
} from "./lattice-store.ts";
import { KEY_DOMAIN, canonicalParts, decryptPayload, fromHex, keyFromWords, quorumVotes, wordsFromEntropy } from "./ja21.ts";
import { vertexAad } from "./penteract.ts";

async function ready() {
  storageFault.armed = false;
  await resetLattice();
  const state = useLattice.getState();
  assert.equal(state.status, "ready");
  assert.equal(state.vertices.length, 32);
  return state;
}

test("public lattice bytes do not decrypt a seal", async () => {
  const state = await ready();
  const vertex = state.vertices[4]!;
  const guessed = wordsFromEntropy(entropyFromLattice(4, vertex.generation));
  const plain = await decryptPayload(keyFromWords(guessed), vertex.nonce, vertex.ciphertext, vertexAad(4));
  assert.equal(plain, null);
  assert.equal(vertex.words, null);
  assert.equal(JSON.stringify(state.log).includes("plaintext"), false);
});

test("a forged or null snapshot is quarantined without reminting", async () => {
  await ready();
  testingStorage(JSON.stringify({ state: { vertices: null, log: [] } }));
  await ensureLattice();
  assert.equal(useLattice.getState().status, "quarantine");
  assert.equal(useLattice.getState().vertices.length, 0);
});

test("mandatory sample indices survive an all-zero hash", () => {
  const votes = quorumVotes("00".repeat(32));
  for (const required of [5, 10, 11, 12]) assert.equal(votes.includes(required), true);
});

test("length-delimited fields do not alias", () => {
  const left = canonicalParts(["alice|bob", "payload"]);
  const right = canonicalParts(["alice", "bob|payload"]);
  assert.notEqual(left, right);
});

test("issuer budget ignores a caller-supplied cap", async () => {
  await ready();
  const result = await useLattice.getState().sealIntent({
    statement: "Checkpoint the clinic twin's daily summary onto this vertex.",
    value: 10 ** 12,
    target: "obscura.self",
    selector: "checkpoint.treatise",
    cap: 10 ** 12,
    hiddenCount: 1,
    vertex: 3,
  });
  assert.equal(result.ok, false);
  assert.equal(useLattice.getState().vertices[3]!.generation, 1);
  assert.equal(ISSUER_LIMIT, 250);
});

test("unopened acknowledged mail is not replaced, and a retry does not duplicate", async () => {
  await ready();
  const token = openSession("clinic@loopback.invalid");
  const draft = {
    statement: "Daily twin",
    value: 1,
    target: "obscura.self",
    selector: "mail.accept",
    cap: 10 ** 12,
    hiddenCount: 1,
    vertex: 9,
    sessionToken: token,
    record: { from: "operator@loopback.invalid", to: "archive@loopback.invalid", body: "The clinic twin summary is ready for the local archive.", dkim: "pass" },
  };
  const forged = await useLattice.getState().sealIntent(draft);
  assert.equal(forged.ok, false);
  const accepted = await useLattice.getState().sealIntent({ ...draft, record: { ...draft.record, from: "clinic@loopback.invalid" } });
  assert.equal(accepted.ok, true);
  assert.ok(accepted.words);
  assert.equal(useLattice.getState().vertices[9]!.words, null);
  const generation = useLattice.getState().vertices[9]!.generation;
  const again = await useLattice.getState().sealIntent({ ...draft, record: { ...draft.record, from: "clinic@loopback.invalid" } });
  assert.equal(again.ok, true);
  assert.equal(useLattice.getState().vertices[9]!.generation, generation);
  const other = await useLattice.getState().sealIntent({
    ...draft,
    statement: "Second note",
    record: { from: "clinic@loopback.invalid", to: "archive@loopback.invalid", body: "A different local note for the archive." },
  });
  assert.equal(other.ok, false);
  assert.match(other.reason, /Unopened/);
});

test("eight openings append one checkpoint", async () => {
  await ready();
  const seal = await useLattice.getState().sealIntent({
    statement: "Checkpoint the clinic twin's daily summary onto this vertex.",
    value: 1,
    target: "obscura.self",
    selector: "checkpoint.treatise",
    cap: 250,
    hiddenCount: 1,
    vertex: 3,
  });
  assert.equal(seal.ok, true);
  const words = seal.words!;
  const before = useLattice.getState().log.length;
  const results = await Promise.all(Array.from({ length: 8 }, () => useLattice.getState().openWithWords(3, words, "You")));
  assert.equal(results.filter((result) => result.ok).length, 8);
  assert.equal(useLattice.getState().log.length, before + 1);
});

test("a failed write does not advance generation", async () => {
  await ready();
  const generation = useLattice.getState().vertices[3]!.generation;
  storageFault.armed = true;
  const result = await useLattice.getState().sealIntent({
    statement: "Checkpoint the clinic twin's daily summary onto this vertex.",
    value: 1,
    target: "obscura.self",
    selector: "checkpoint.treatise",
    cap: 250,
    hiddenCount: 1,
    vertex: 3,
  });
  assert.equal(result.ok, false);
  assert.equal(useLattice.getState().vertices[3]!.generation, generation);
});

test("saved state has no recovery words", async () => {
  await ready();
  const stored = testingStorage();
  assert.ok(stored);
  assert.equal(stored!.includes('"words"'), false);
  assert.equal(stored!.includes('"plaintext"'), false);
  assert.equal(validLattice(useLattice.getState().vertices, useLattice.getState().log), true);
  void STORAGE_KEY;
  void KEY_DOMAIN;
});
