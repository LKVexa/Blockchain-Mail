import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { CORPUS } from "./corpus.ts";
import {
  KEY_DOMAIN,
  LETTERS_PER_WORD,
  ONSETS,
  REFERENCE_KAT,
  RIMES,
  RIMES_LEGACY,
  fromHex,
  wordsFromLegacyEntropy,
  VERTEX_COUNT,
  WORDS_PER_VERTEX,
  canonicalLine,
  clueFromWords,
  decryptPayload,
  findWords,
  isGeneratorWord,
  keyFromWords,
  mintSeal,
  stamp,
  wordsFromEntropy,
} from "./ja21.ts";
import { vertexAad } from "./penteract.ts";
import { sha256 } from "./sha256.ts";

test("sha256 matches the platform hash", () => {
  const cases = ["", "abc", `${KEY_DOMAIN}|V1=bafekilo|V2=cemugyxa|V3=dizwqbhc|V4=fokepura`];
  for (const line of cases) {
    const expected = createHash("sha256").update(line).digest();
    const got = sha256(new TextEncoder().encode(line));
    assert.deepEqual(Buffer.from(got), expected);
  }
});

test("vertex alphabets are the 4.3.3 tables", () => {
  assert.equal(ONSETS, "bcdfghjklmnprstv");
  assert.equal(RIMES, "aeiouywxqzbcdfgh");
  assert.equal(ONSETS.length, 16);
  assert.equal(RIMES.length, 16);
});

test("the reference known answer uses w then x", () => {
  const words = wordsFromEntropy(fromHex(REFERENCE_KAT.entropy));
  assert.deepEqual([...words], [...REFERENCE_KAT.words]);
  assert.equal(Buffer.from(keyFromWords(words)).toString("hex"), REFERENCE_KAT.key);
  const legacy = wordsFromLegacyEntropy(fromHex(REFERENCE_KAT.entropy));
  assert.equal(legacy[1], "bubybxbw");
  assert.notEqual(RIMES_LEGACY, RIMES);
});

test("malformed hex is rejected", () => {
  assert.throws(() => fromHex("zz"), /hex/);
  assert.throws(() => fromHex("0"), /hex/);
});
test("entropy becomes four eight-letter generator words", () => {
  const raw = Uint8Array.from({ length: 16 }, (_, i) => (i * 17 + 3) & 0xff);
  const words = wordsFromEntropy(raw);
  assert.equal(words.length, WORDS_PER_VERTEX);
  for (const word of words) {
    assert.equal(word.length, LETTERS_PER_WORD);
    assert.equal(isGeneratorWord(word), true);
  }
  assert.equal(words[0]!.slice(0, 2), ONSETS[(raw[0]! >> 4) & 15]! + RIMES[raw[0]! & 15]!);
});

test("key schedule matches an independent SHA-256 of the canonical line", () => {
  const words = wordsFromEntropy(Uint8Array.from({ length: 16 }, (_, i) => i));
  const line = canonicalLine(words);
  assert.equal(line.startsWith(`${KEY_DOMAIN}|V1=`), true);
  const expected = createHash("sha256").update(line).digest();
  assert.deepEqual(Buffer.from(keyFromWords(words)), expected);
});

test("one hidden syllable is recoverable and opens AES-GCM", async () => {
  assert.equal(CORPUS.length, VERTEX_COUNT);
  const seal = await mintSeal(CORPUS[0]!, 0, 1);
  assert.equal(seal.words.length, 4);
  assert.equal(seal.hidden.length, 1);
  assert.equal(seal.clue.join("").includes("?"), true);
  const found = findWords(seal.clue, seal.hidden, seal.commitment);
  assert.deepEqual(found, seal.words);
  const plain = await decryptPayload(keyFromWords(found!), seal.nonce, seal.ciphertext, vertexAad(0));
  assert.equal(plain, CORPUS[0]);
  const rejected = await decryptPayload(keyFromWords(found!), seal.nonce, seal.ciphertext, vertexAad(1));
  assert.equal(rejected, null);
  const wrong = stamp(seal.clue, seal.hidden, [(seal.hidden[0]! + 1) & 255]);
  assert.notDeepEqual(wrong, seal.words);
});
