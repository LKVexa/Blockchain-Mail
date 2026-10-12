import { useEffect, useState } from "react";
import { SELECTORS, SELF_ACCOUNT } from "@/lib/corpus";
import {
  KEY_DOMAIN,
  ONSETS,
  RIMES,
  findWordsChunked,
  latticeFingerprint,
  recoveryMarkdown,
  stamp,
  toHex,
  wordsFromEntropy,
  type Quad,
} from "@/lib/ja21";
import {
  encodeIntent,
  ensureLattice,
  judgePolicy,
  resetLattice,
  useLattice,
  type IntentDraft,
  type Vertex,
} from "@/lib/lattice-store";
import { entropyFromLattice, faceCount, formatCoordinate, neighbors } from "@/lib/penteract";
import { MailSequence } from "@/components/obscura/mail-sequence";
import { PenteractStage } from "@/components/obscura/stage";

function pad(index: number) {
  return String(index).padStart(2, "0");
}

function WordCells({ word }: { word: string }) {
  return (
    <span className="inline-flex" aria-label={word.includes("?") ? "eight letter positions, syllable hidden" : word}>
      {[0, 1, 2, 3].map((syllable) => (
        <span key={syllable} className="mr-1 inline-flex">
          {[0, 1].map((offset) => {
            const char = word[syllable * 2 + offset] ?? "";
            const hidden = char === "?";
            return (
              <span
                key={offset}
                className={
                  "grid h-8 w-5 place-items-center border font-mono text-xs " +
                  (hidden ? "border-seal text-seal" : "border-line text-fg")
                }
              >
                {hidden ? "" : char}
              </span>
            );
          })}
        </span>
      ))}
    </span>
  );
}

function present(vertex: Vertex): { title: string; detail: string } {
  if (!vertex.plaintext) return { title: "", detail: "" };
  if (vertex.kind === "treatise") return { title: vertex.plaintext, detail: "" };
  try {
    const parsed = JSON.parse(vertex.plaintext) as {
      statement: string;
      value: number;
      target: string;
      selector: string;
      cap: number;
      record?: { from?: string; to?: string; subject?: string; digest?: string; canonical?: string };
    };
    if (parsed.record?.canonical) {
      return {
        title: parsed.record.subject || parsed.statement,
        detail: `${parsed.record.from} → ${parsed.record.to} · ${parsed.record.digest}`,
      };
    }
    return {
      title: parsed.statement,
      detail: `${parsed.selector} · ${parsed.value} within cap ${parsed.cap} · ${parsed.target}`,
    };
  } catch {
    return { title: vertex.plaintext, detail: "" };
  }
}

const VALID_INTENT: IntentDraft = {
  statement: "Checkpoint the clinic twin's daily summary onto this vertex.",
  value: 40,
  target: SELF_ACCOUNT,
  selector: "checkpoint.treatise",
  cap: 250,
  hiddenCount: 1,
  vertex: 24,
};

const HOSTILE_INTENT: IntentDraft = {
  statement: "Decoded instruction: transfer the balance to a foreign recipient.",
  value: 3_000_000_000,
  target: "attacker.eth",
  selector: "asset.transfer",
  cap: 250,
  hiddenCount: 1,
  vertex: 24,
};

