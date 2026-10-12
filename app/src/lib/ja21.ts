import { vertexAad } from "@/lib/penteract";
import { sha256 } from "@/lib/sha256";

/** JA21 Cypher 4.3.3 key domain. The derivation string is the one in the launcher source. */
export const KEY_DOMAIN = "JA21/CYPHER/VERTEX-WORD-KEY/v1";
export const CYPHER_VERSION = "4.3.3";
/** Corrected rime profile. Legacy Obscura snapshots keep their own ciphertext and are not rewritten. */
export const RIME_PROFILE = "ja21-rime-v2";

/** Onset alphabet, high nibble. */
export const ONSETS = "bcdfghjklmnprstv";
/** Reference rime alphabet, low nibble. w then x, matching the JA21 known answer. */
export const RIMES = "aeiouywxqzbcdfgh";
/** Historical Obscura rime alphabet. x and w are swapped. Import only; do not mint with it. */
export const RIMES_LEGACY = "aeiouyxwqzbcdfgh";

export const VERTEX_COUNT = 32;
export const WORDS_PER_VERTEX = 4;
export const LETTERS_PER_WORD = 8;

/** Reference known answer for entropy 000102030405060708090a0b0c0d0e0f. */
export const REFERENCE_KAT = {
  entropy: "000102030405060708090a0b0c0d0e0f",
  words: ["babebibo", "bubybwbx", "bqbzbbbc", "bdbfbgbh"] as Quad,
  key: "82d73d2763def8edd38d4afe312c2e49e3b6ddcb39afd44fe60dc75dbe179510",
};

export type Quad = [string, string, string, string];

export type SealMaterial = {
  words: Quad;
  clue: Quad;
  hidden: number[];
  commitment: string;
  nonce: string;
  ciphertext: string;
  profile: typeof RIME_PROFILE;
};

