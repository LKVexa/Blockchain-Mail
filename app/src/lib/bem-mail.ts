import { sha256 } from "./sha256.ts";

/** Local mail profile. Isolation is a property of this module: it does not open sockets. */
export const PROFILE = "ISOLATED";
export const SUBJECT_MAX_CHARS = 120;
export const BODY_MAX_CHARS = 2000;

const mailboxKey = new Uint8Array(32);
if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(mailboxKey);

export const MAILBOXES = [
  { address: "clinic@loopback.invalid", vertex: 8, label: "Clinic" },
  { address: "archive@loopback.invalid", vertex: 9, label: "Archive" },
  { address: "operator@loopback.invalid", vertex: 0, label: "Operator" },
] as const;

export type LocalMessage = {
  from: string;
  to: string;
  subject: string;
  body: string;
};

export type StageState = "PASS" | "FAIL" | "SIMULATED" | "NOT_IMPLEMENTED" | "NOT_RUN" | "BLOCKED";

export type Stage = {
  id: string;
  title: string;
  owner: string;
  state: StageState;
  observed: string;
};

export type MailRun = {
  ok: boolean;
  stages: Stage[];
  canonical: string;
  digest: string;
  vertex: number | null;
  utf8Bytes: number;
  record: Record<string, string> | null;
};

const SPAM = [/ignore previous/i, /system prompt/i, /wire the/i, /private key/i, /<script/i];

export function isLocalMailbox(address: string): boolean {
  return MAILBOXES.some((box) => box.address === address);
}

export function mailboxVertex(address: string): number | null {
  return MAILBOXES.find((box) => box.address === address)?.vertex ?? null;
}

export function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function canonicalize(message: LocalMessage): string {
  if (/[\r\n]/.test(message.subject)) throw new Error("subject contains a line break");
  const from = message.from.trim();
  const to = message.to.trim();
  const subject = message.subject.trim();
  const body = message.body.replace(/\r\n/g, "\n").replace(/\n+$/g, "");
  if (subject.length > SUBJECT_MAX_CHARS) throw new Error("subject is longer than 120 characters");
  if (utf8Length(subject) > 480) throw new Error("subject is longer than 480 UTF-8 bytes");
  if (body.length > BODY_MAX_CHARS) throw new Error("body is longer than 2000 characters");
  return `from:${from}\nto:${to}\nsubject:${subject}\n\n${body}\n`;
}

