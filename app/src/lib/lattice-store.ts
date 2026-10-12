import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { canonicalize, isLocalMailbox, runMail, signLocal } from "@/lib/bem-mail";
import { CORPUS, SELF_ACCOUNT, SELECTORS, type Selector } from "@/lib/corpus";
import {
  KEY_DOMAIN,
  RIME_PROFILE,
  VERTEX_COUNT,
  type Quad,
  assertQuad,
  canonicalParts,
  checkpointBody,
  checkpointDigest,
  decryptPayload,
  keyFromWords,
  mintSeal,
  quorumVotes,
  toHex,
  wordsMatchCommitment,
} from "@/lib/ja21";
import { vertexAad } from "@/lib/penteract";
import { sha256 } from "@/lib/sha256";

export const ISSUER_LIMIT = 250;
export const STORAGE_KEY = "obscura-lattice-v3";

export type VertexKind = "treatise" | "intent";

export type Vertex = {
  index: number;
  generation: number;
  kind: VertexKind;
  clue: Quad;
  hidden: number[];
  commitment: string;
  nonce: string;
  ciphertext: string;
  profile: string;
  receiptId: string | null;
  admissionId: string | null;
  binding: string;
  opened: boolean;
  words: Quad | null;
  plaintext: string | null;
  solver: string | null;
  openedAt: string | null;
};

export type Checkpoint = {
  height: number;
  vertex: number;
  generation: number;
  prev: string;
  hash: string;
  solver: string;
  at: string;
  votes: number[];
  receiptId: string;
  commitment: string;
  ciphertext: string;
};

export type IntentDraft = {
  statement: string;
  value: number;
  target: string;
  selector: string;
  cap: number;
  hiddenCount: number;
  vertex: number;
  sessionToken?: string;
  record?: Record<string, string>;
};

type LatticeState = {
  status: "boot" | "ready" | "error" | "quarantine";
  error: string | null;
  vertices: Vertex[];
  log: Checkpoint[];
  active: number;
  spent: number;
  admissions: string[];
  bootstrap: () => Promise<void>;
  select: (index: number) => void;
  openWithWords: (index: number, words: Quad, solver: string) => Promise<{ ok: boolean; reason: string }>;
  sealIntent: (draft: IntentDraft) => Promise<{ ok: boolean; reason: string; words?: Quad; commitment?: string }>;
};

const memory = new Map<string, string>();
const safeStorage = {
  getItem: (key: string) => (typeof window === "undefined" ? (memory.get(key) ?? null) : localStorage.getItem(key)),
  setItem: (key: string, value: string) => {
    if (typeof window === "undefined") memory.set(key, value);
    else localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === "undefined") memory.delete(key);
    else localStorage.removeItem(key);
  },
};

export const storageFault = { armed: false };

export function testingStorage(value?: string | null): string | null {
  if (value === undefined) return safeStorage.getItem(STORAGE_KEY);
  if (value === null) safeStorage.removeItem(STORAGE_KEY);
  else safeStorage.setItem(STORAGE_KEY, value);
  return value;
}

const sessions = new Map<string, string>();
const chains: Promise<void>[] = Array.from({ length: VERTEX_COUNT }, () => Promise.resolve());