const text = new TextEncoder();

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function toHexUpper(bytes: Uint8Array): string {
  return toHex(bytes).toUpperCase();
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error("hex must be an even number of hex digits");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const pair = clean.slice(i * 2, i * 2 + 2);
    const byte = Number.parseInt(pair, 16);
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new Error("hex must be an even number of hex digits");
    out[i] = byte;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function syllableAlphabet(rimes: string): (word: string) => boolean {
  return (word: string) => {
    if (word.length !== LETTERS_PER_WORD) return false;
    for (let s = 0; s < 4; s++) {
      if (!ONSETS.includes(word[s * 2]!)) return false;
      if (!rimes.includes(word[s * 2 + 1]!)) return false;
    }
    return true;
  };
}

export function isGeneratorWord(word: string): boolean {
  return syllableAlphabet(RIMES)(word);
}

export function isLegacyWord(word: string): boolean {
  return syllableAlphabet(RIMES_LEGACY)(word);
}

export function assertQuad(words: readonly string[]): Quad {
  if (words.length !== WORDS_PER_VERTEX) {
    throw new Error("exactly four ordered vertex words are required");
  }
  const out = words.map((word) => word.trim().toLowerCase());
  for (const word of out) {
    if (!isGeneratorWord(word) && !isLegacyWord(word)) {
      throw new Error(`invalid vertex word "${word}": generator words are exactly eight onset/rime letters`);
    }
  }
  return out as Quad;
}

function wordsFromAlphabet(raw: Uint8Array, rimes: string): Quad {
  if (raw.length !== 16) throw new Error("vertex entropy must be 16 bytes");
  const words: string[] = [];
  for (let v = 0; v < 4; v++) {
    let word = "";
    for (let i = 0; i < 4; i++) {
      const x = raw[v * 4 + i]!;
      word += ONSETS[(x >> 4) & 0x0f]! + rimes[x & 0x0f]!;
    }
    words.push(word);
  }
  return words as Quad;
}

/** Sixteen entropy bytes → four words, reference rime order. */
export function wordsFromEntropy(raw: Uint8Array): Quad {
  const words = wordsFromAlphabet(raw, RIMES);
  for (const word of words) {
    if (!isGeneratorWord(word)) throw new Error("reference alphabet produced a non-word");
  }
  return words;
}

/** Historical swapped-rime encoding. Does not change the key of an already issued literal word tuple. */
export function wordsFromLegacyEntropy(raw: Uint8Array): Quad {
  return wordsFromAlphabet(raw, RIMES_LEGACY);
}

export function canonicalLine(words: readonly string[]): string {
  if (words.length !== 4) throw new Error("exactly four ordered vertex words are required");
  return `${KEY_DOMAIN}|V1=${words[0]}|V2=${words[1]}|V3=${words[2]}|V4=${words[3]}`;
}

/** Length-delimited UTF-8 fields. A delimiter inside a field cannot shift the next field. */
export function canonicalParts(parts: readonly string[]): string {
  return parts
    .map((part) => {
      const size = text.encode(part).length;
      return `${size}:${part}`;
    })
    .join("");
}

/** SHA-256 of the canonical four-word line. This is the 32-byte AES key. */
export function keyFromWords(words: readonly string[]): Uint8Array {
  return sha256(text.encode(canonicalLine(words)));
}

export function commitmentOf(words: readonly string[]): Uint8Array {
  return sha256(keyFromWords(words));
}

export function hiddenSyllables(index: number, count: number): number[] {
  if (count !== 1 && count !== 2) throw new Error("a vertex hides one or two syllables");
  const a = index % 16;
  if (count === 1) return [a];
  let b = (index * 5 + 3) % 16;
  if (b === a) b = (a + 7) % 16;
  return [a, b];
}

export function clueFromWords(words: Quad, hidden: readonly number[]): Quad {
  const chars = words.map((word) => word.split(""));
  for (const syl of hidden) {
    const wi = Math.floor(syl / 4);
    const si = syl % 4;
    chars[wi]![si * 2] = "?";
    chars[wi]![si * 2 + 1] = "?";
  }
  return chars.map((row) => row.join("")) as Quad;
}

export function stamp(clue: Quad, hidden: readonly number[], bytes: readonly number[], rimes = RIMES): Quad {
  if (bytes.length !== hidden.length) throw new Error("guess does not cover the hidden syllables");
  const chars = clue.map((word) => word.split(""));
  hidden.forEach((syl, i) => {
    const x = bytes[i]!;
    if (!Number.isInteger(x) || x < 0 || x > 255) throw new Error("syllable byte is outside 0..255");
    const pair = ONSETS[(x >> 4) & 0x0f]! + rimes[x & 0x0f]!;
    const wi = Math.floor(syl / 4);
    const si = syl % 4;
    chars[wi]![si * 2] = pair[0]!;
    chars[wi]![si * 2 + 1] = pair[1]!;
  });
  return assertQuad(chars.map((row) => row.join("")));
}

export function wordsMatchCommitment(words: Quad, commitmentHex: string): boolean {
  return bytesEqual(commitmentOf(words), fromHex(commitmentHex));
}

export function findWords(clue: Quad, hidden: readonly number[], commitmentHex: string): Quad | null {
  const target = fromHex(commitmentHex);
  if (hidden.length === 0) {
    const words = assertQuad(clue);
    return bytesEqual(commitmentOf(words), target) ? words : null;
  }
  if (hidden.length === 1) {
    for (let i = 0; i < 256; i++) {
      const words = stamp(clue, hidden, [i]);
      if (bytesEqual(commitmentOf(words), target)) return words;
    }
    return null;
  }
  if (hidden.length === 2) {
    for (let a = 0; a < 256; a++) {
      for (let b = 0; b < 256; b++) {
        const words = stamp(clue, hidden, [a, b]);
        if (bytesEqual(commitmentOf(words), target)) return words;
      }
    }
    return null;
  }
  throw new Error("a vertex hides one or two syllables");
}

export async function findWordsChunked(
  clue: Quad,
  hidden: readonly number[],
  commitmentHex: string,
  onProgress?: (tried: number, total: number) => void,
): Promise<Quad | null> {
  if (hidden.length < 2) return findWords(clue, hidden, commitmentHex);
  const target = fromHex(commitmentHex);
  const total = 256 * 256;
  let tried = 0;
  for (let a = 0; a < 256; a++) {
    for (let b = 0; b < 256; b++) {
      const words = stamp(clue, hidden, [a, b]);
      if (bytesEqual(commitmentOf(words), target)) {
        onProgress?.(tried + 1, total);
        return words;
      }
      tried++;
    }
    if (a % 8 === 7) {
      onProgress?.(tried, total);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  onProgress?.(total, total);
  return null;
}

function rawKeyBuffer(key: Uint8Array): ArrayBuffer {
  return key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
}

async function aesKey(key: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", rawKeyBuffer(key), "AES-GCM", false, usages);
}

export async function encryptPayload(
  key: Uint8Array,
  plaintext: string,
  aad: Uint8Array,
): Promise<{ nonce: string; ciphertext: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await aesKey(key, ["encrypt"]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: rawKeyBuffer(nonce), additionalData: rawKeyBuffer(aad) },
      cryptoKey,
      text.encode(plaintext),
    ),
  );
  return { nonce: toHex(nonce), ciphertext: toHex(cipher) };
}

export async function decryptPayload(
  key: Uint8Array,
  nonceHex: string,
  ciphertextHex: string,
  aad: Uint8Array,
): Promise<string | null> {
  try {
    const cryptoKey = await aesKey(key, ["decrypt"]);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: rawKeyBuffer(fromHex(nonceHex)), additionalData: rawKeyBuffer(aad) },
      cryptoKey,
      rawKeyBuffer(fromHex(ciphertextHex)),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export function randomEntropy(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/** Seal with caller-supplied entropy. Private seals must pass independent randomness, never the public lattice mixer. */
export async function sealWithEntropy(
  plaintext: string,
  index: number,
  hiddenCount: number,
  entropy: Uint8Array,
): Promise<SealMaterial> {
  if (hiddenCount !== 1 && hiddenCount !== 2) throw new Error("a vertex hides one or two syllables");
  const words = wordsFromEntropy(entropy);
  const key = keyFromWords(words);
  const aad = vertexAad(index);
  const sealed = await encryptPayload(key, plaintext, aad);
  const opened = await decryptPayload(key, sealed.nonce, sealed.ciphertext, aad);
  if (opened !== plaintext) throw new Error(`vertex ${index} failed recovery verification`);
  const hidden = hiddenSyllables(index, hiddenCount);
  return {
    words,
    clue: clueFromWords(words, hidden),
    hidden,
    commitment: toHex(commitmentOf(words)),
    nonce: sealed.nonce,
    ciphertext: sealed.ciphertext,
    profile: RIME_PROFILE,
  };
}

export async function mintSeal(plaintext: string, index: number, hiddenCount: number): Promise<SealMaterial> {
  return sealWithEntropy(plaintext, index, hiddenCount, randomEntropy());
}

export function packageHash(ciphertextHex: string): string {
  return toHexUpper(sha256(fromHex(ciphertextHex)));
}

export function recoveryMarkdown(vertex: number, words: Quad, created: string, ciphertextHex: string): string {
  const hash = packageHash(ciphertextHex);
  return (
    `# Session recovery words\n\n` +
    `These words are shown only in this session. They are not a native JA21 package and they are not written into the checkpoint.\n\n` +
    `- **Profile:** ${RIME_PROFILE}\n` +
    `- **Vertex:** ${String(vertex).padStart(2, "0")}\n` +
    `- **Created:** ${created}\n` +
    `- **Ciphertext SHA-256:** \`${hash}\`\n\n` +
    `- **V1:** \`${words[0]}\`\n` +
    `- **V2:** \`${words[1]}\`\n` +
    `- **V3:** \`${words[2]}\`\n` +
    `- **V4:** \`${words[3]}\`\n`
  );
}

export function latticeFingerprint(words: readonly Quad[]): string {
  const line = words.map((quad) => quad.join(" ")).join("|");
  return toHex(sha256(text.encode(line))).slice(0, 16);
}

const MUST_VOTES = [5, 10, 11, 12];

/** A local index sample. It is not a validator signature and it is not consensus. */
export function quorumVotes(hashHex: string): number[] {
  const rest = [0, 1, 2, 3, 4, 6, 7, 8, 9];
  const picked = new Set<number>(MUST_VOTES);
  const bytes = fromHex(hashHex);
  let i = 0;
  while (picked.size < 9 && i < bytes.length * 4) {
    picked.add(rest[bytes[i % bytes.length]! % rest.length]!);
    i++;
  }
  for (const n of MUST_VOTES) picked.add(n);
  const out = [...picked].sort((a, b) => a - b);
  if (out.length > 9) {
    const extras = out.filter((n) => !MUST_VOTES.includes(n));
    const kept = [...MUST_VOTES, ...extras].slice(0, 9).sort((a, b) => a - b);
    return kept;
  }
  return out;
}

export function checkpointBody(fields: {
  prev: string;
  vertex: number;
  generation: number;
  commitment: string;
  ciphertext: string;
  solver: string;
  receiptId: string;
}): string {
  return canonicalParts([
    fields.prev,
    String(fields.vertex),
    String(fields.generation),
    fields.commitment,
    fields.ciphertext,
    fields.solver,
    fields.receiptId,
  ]);
}

export function checkpointDigest(body: string, height: number, at: string, votes: readonly number[]): string {
  return toHex(sha256(text.encode(canonicalParts([body, String(height), at, votes.join(",")]))));
}
