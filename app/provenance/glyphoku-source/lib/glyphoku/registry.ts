import { issuanceAllowed, inBand, verifyCandidate, topologyFor, type Topology } from "./rules";
import { sha256 } from "../sha256.ts";

export type Domain = { id: string; label: string; address: string; ordinal: number };
export type Mailbox = { id: string; domainId: string; address: string; role: "owner" };
export type Permit = {
  id: string;
  ordinal: number;
  sender: string;
  draftDigest: string;
  recipients: string[];
  bcc: string[];
  state: "READY" | "QUEUED" | "DELIVERED_LOCAL";
  draft: FrozenDraft;
};
export type Delivery = {
  id: string;
  permitId: string;
  mailbox: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
};

export type Instance = {
  g: number;
  domains: Domain[];
  mailboxes: Mailbox[];
  permits: Permit[];
  deliveries: Delivery[];
  spentPermits: string[];
};

export type FrozenDraft = {
  from: string;
  to: string[];
  bcc: string[];
  subject: string;
  body: string;
  digest: string;
};

export function emptyInstance(): Instance {
  return { g: 1, domains: [], mailboxes: [], permits: [], deliveries: [], spentPermits: [] };
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/;
const RESERVED = new Set(["localhost", "mail", "www", "glyphoku"]);

export function normalizeLabel(raw: string): { ok: true; label: string } | { ok: false; reason: string } {
  const label = raw.trim().toLowerCase();
  if (!LABEL.test(label)) return { ok: false, reason: "Use a short lowercase label: letters, digits, and internal hyphens." };
  if (RESERVED.has(label)) return { ok: false, reason: "That label is reserved." };
  return { ok: true, label };
}

export function domainAddress(label: string): string {
  return `${label}.glyphoku.localhost`;
}

function digest(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return [...sha256(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function freezeDraft(input: { from: string; to: string; bcc: string; subject: string; body: string }, instance: Instance): { ok: true; draft: FrozenDraft } | { ok: false; reason: string } {
  if (/[\r\n]/.test(input.subject)) return { ok: false, reason: "The subject cannot contain a line break." };
  const subject = input.subject.trim();
  const body = input.body.replace(/\r\n/g, "\n");
  if (subject.length < 1 || subject.length > 120) return { ok: false, reason: "Subject must be 1 to 120 characters." };
  if (body.trim().length < 1 || body.length > 4000) return { ok: false, reason: "Body must be present and at most 4000 characters." };
  const to = splitAddresses(input.to);
  const bcc = splitAddresses(input.bcc);
  if (to.length === 0) return { ok: false, reason: "Name at least one local recipient." };
  const all = [...to, ...bcc];
  for (const address of all) {
    const found = resolveMailbox(address, instance);
    if (!found.ok) return found;
  }
  if (!instance.mailboxes.some((box) => box.address === input.from)) {
    return { ok: false, reason: "The sender is not a local mailbox on this instance." };
  }
  const draft: FrozenDraft = {
    from: input.from,
    to,
    bcc,
    subject,
    body,
    digest: digest(JSON.stringify({ from: input.from, to, bcc, subject, body })),
  };
  return { ok: true, draft };
}

function splitAddresses(raw: string): string[] {
  return [...new Set(raw.split(/[,\s]+/).map((part) => part.trim().toLowerCase()).filter(Boolean))];
}

export function resolveMailbox(address: string, instance: Instance): { ok: true; address: string } | { ok: false; reason: string } {
  const normalized = address.trim().toLowerCase();
  if (!normalized.endsWith(".glyphoku.localhost")) {
    return { ok: false, reason: "External recipients are refused before any lookup." };
  }
  if (!instance.mailboxes.some((box) => box.address === normalized)) {
    return { ok: false, reason: "That mailbox is not on this local registry." };
  }
  return { ok: true, address: normalized };
}

export function commitDomain(
  instance: Instance,
  labelRaw: string,
  puzzles: { givens: readonly number[]; candidate: readonly number[] }[],
  topology: Topology = topologyFor(instance.g),
): { ok: true; instance: Instance; domain: Domain; mailbox: Mailbox } | { ok: false; reason: string } {
  const allowed = issuanceAllowed(instance.g);
  if (!allowed.ok) return allowed;
  const label = normalizeLabel(labelRaw);
  if (!label.ok) return label;
  if (instance.domains.some((domain) => domain.label === label.label)) {
    return { ok: false, reason: "That local domain already exists." };
  }
  if (puzzles.length !== allowed.puzzles) {
    return { ok: false, reason: `Ordinal ${instance.g} requires ${allowed.puzzles} verified puzzles.` };
  }
  for (const puzzle of puzzles) {
    const verdict = verifyCandidate(puzzle.givens, puzzle.candidate, topology);
    if (!verdict.ok) return verdict;
    if (!inBand(instance.g, puzzle.givens, topology)) {
      return { ok: false, reason: "A puzzle is outside the certified score band." };
    }
  }
  const domain: Domain = {
    id: `dom-${instance.domains.length + 1}`,
    label: label.label,
    address: domainAddress(label.label),
    ordinal: instance.g,
  };
  const mailbox: Mailbox = {
    id: `box-${instance.mailboxes.length + 1}`,
    domainId: domain.id,
    address: `owner@${domain.address}`,
    role: "owner",
  };
  return {
    ok: true,
    domain,
    mailbox,
    instance: {
      ...instance,
      g: instance.g + 1,
      domains: [...instance.domains, domain],
      mailboxes: [...instance.mailboxes, mailbox],
    },
  };
}

export function issuePermit(
  instance: Instance,
  draft: FrozenDraft,
  puzzles: { givens: readonly number[]; candidate: readonly number[] }[],
  topology: Topology = topologyFor(instance.g),
): { ok: true; instance: Instance; permit: Permit } | { ok: false; reason: string } {
  const allowed = issuanceAllowed(instance.g);
  if (!allowed.ok) return allowed;
  if (puzzles.length !== allowed.puzzles) {
    return { ok: false, reason: `Ordinal ${instance.g} requires ${allowed.puzzles} verified puzzles.` };
  }
  for (const puzzle of puzzles) {
    const verdict = verifyCandidate(puzzle.givens, puzzle.candidate, topology);
    if (!verdict.ok) return verdict;
    if (!inBand(instance.g, puzzle.givens, topology)) {
      return { ok: false, reason: "A puzzle is outside the certified score band." };
    }
  }
  const existing = instance.permits.find((permit) => permit.draftDigest === draft.digest && permit.sender === draft.from);
  if (existing) return { ok: true, instance, permit: existing };
  const permit: Permit = {
    id: `env-${instance.permits.length + 1}`,
    ordinal: instance.g,
    sender: draft.from,
    draftDigest: draft.digest,
    recipients: draft.to,
    bcc: draft.bcc,
    state: "READY",
    draft,
  };
  return {
    ok: true,
    permit,
    instance: { ...instance, g: instance.g + 1, permits: [...instance.permits, permit] },
  };
}

export function sendLocal(
  instance: Instance,
  permitId: string,
  draft: FrozenDraft,
): { ok: true; instance: Instance } | { ok: false; reason: string } {
  const permit = instance.permits.find((item) => item.id === permitId);
  if (!permit) return { ok: false, reason: "No envelope permit." };
  if (permit.draftDigest !== draft.digest || permit.sender !== draft.from) {
    return { ok: false, reason: "This permit is bound to a different frozen draft." };
  }
  if (instance.spentPermits.includes(permit.id) || permit.state !== "READY") {
    return { ok: true, instance };
  }
  const recipients = [...new Set([...permit.recipients, ...permit.bcc])];
  const deliveries: Delivery[] = recipients.map((mailbox, index) => ({
    id: `${permit.id}-${index}`,
    permitId: permit.id,
    mailbox,
    from: draft.from,
    to: draft.to,
    subject: draft.subject,
    body: draft.body,
  }));
  return {
    ok: true,
    instance: {
      ...instance,
      spentPermits: [...instance.spentPermits, permit.id],
      permits: instance.permits.map((item) => (item.id === permit.id ? { ...item, state: "DELIVERED_LOCAL" as const } : item)),
      deliveries: [...instance.deliveries, ...deliveries],
    },
  };
}