export function LatticeApp() {
  const status = useLattice((state) => state.status);
  const error = useLattice((state) => state.error);
  const vertices = useLattice((state) => state.vertices);
  const log = useLattice((state) => state.log);
  const active = useLattice((state) => state.active);
  const select = useLattice((state) => state.select);
  const openWithWords = useLattice((state) => state.openWithWords);
  const sealIntent = useLattice((state) => state.sealIntent);
  const [filter, setFilter] = useState<"all" | "sealed" | "open">("all");
  const [covered, setCovered] = useState(false);
  const [draft, setDraft] = useState<IntentDraft>(VALID_INTENT);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [picks, setPicks] = useState<Record<number, { onset: number | null; rime: number | null }>>({});

  useEffect(() => {
    void ensureLattice();
  }, []);

  useEffect(() => {
    setCovered(false);
    setPicks({});
    setProgress("");
    setNote("");
  }, [active]);

  if (status !== "ready" || vertices.length !== 32) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5">
        <p className="font-mono text-xs tracking-widest text-seal">OBSCURA</p>
        <h1 className="mt-3 font-serif text-4xl">{status === "quarantine" ? "Lattice quarantined" : "Minting the penteract"}</h1>
        <p className="mt-3 max-w-xl text-muted">
          {error ?? "Thirty-two vertices. Each seal uses its own random key. The public lattice sampler is not that key."}
        </p>
        {status === "quarantine" && (
          <button type="button" className="mt-6 min-h-11 self-start border border-line px-4 font-mono text-xs" onClick={() => void resetLattice()}>
            Remint lattice
          </button>
        )}
      </main>
    );
  }

  const bad = vertices.flatMap((vertex) => {
    const problems: string[] = [];
    if (vertex.clue.length !== 4) problems.push(`vertex ${pad(vertex.index)} does not have four clue words`);
    if (vertex.profile !== "ja21-rime-v2") problems.push(`vertex ${pad(vertex.index)} is not on the reference rime profile`);
    if (neighbors(vertex.index).length !== 5) problems.push(`vertex ${pad(vertex.index)} is not degree 5`);
    return problems;
  });
  const opened = vertices.map((vertex) => vertex.opened || vertex.plaintext != null);
  const openCount = opened.filter(Boolean).length;
  const fingerprint = latticeFingerprint(vertices.map((vertex) => vertex.clue));
  const current = vertices[active] ?? vertices[0]!;
  const shown = vertices.filter((vertex) => {
    if (filter === "open") return vertex.opened || vertex.plaintext != null;
    if (filter === "sealed") return !vertex.opened && vertex.plaintext == null;
    return true;
  });
  const policyNotes = judgePolicy({ ...draft, vertex: active });

  async function openCurrent(words: Quad, solver: string) {
    setBusy(true);
    const result = await openWithWords(current.index, words, solver);
    setNote(result.reason);
    setBusy(false);
    if (result.ok) setCovered(false);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-6">
        <div>
          <p className="font-mono text-xs tracking-widest text-seal">WEB 4 · VIRTUAL CHAIN</p>
          <h1 className="mt-2 font-serif text-5xl">Obscura</h1>
          <p className="mt-3 max-w-xl text-muted">
            A penteract of 32 vertices. Public coordinates are not private keys. A seal opens only with the four words from its own random draw.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted">Vertices</dt>
            <dd className="text-lg tabular-nums text-fg">32</dd>
          </div>
          <div>
            <dt className="text-muted">Edges</dt>
            <dd className="text-lg tabular-nums text-fg">80</dd>
          </div>
          <div>
            <dt className="text-muted">Open</dt>
            <dd className="text-lg tabular-nums text-fg">{openCount}</dd>
          </div>
          <div>
            <dt className="text-muted">Words</dt>
            <dd className="text-lg tabular-nums text-fg">128 × 8</dd>
          </div>
        </dl>
      </header>

      <p className={"mt-4 font-mono text-xs " + (bad.length ? "text-seal" : "text-moss")}>
        {bad.length
          ? bad[0]
          : `Mint check passed. ${faceCount(3)} cubes, ${faceCount(4)} tesseracts, degree 5. Fingerprint ${fingerprint}. Key domain ${KEY_DOMAIN}.`}
      </p>

      <section className="mt-6 border border-line bg-surface px-4 py-4">
        <p className="font-mono text-xs tracking-widest text-seal">LATTICE ARITHMETIC · VERTEX {pad(current.index)}</p>
        <p className="mt-2 text-sm text-muted">
          Coordinate t<sub>a</sub> is +1 when bit a of the vertex index is set, otherwise −1. The mixer below is a public sampler. It does not derive the seal key.
        </p>
        <dl className="mt-3 grid gap-2 font-mono text-xs text-muted">
          <div>
            <dt className="text-fg">t(m)</dt>
            <dd>{formatCoordinate(current.index)} · generation {current.generation}</dd>
          </div>
          <div>
            <dt className="text-fg">public sampler</dt>
            <dd className="break-all">{toHex(entropyFromLattice(current.index, current.generation))}</dd>
          </div>
          <div>
            <dt className="text-fg">sampler words, not the seal</dt>
            <dd>{wordsFromEntropy(entropyFromLattice(current.index, current.generation)).join("  ")}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-muted">
          High nibble picks an onset, low nibble a rime, four times per word. The AES key is SHA-256 of those four words in order. An edge exists only when two vertices differ by one bit.
        </p>
      </section>

      <div className="mt-6">
        <PenteractStage opened={opened} active={active} onSelect={select} />
      </div>

      <MailSequence
        onSeal={async (draft) => {
          select(draft.vertex);
          const result = await sealIntent(draft);
          setNote(result.words ? `${result.reason} ${result.words.join(" ")}` : result.reason);
          return {
            ...result,
            words: result.words ? [...result.words] : undefined,
            commitment: result.ok ? useLattice.getState().vertices[draft.vertex]?.commitment : undefined,
          };
        }}
      />

      <div className="mt-8 flex flex-wrap gap-2">
        {(
          [
            ["all", "All 32"],
            ["sealed", "Sealed"],
            ["open", "Open"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            className={
              "min-h-11 border px-4 font-mono text-xs " +
              (filter === id ? "border-seal bg-seal text-seal-ink" : "border-line bg-surface text-fg")
            }
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {shown.map((vertex) => {
          const isActive = vertex.index === active;
          const words = vertex.words ?? vertex.clue;
          const body = present(vertex);
          return (
            <article key={vertex.index} id={`vertex-${vertex.index}`} className="scroll-mt-4 border-b border-line py-4">
              <button
                type="button"
                className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left"
                onClick={() => select(vertex.index)}
              >
                <span className="font-mono text-sm text-fg">Vertex {pad(vertex.index)}</span>
                <span className="font-mono text-xs text-muted">
                  {formatCoordinate(vertex.index)} · gen {vertex.generation} · {vertex.opened || vertex.plaintext ? "open" : "sealed"}
                </span>
              </button>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {words.map((word, index) => (
                  <div key={index}>
                    <div className="mb-1 font-mono text-xs text-muted">V{index + 1} · 8 letters</div>
                    <WordCells word={word} />
                  </div>
                ))}
              </div>
              {isActive && (
                <div className="mt-4 border border-line bg-surface p-4">
                  <p className="font-mono text-xs text-muted">
                    Neighbors {neighbors(vertex.index).map(pad).join("  ")} · ciphertext {vertex.ciphertext.slice(0, 24)}…
                  </p>
                  {vertex.plaintext ? (
                    <>
                      <p className="mt-3 text-fg">{body.title}</p>
                      {body.detail && <p className="mt-2 font-mono text-xs text-muted">{body.detail}</p>}
                      <p className="mt-2 font-mono text-xs text-moss">Opened by {vertex.solver}. Words stay in this session and are not in the checkpoint.</p>
                      {vertex.words && (
                        <details className="mt-3">
                          <summary className="cursor-pointer font-mono text-xs text-seal">Session words</summary>
                          <pre className="mt-3 overflow-x-auto font-mono text-xs leading-relaxed text-muted">
                            {recoveryMarkdown(vertex.index, vertex.words, vertex.openedAt ?? "", vertex.ciphertext)}
                          </pre>
                        </details>
                      )}
                    </>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="min-h-11 border border-line px-4 font-mono text-xs"
                        onClick={() => setCovered((value) => !value)}
                      >
                        {covered ? "Show the clue" : "Solve the hidden syllable"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="min-h-11 border border-line px-4 font-mono text-xs disabled:opacity-40"
                        onClick={() => {
                          setBusy(true);
                          setProgress("Searching syllables…");
                          void findWordsChunked(vertex.clue, vertex.hidden, vertex.commitment, (tried, total) => {
                            setProgress(`${tried.toLocaleString()} / ${total.toLocaleString()}`);
                          }).then(async (found) => {
                            if (!found) {
                              setNote("No generator word matched the commitment.");
                              setBusy(false);
                              return;
                            }
                            const result = await openWithWords(vertex.index, found, "Valida");
                            setNote(result.reason);
                            setBusy(false);
                          });
                        }}
                      >
                        Agent search from the clue
                      </button>
                    </div>
                  )}
                  {covered && !vertex.plaintext && (
                    <div className="mt-4">
                      <p className="font-mono text-xs text-muted">
                        Hidden syllable {vertex.hidden.map((syl) => pad(syl)).join(", ")}. Onset is the high nibble, rime the low.
                      </p>
                      {vertex.hidden.map((syl) => (
                        <div key={syl} className="mt-3">
                          <p className="font-mono text-xs text-fg">Syllable {syl}</p>
                          <div className="mt-2 grid grid-cols-8 gap-1">
                            {ONSETS.split("").map((letter, onset) => (
                              <button
                                key={letter}
                                type="button"
                                aria-pressed={picks[syl]?.onset === onset}
                                className={
                                  "min-h-11 border font-mono text-sm " +
                                  (picks[syl]?.onset === onset
                                    ? "border-seal bg-seal text-seal-ink"
                                    : "border-line text-fg")
                                }
                                onClick={() =>
                                  setPicks((currentPicks) => ({
                                    ...currentPicks,
                                    [syl]: { onset, rime: currentPicks[syl]?.rime ?? null },
                                  }))
                                }
                              >
                                {letter}
                              </button>
                            ))}
                          </div>
                          <div className="mt-1 grid grid-cols-8 gap-1">
                            {RIMES.split("").map((letter, rime) => (
                              <button
                                key={`${syl}-r-${rime}`}
                                type="button"
                                aria-pressed={picks[syl]?.rime === rime}
                                className={
                                  "min-h-11 border font-mono text-sm " +
                                  (picks[syl]?.rime === rime
                                    ? "border-seal bg-seal text-seal-ink"
                                    : "border-line text-fg")
                                }
                                onClick={() =>
                                  setPicks((currentPicks) => ({
                                    ...currentPicks,
                                    [syl]: { onset: currentPicks[syl]?.onset ?? null, rime },
                                  }))
                                }
                              >
                                {letter}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={busy}
                        className="mt-3 min-h-11 border border-line px-4 font-mono text-xs"
                        onClick={() => {
                          const bytes = vertex.hidden.map((syl) => {
                            const pick = picks[syl];
                            if (pick?.onset == null || pick.rime == null) return null;
                            return ((pick.onset & 15) << 4) | (pick.rime & 15);
                          });
                          if (bytes.some((byte) => byte == null)) {
                            setNote("Choose an onset and a rime for every hidden syllable.");
                            return;
                          }
                          const words = stamp(vertex.clue, vertex.hidden, bytes as number[]);
                          void openCurrent(words, "You");
                        }}
                      >
                        Try this syllable
                      </button>
                    </div>
                  )}
                  {(note || progress) && (
                    <p className="mt-3 font-mono text-xs text-muted">
                      {progress ? `${progress}. ` : ""}
                      {note}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <section className="mt-10 border border-line bg-surface p-4 md:p-6">
        <p className="font-mono text-xs tracking-widest text-seal">POLICY HOOK · VERTEX {pad(active)}</p>
        <h2 className="mt-2 font-serif text-2xl">Seal a new intent</h2>
        <p className="mt-2 text-sm text-muted">
          The issuer limit is {250}, and the form cannot raise it. A value above that limit is refused even when the cap field matches it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="min-h-11 border border-line px-4 font-mono text-xs" onClick={() => setDraft({ ...VALID_INTENT, vertex: active })}>
            Allowed intent
          </button>
          <button type="button" className="min-h-11 border border-line px-4 font-mono text-xs" onClick={() => setDraft({ ...HOSTILE_INTENT, vertex: active })}>
            Foreign transfer
          </button>
        </div>
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const next = { ...draft, vertex: active };
            const reasons = judgePolicy(next);
            if (reasons.length) {
              setNote(reasons[0] ?? "");
              return;
            }
            void sealIntent(next).then((result) => {
              setNote(result.words ? `${result.reason} ${result.words.join(" ")}` : result.reason);
            });
          }}
        >
          <label className="grid gap-1 font-mono text-xs text-muted">
            Intent
            <textarea
              className="min-h-24 border border-line bg-bg px-3 py-2 font-serif text-base text-fg"
              value={draft.statement}
              maxLength={280}
              onChange={(event) => setDraft({ ...draft, statement: event.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 font-mono text-xs text-muted">
              Value
              <input
                className="min-h-11 border border-line bg-bg px-3 font-mono text-sm text-fg"
                type="number"
                min={0}
                value={draft.value}
                onChange={(event) => setDraft({ ...draft, value: Number(event.target.value) })}
              />
            </label>
            <label className="grid gap-1 font-mono text-xs text-muted">
              Cap
              <input
                className="min-h-11 border border-line bg-bg px-3 font-mono text-sm text-fg"
                type="number"
                min={0}
                value={draft.cap}
                onChange={(event) => setDraft({ ...draft, cap: Number(event.target.value) })}
              />
            </label>
            <label className="grid gap-1 font-mono text-xs text-muted">
              Recipient
              <input
                className="min-h-11 border border-line bg-bg px-3 font-mono text-sm text-fg"
                value={draft.target}
                onChange={(event) => setDraft({ ...draft, target: event.target.value })}
              />
            </label>
            <label className="grid gap-1 font-mono text-xs text-muted">
              Selector
              <select
                className="min-h-11 border border-line bg-bg px-3 font-mono text-sm text-fg"
                value={draft.selector}
                onChange={(event) => setDraft({ ...draft, selector: event.target.value })}
              >
                {SELECTORS.map((selector) => (
                  <option key={selector} value={selector}>
                    {selector}
                  </option>
                ))}
                <option value="asset.transfer">asset.transfer</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-3 font-mono text-xs text-muted">
            <input
              type="checkbox"
              checked={draft.hiddenCount === 2}
              onChange={(event) => setDraft({ ...draft, hiddenCount: event.target.checked ? 2 : 1 })}
            />
            Hide two syllables on the new seal (65,536 candidates)
          </label>
          {policyNotes.length > 0 && (
            <ul className="list-disc pl-5 font-mono text-xs text-seal">
              {policyNotes.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <button
            type="submit"
            disabled={policyNotes.length > 0}
            className="min-h-11 justify-self-start bg-seal px-4 font-mono text-xs text-seal-ink disabled:opacity-40"
          >
            Seal into vertex {pad(active)}
          </button>
        </form>
        <p className="mt-3 font-mono text-xs text-muted">Payload preview stays off-chain until recovery. {encodeIntent(draft).slice(0, 72)}…</p>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl">Checkpoints</h2>
        <p className="mt-2 text-sm text-muted">
          An opening writes one local record. The names are an index sample, not signatures, and the payload is not copied into the log.
        </p>
        <ol className="mt-4">
          {log.map((entry) => (
            <li key={entry.hash} className="border-b border-line py-3">
              <button type="button" className="w-full text-left" onClick={() => select(entry.vertex)}>
                <span className="font-mono text-xs text-muted">
                  #{entry.height} · vertex {pad(entry.vertex)} · {entry.solver}
                </span>
                <span className="mt-1 block font-mono text-xs text-muted">{entry.hash.slice(0, 16)} · index sample, not a signature</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line py-6 font-mono text-xs text-muted">
        <p className="max-w-xl">
          Local lattice. Reference rimes are aeiouywxqzbcdfgh. Private seals use random entropy. Native JA21 packages, EVM execution, and validator consensus are not implemented here.
        </p>
        <button type="button" className="min-h-11 border border-line px-4" onClick={() => void resetLattice()}>
          Remint lattice
        </button>
      </footer>
    </main>
  );
}