function lock<T>(index: number, fn: () => Promise<T>): Promise<T> {
  const run = chains[index]!.then(fn, fn);
  chains[index] = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function openSession(mailbox: string): string {
  if (!isLocalMailbox(mailbox)) throw new Error("That mailbox is not on the local registry.");
  const token = toHex(crypto.getRandomValues(new Uint8Array(16)));
  sessions.set(token, mailbox);
  return token;
}

export function sessionMailbox(token: string | undefined): string | null {
  if (!token) return null;
  return sessions.get(token) ?? null;
}

function digest(value: string): string {
  return toHex(sha256(new TextEncoder().encode(value)));
}

export function bindingOf(vertex: Pick<Vertex, "index" | "generation" | "commitment" | "nonce" | "ciphertext" | "clue" | "profile" | "receiptId" | "admissionId">): string {
  return digest(
    canonicalParts([
      String(vertex.index),
      String(vertex.generation),
      vertex.commitment,
      vertex.nonce,
      vertex.ciphertext,
      vertex.clue.join(" "),
      vertex.profile,
      vertex.receiptId ?? "",
      vertex.admissionId ?? "",
    ]),
  );
}

function checkpointFor(prev: string, height: number, vertex: Vertex, solver: string, at: string): Checkpoint {
  const receiptId = vertex.receiptId ?? `open-${vertex.index}-${vertex.generation}`;
  const body = checkpointBody({
    prev,
    vertex: vertex.index,
    generation: vertex.generation,
    commitment: vertex.commitment,
    ciphertext: vertex.ciphertext,
    solver,
    receiptId,
  });
  const votes = quorumVotes(digest(body));
  return {
    height,
    vertex: vertex.index,
    generation: vertex.generation,
    prev,
    hash: checkpointDigest(body, height, at, votes),
    solver,
    at,
    votes,
    receiptId,
    commitment: vertex.commitment,
    ciphertext: vertex.ciphertext,
  };
}

export function checkpointValid(entry: Checkpoint, prev: string): boolean {
  const body = checkpointBody({
    prev,
    vertex: entry.vertex,
    generation: entry.generation,
    commitment: entry.commitment,
    ciphertext: entry.ciphertext,
    solver: entry.solver,
    receiptId: entry.receiptId,
  });
  const votes = quorumVotes(digest(body));
  if (votes.join(",") !== entry.votes.join(",")) return false;
  return checkpointDigest(body, entry.height, entry.at, votes) === entry.hash && entry.prev === prev;
}

type PublicVertex = Omit<Vertex, "words" | "plaintext" | "solver" | "openedAt">;

function publish(vertex: Vertex): PublicVertex {
  return {
    index: vertex.index,
    generation: vertex.generation,
    kind: vertex.kind,
    clue: vertex.clue,
    hidden: vertex.hidden,
    commitment: vertex.commitment,
    nonce: vertex.nonce,
    ciphertext: vertex.ciphertext,
    profile: vertex.profile,
    receiptId: vertex.receiptId,
    admissionId: vertex.admissionId,
    binding: vertex.binding,
    opened: vertex.opened,
  };
}

export function judgePolicy(draft: IntentDraft): string[] {
  const reasons: string[] = [];
  if (draft.target !== SELF_ACCOUNT) reasons.push("Recipient is not the account. The hook hard-binds every seal to obscura.self.");
  if (!SELECTORS.includes(draft.selector as Selector)) reasons.push("Selector is outside the session whitelist.");
  if (!Number.isSafeInteger(draft.value) || draft.value < 0 || draft.value > ISSUER_LIMIT) {
    reasons.push(`Value must be a whole number from 0 through the issuer limit ${ISSUER_LIMIT}.`);
  }
  if (draft.hiddenCount !== 1 && draft.hiddenCount !== 2) reasons.push("Hidden syllables must be one or two.");
  const statement = draft.statement.trim();
  if (statement.length < 8) reasons.push("Say what should become true, in at least a short sentence.");
  if (statement.length > 280) reasons.push("An intent has to fit on one vertex — 280 characters.");
  if (/[\r\n]/.test(draft.statement)) reasons.push("The statement cannot contain a line break.");
  if (!Number.isInteger(draft.vertex) || draft.vertex < 0 || draft.vertex >= VERTEX_COUNT) reasons.push("Pick a vertex from 00 to 31.");
  return reasons;
}

export function encodeIntent(draft: IntentDraft, record?: Record<string, string>): string {
  return JSON.stringify({
    statement: draft.statement.trim(),
    value: draft.value,
    target: draft.target,
    selector: draft.selector,
    issuerLimit: ISSUER_LIMIT,
    ...(record ? { record } : {}),
  });
}

export function validLattice(vertices: Vertex[], log: Checkpoint[]): boolean {
  if (!Array.isArray(vertices) || vertices.length !== VERTEX_COUNT) return false;
  if (!Array.isArray(log)) return false;
  const shaped = vertices.every((vertex, index) => {
    if (!vertex || vertex.index !== index) return false;
    if (vertex.words != null) return false;
    if (vertex.plaintext != null) return false;
    if (!Array.isArray(vertex.clue) || vertex.clue.length !== 4) return false;
    if (vertex.profile !== RIME_PROFILE) return false;
    if (vertex.binding !== bindingOf(vertex)) return false;
    return vertex.hidden.length === 1 || vertex.hidden.length === 2;
  });
  if (!shaped) return false;
  let prev = KEY_DOMAIN;
  for (const entry of log) {
    if (!checkpointValid(entry, prev)) return false;
    if ("plaintext" in entry || "words" in entry) return false;
    prev = entry.hash;
  }
  return true;
}

function commitSnapshot(partial: { vertices: Vertex[]; log: Checkpoint[]; active: number; spent: number; admissions: string[] }): void {
  if (storageFault.armed) {
    storageFault.armed = false;
    throw new Error("quota");
  }
  const payload = {
    version: 3,
    state: {
      vertices: partial.vertices.map(publish),
      log: partial.log,
      active: partial.active,
      spent: partial.spent,
      admissions: partial.admissions,
    },
  };
  safeStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function materialize(published: PublicVertex[]): Vertex[] {
  return published.map((vertex) => ({ ...vertex, words: null, plaintext: null, solver: null, openedAt: null }));
}

async function mintGenesis(): Promise<{ vertices: Vertex[]; log: Checkpoint[] }> {
  const vertices: Vertex[] = [];
  for (let index = 0; index < VERTEX_COUNT; index++) {
    const seal = await mintSeal(CORPUS[index]!, index, 1);
    const vertex: Vertex = {
      index,
      generation: 1,
      kind: "treatise",
      clue: seal.clue,
      hidden: seal.hidden,
      commitment: seal.commitment,
      nonce: seal.nonce,
      ciphertext: seal.ciphertext,
      profile: seal.profile,
      receiptId: null,
      admissionId: null,
      binding: "",
      opened: false,
      words: null,
      plaintext: null,
      solver: null,
      openedAt: null,
    };
    vertex.binding = bindingOf(vertex);
    vertices.push(vertex);
  }
  return { vertices, log: [] };
}

export const useLattice = create<LatticeState>()(
  persist(
    (set, get) => ({
      status: "boot",
      error: null,
      vertices: [],
      log: [],
      active: 8,
      spent: 0,
      admissions: [],
      bootstrap: async () => {
        try {
          const minted = await mintGenesis();
          commitSnapshot({ ...minted, active: 8, spent: 0, admissions: [] });
          set({ ...minted, status: "ready", error: null, active: 8, spent: 0, admissions: [] });
        } catch (error) {
          set({ status: "error", error: error instanceof Error ? error.message : "The lattice could not be minted." });
        }
      },
      select: (index) => set({ active: index }),
      openWithWords: (index, words, solver) =>
        lock(index, async () => {
          const vertex = get().vertices[index];
          if (!vertex) return { ok: false, reason: "That vertex is not on this lattice." };
          let quad: Quad;
          try {
            quad = assertQuad(words);
          } catch (error) {
            return { ok: false, reason: error instanceof Error ? error.message : "Those are not four eight-letter words." };
          }
          if (!wordsMatchCommitment(quad, vertex.commitment)) {
            return { ok: false, reason: "Those four words do not derive this vertex key." };
          }
          const seen = vertex.ciphertext;
          const seenGeneration = vertex.generation;
          const plaintext = await decryptPayload(keyFromWords(quad), vertex.nonce, vertex.ciphertext, vertexAad(index));
          const fresh = get().vertices[index];
          if (!fresh || fresh.ciphertext !== seen || fresh.generation !== seenGeneration) {
            return { ok: false, reason: "This opening was for an older generation and was discarded." };
          }
          if (plaintext == null) return { ok: false, reason: "The authentication tag rejected this key." };
          if (fresh.opened) {
            set({
              vertices: get().vertices.map((item) => (item.index === index ? { ...item, plaintext, words: quad, solver } : item)),
            });
            return { ok: true, reason: "Already open. No second checkpoint." };
          }
          const openedAt = new Date().toISOString();
          const prev = get().log.length > 0 ? get().log[get().log.length - 1]!.hash : KEY_DOMAIN;
          const openedVertex = { ...fresh, opened: true, plaintext, words: quad, solver, openedAt };
          const entry = checkpointFor(prev, get().log.length, openedVertex, solver, openedAt);
          const next = {
            vertices: get().vertices.map((item) => (item.index === index ? openedVertex : item)),
            log: [...get().log, entry],
            active: get().active,
            spent: get().spent,
            admissions: get().admissions,
          };
          try {
            commitSnapshot(next);
          } catch {
            return { ok: false, reason: "The opening was not committed. State is unchanged." };
          }
          set(next);
          return { ok: true, reason: "Tag verified. Checkpoint written. The words stay in this session only." };
        }),
      sealIntent: (draft) =>
        lock(draft.vertex, async () => {
          const reasons = judgePolicy(draft);
          if (reasons.length > 0) return { ok: false, reason: reasons[0]! };
          const current = get().vertices[draft.vertex];
          if (!current) return { ok: false, reason: "That vertex is not on this lattice." };
          if (get().spent + draft.value > ISSUER_LIMIT) return { ok: false, reason: "The issuer budget is spent." };
          let record: Record<string, string> | undefined;
          let admissionId: string | null = null;
          if (draft.selector === "mail.accept") {
            const mailbox = sessionMailbox(draft.sessionToken);
            if (!mailbox) return { ok: false, reason: "No local mailbox session." };
            if (draft.record?.from && draft.record.from !== mailbox) {
              return { ok: false, reason: "The record sender does not match the session." };
            }
            const message = {
              from: mailbox,
              to: draft.record?.to ?? "",
              subject: draft.statement,
              body: draft.record?.body ?? "",
            };
            let canonical: string;
            try {
              canonical = canonicalize(message);
            } catch (error) {
              return { ok: false, reason: error instanceof Error ? error.message : "Message rejected." };
            }
            const signature = signLocal(canonical);
            const run = runMail(message, signature);
            if (!run.ok || !run.record || run.vertex == null) {
              return { ok: false, reason: run.stages.find((stage) => stage.state === "FAIL")?.observed ?? "Mail was not admitted." };
            }
            if (run.vertex !== draft.vertex) return { ok: false, reason: "The recipient vertex does not match the registry." };
            record = run.record;
            admissionId = digest(`${mailbox}|${message.to}|${run.digest}`);
            if (get().admissions.includes(admissionId)) {
              return { ok: true, reason: "This message was already admitted.", commitment: current.commitment };
            }
          }
          if (current.receiptId && !current.opened) {
            return { ok: false, reason: "Unopened mail is still sealed on this vertex." };
          }
          try {
            const plaintext = encodeIntent(draft, record);
            const generation = current.generation + 1;
            const seal = await mintSeal(plaintext, draft.vertex, draft.hiddenCount);
            const nextVertex: Vertex = {
              ...current,
              generation,
              kind: draft.selector === "mail.accept" ? "intent" : current.kind,
              clue: seal.clue,
              hidden: seal.hidden,
              commitment: seal.commitment,
              nonce: seal.nonce,
              ciphertext: seal.ciphertext,
              profile: seal.profile,
              receiptId: toHex(crypto.getRandomValues(new Uint8Array(16))),
              admissionId,
              binding: "",
              opened: false,
              words: null,
              plaintext: null,
              solver: null,
              openedAt: null,
            };
            nextVertex.binding = bindingOf(nextVertex);
            const spent = get().spent + draft.value;
            const admissions = admissionId ? [...get().admissions, admissionId] : get().admissions;
            const next = {
              vertices: get().vertices.map((item) => (item.index === draft.vertex ? nextVertex : item)),
              log: get().log,
              active: draft.vertex,
              spent,
              admissions,
            };
            const fresh = get().vertices[draft.vertex];
            if (!fresh || fresh.ciphertext !== current.ciphertext || fresh.generation !== current.generation) {
              return { ok: false, reason: "The vertex changed before the seal could commit." };
            }
            commitSnapshot(next);
            set(next);
            return {
              ok: true,
              reason: "Sealed. Write down the four words. They are not stored.",
              words: seal.words,
              commitment: seal.commitment,
            };
          } catch (error) {
            return { ok: false, reason: error instanceof Error ? error.message : "The seal was not committed. Generation is unchanged." };
          }
        }),
    }),
    {
      name: STORAGE_KEY,
      version: 3,
      skipHydration: true,
      storage: createJSONStorage(() => ({
        getItem: (key) => safeStorage.getItem(key),
        setItem: () => undefined,
        removeItem: (key) => safeStorage.removeItem(key),
      })),
      partialize: (state) => ({
        vertices: state.vertices.map(publish),
        log: state.log,
        active: state.active,
        spent: state.spent,
        admissions: state.admissions,
      }),
    },
  ),
);

let pending: Promise<void> | null = null;

export function ensureLattice(): Promise<void> {
  if (!pending) {
    pending = (async () => {
      const raw = safeStorage.getItem(STORAGE_KEY);
      if (raw == null) {
        await useLattice.getState().bootstrap();
        return;
      }
      try {
        const parsed = JSON.parse(raw) as { state?: { vertices?: Vertex[]; log?: Checkpoint[]; active?: number; spent?: number; admissions?: string[] } };
        const vertices = parsed?.state?.vertices;
        const log = parsed?.state?.log ?? [];
        if (
          !Array.isArray(vertices) ||
          vertices.some((vertex) => vertex?.words != null || vertex?.plaintext != null) ||
          !validLattice(materialize(vertices as PublicVertex[]), log)
        ) {
          useLattice.setState({
            status: "quarantine",
            error: "The saved lattice failed validation and was left untouched.",
            vertices: [],
          });
          return;
        }
        useLattice.setState({
          vertices: materialize(vertices as PublicVertex[]),
          log,
          active: parsed.state?.active ?? 8,
          spent: parsed.state?.spent ?? 0,
          admissions: parsed.state?.admissions ?? [],
          status: "ready",
          error: null,
        });
      } catch {
        useLattice.setState({ status: "quarantine", error: "The saved lattice could not be read and was left untouched.", vertices: [] });
      }
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}

export async function resetLattice(): Promise<void> {
  safeStorage.removeItem(STORAGE_KEY);
  await useLattice.getState().bootstrap();
}