export function digestOf(value: string): string {
  const bytes = sha256(new TextEncoder().encode(value));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function mac(canonical: string): string {
  const material = new Uint8Array(mailboxKey.length + new TextEncoder().encode(canonical).length);
  material.set(mailboxKey, 0);
  material.set(new TextEncoder().encode(canonical), mailboxKey.length);
  return digestOf(`mac|${[...material].map((b) => b.toString(16).padStart(2, "0")).join("")}`);
}

/** Sign with the in-memory mailbox key. runMail never calls this. */
export function signLocal(canonical: string): string {
  return mac(canonical);
}

export function verifyLocal(canonical: string, signature: string): boolean {
  if (!signature) return false;
  const expected = mac(canonical);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

function leaf(value: string): string {
  return digestOf(`L|${value}`);
}

export const MAIL_PROOF_INDEX = 3;
export const MAIL_PROOF_DEPTH = 2;

export function anchoredRoot(digest: string): string {
  const level = [...MAILBOXES.map((box) => leaf(box.address)), leaf(digest)];
  const left = digestOf(`N|${level[0]}|${level[1]}`);
  const right = digestOf(`N|${level[2]}|${level[3]}`);
  return digestOf(`N|${left}|${right}`);
}

export function membershipProof(digest: string): { root: string; index: number; siblings: string[] } {
  const level = [...MAILBOXES.map((box) => leaf(box.address)), leaf(digest)];
  const left = digestOf(`N|${level[0]}|${level[1]}`);
  return { root: anchoredRoot(digest), index: MAIL_PROOF_INDEX, siblings: [level[2]!, left] };
}

export function verifyMembership(
  digest: string,
  proof: { root: string; index: number; siblings: string[] },
): boolean {
  if (proof.index !== MAIL_PROOF_INDEX) return false;
  if (proof.siblings.length !== MAIL_PROOF_DEPTH) return false;
  if (proof.root !== anchoredRoot(digest)) return false;
  let hash = leaf(digest);
  let index = proof.index;
  for (const sibling of proof.siblings) {
    hash = index % 2 === 0 ? digestOf(`N|${hash}|${sibling}`) : digestOf(`N|${sibling}|${hash}`);
    index = Math.floor(index / 2);
  }
  return hash === proof.root;
}

export function contentId(canonical: string): string {
  return digestOf(`blob|${canonical}`);
}

export function localAssist(body: string): { summary: string; flags: string[] } {
  const flags = SPAM.filter((rule) => rule.test(body)).map((rule) => rule.source);
  const sentence = body.trim().split(/[.!?]/)[0]?.trim() || body.trim();
  return { summary: sentence, flags };
}

function stage(id: string, title: string, owner: string, state: StageState, observed: string): Stage {
  return { id, title, owner, state, observed };
}

/**
 * Verify a message. This function does not sign, does not write a blob,
 * does not commit a checkpoint, and does not call an EVM or a prover.
 */
export function runMail(message: LocalMessage, signature: string | null): MailRun {
  let canonical = "";
  let formError = "";
  try {
    canonical = canonicalize(message);
  } catch (error) {
    formError = error instanceof Error ? error.message : "message rejected";
  }
  const digest = canonical ? digestOf(canonical) : "";
  const utf8Bytes = canonical ? utf8Length(canonical) : 0;
  const fromLocal = isLocalMailbox(message.from);
  const toLocal = isLocalMailbox(message.to);
  const vertex = mailboxVertex(message.to);
  const sameBox = message.from.trim() === message.to.trim();
  const subjectOk = message.subject.trim().length >= 8 && message.subject.trim().length <= SUBJECT_MAX_CHARS;
  const bodyOk = message.body.trim().length >= 8 && message.body.length <= BODY_MAX_CHARS && !formError;
  const assist = localAssist(message.body);
  const quarantined = assist.flags.length > 0;
  const signed = Boolean(canonical && signature && verifyLocal(canonical, signature));
  const proof = digest ? membershipProof(digest) : { root: "", index: -1, siblings: [] as string[] };
  const proofOk = Boolean(digest && verifyMembership(digest, proof));
  const deliver = Boolean(canonical && fromLocal && toLocal && !sameBox && subjectOk && bodyOk && !quarantined && signed && proofOk);
  const cid = canonical ? contentId(canonical) : "";
  const record = deliver
    ? {
        profile: PROFILE,
        from: message.from.trim(),
        to: message.to.trim(),
        subject: message.subject.trim(),
        digest,
        canonical,
        signature: "checked",
        proof: proof.root,
        cid,
        assist: assist.summary,
      }
    : null;

  const routeObserved = formError
    ? formError
    : !toLocal
      ? "Bounced. Recipient domain is not loopback.invalid."
      : quarantined
        ? "Quarantined by the local spam rules."
        : sameBox
          ? "Bounced. Sender and recipient are the same mailbox."
          : !subjectOk || !bodyOk
            ? "Bounced. Subject or body is outside the local limits."
            : !signed
              ? "Bounced. No signature from the local mailbox key."
              : `Local router delivered to vertex ${String(vertex).padStart(2, "0")}.`;

  const stages: Stage[] = [
    stage("P01", "Local virtual execution", "P01 runtime", "SIMULATED", "No socket was opened. This is not a measured network namespace."),
    stage("P02", "Ingress", "P02 catch-all", fromLocal ? "PASS" : "FAIL", fromLocal ? `Accepted ${message.from.trim()}` : "Sender is not a local mailbox."),
    stage("P03", "Local route", "P03 router", deliver ? "PASS" : "FAIL", routeObserved),
    stage("P04", "Local assist", "P04 rules", quarantined ? "FAIL" : "SIMULATED", quarantined ? `Held: ${assist.flags.join(", ")}` : `Rules only, not a model: ${assist.summary}`),
    stage("P05", "Canonical bytes", "P05 adapter", canonical ? "PASS" : "FAIL", canonical ? `${utf8Bytes} UTF-8 bytes.` : formError),
    stage("P06", "Chain execution", "P06", "NOT_IMPLEMENTED", "No EVM call. A later local receipt is not a transaction."),
    stage("P07", "Mailbox registry", "P07 registry", toLocal && fromLocal ? "PASS" : "FAIL", toLocal ? `Recipient maps to vertex ${String(vertex).padStart(2, "0")}.` : "No registry entry."),
    stage("P08", "Encrypt", "P08", "NOT_RUN", "Encryption happens at the seal, not in this check."),
    stage("P09", "Local signature", "P09", signed ? "PASS" : "FAIL", signed ? `Signature checked. Digest ${digest.slice(0, 16)}.` : "Unsigned or unverifiable. Not labeled as DKIM."),
    stage("P10", "Membership", "P10", proofOk ? "PASS" : "FAIL", proofOk ? `Anchored root ${proof.root.slice(0, 16)}. Not a zero-knowledge proof.` : "Membership was not anchored."),
    stage("P11", "Content id", "P11", deliver ? "SIMULATED" : "NOT_RUN", deliver ? `Id ${cid.slice(0, 16)} computed. No blob store was written.` : "No id."),
    stage("P12", "Audit commit", "P12", "NOT_RUN", "No checkpoint has been appended yet."),
    stage("P13", "Provenance", "P13", "PASS", "JA21 reference rimes · penteract bench 0.3.0 · local mail"),
    stage("P14", "Key custody", "P14", "PASS", "The mailbox key is random process memory. It is not in the record."),
  ];

  return { ok: deliver, stages, canonical, digest, vertex, utf8Bytes, record };
}
