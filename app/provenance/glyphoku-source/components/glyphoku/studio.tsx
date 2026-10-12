import { useEffect, useRef, useState } from "react";
import {
  commitDomain,
  emptyInstance,
  freezeDraft,
  issuePermit,
  normalizeLabel,
  sendLocal,
  type FrozenDraft,
  type Instance,
} from "@/lib/glyphoku/registry";
import { dealPlayable } from "@/lib/glyphoku/deal";
import { glyphKind, glyphText, glyphsFor } from "@/lib/glyphoku/glyphs";
import { PLAYED, issuanceAllowed, puzzlesRequired, verifyCandidate } from "@/lib/glyphoku/rules";
import { createSolver, type Solver } from "@/lib/glyphoku/solver";

const STORAGE_KEY = "glyphoku-local-127";

type Puzzle = { givens: number[]; candidate: number[] | null };
type Phase = "LIVE SOLVING" | "VERIFYING" | "FAILED" | "READY" | "SENT";

type Run = {
  action: "domain" | "envelope";
  label: string;
  draft: FrozenDraft | null;
  puzzles: Puzzle[];
  index: number;
  phase: Phase;
  note: string;
};

function loadInstance(): Instance {
  if (typeof window === "undefined") return emptyInstance();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyInstance();
    const parsed = JSON.parse(raw) as Instance;
    if (
      !parsed ||
      !Number.isInteger(parsed.g) ||
      parsed.g < 1 ||
      !Array.isArray(parsed.domains) ||
      !Array.isArray(parsed.mailboxes) ||
      !Array.isArray(parsed.permits) ||
      !Array.isArray(parsed.deliveries)
    ) {
      window.localStorage.setItem(`${STORAGE_KEY}-quarantine`, raw);
      return emptyInstance();
    }
    return parsed;
  } catch {
    return emptyInstance();
  }
}

function cellClass(index: number, solverKind: string, glyph: string): string {
  const order = PLAYED.order;
  const col = index % order;
  const row = Math.floor(index / order);
  const thickR = col % PLAYED.boxCols === PLAYED.boxCols - 1 && col !== order - 1;
  const thickB = row % PLAYED.boxRows === PLAYED.boxRows - 1 && row !== order - 1;
  const ink = glyphKind(glyph);
  const tone = ink === "letter" ? "text-moss" : ink === "symbol" ? "text-seal" : "text-fg";
  const mark = solverKind === "guess" ? "underline decoration-2 decoration-seal" : solverKind === "given" ? "font-semibold" : "";
  return `grid h-6 w-6 place-items-center font-serif text-[13px] leading-none sm:h-7 sm:w-7 ${thickR ? "border-r-2 border-r-fg" : "border-r border-r-line"} ${thickB ? "border-b-2 border-b-fg" : "border-b border-b-line"} ${tone} ${mark}`;
}

export function GlyphokuStudio() {
  const [instance, setInstance] = useState<Instance>(emptyInstance);
  const [ready, setReady] = useState(false);
  const [label, setLabel] = useState("studio");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Bench note");
  const [body, setBody] = useState("The local board is filed.");
  const [run, setRun] = useState<Run | null>(null);
  const [board, setBoard] = useState<number[]>(Array.from({ length: PLAYED.order * PLAYED.order }, () => 0));
  const [kind, setKind] = useState<string[]>(Array.from({ length: PLAYED.order * PLAYED.order }, () => "empty"));
  const [lastEvent, setLastEvent] = useState("Idle");
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(24);
  const [composing, setComposing] = useState(false);
  const [counts, setCounts] = useState({ guesses: 0, retractions: 0 });
  const solverRef = useRef<Solver | null>(null);
  const runRef = useRef<Run | null>(null);
  const instanceRef = useRef(instance);
  const pausedRef = useRef(false);
  const speedRef = useRef(1);
  const stepping = useRef(false);

  useEffect(() => {
    setInstance(loadInstance());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(instance));
    instanceRef.current = instance;
  }, [instance, ready]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  function paint(solver: Solver, eventLabel: string) {
    const snap = solver.snapshot();
    setBoard(snap.board);
    setKind(snap.kind);
    setLastEvent(eventLabel);
  }

  function beginPuzzle(nextRun: Run, givens: number[], resetCounts: boolean) {
    const solver = createSolver(givens, PLAYED);
    solverRef.current = solver;
    const init = solver.step();
    paint(solver, init ? `${init.type} · givens on the grid before search` : "INIT");
    runRef.current = nextRun;
    setRun(nextRun);
    setPaused(false);
    if (resetCounts) setCounts({ guesses: 0, retractions: 0 });
  }

  function finishSolved() {
    const solver = solverRef.current;
    const current = runRef.current;
    if (!solver || !current) return;
    const snap = solver.snapshot();
    const puzzle = current.puzzles[current.index];
    if (!puzzle) return;
    const verdict = verifyCandidate(puzzle.givens, snap.board, PLAYED);
    if (!verdict.ok) {
      const failed = { ...current, phase: "FAILED" as const, note: verdict.reason };
      runRef.current = failed;
      setRun(failed);
      solverRef.current = null;
      return;
    }
    const puzzles = current.puzzles.slice();
    puzzles[current.index] = { givens: puzzle.givens, candidate: snap.board };
    if (current.index + 1 < puzzles.length) {
      const advanced: Run = { ...current, puzzles, index: current.index + 1, phase: "LIVE SOLVING", note: "Next board in this batch." };
      beginPuzzle(advanced, puzzles[current.index + 1]!.givens, false);
      return;
    }
    if (current.action === "domain") {
      const result = commitDomain(
        instanceRef.current,
        current.label,
        puzzles.map((item) => ({ givens: item.givens, candidate: item.candidate! })),
      );
      if (!result.ok) {
        const failed = { ...current, puzzles, phase: "FAILED" as const, note: result.reason };
        runRef.current = failed;
        setRun(failed);
        return;
      }
      setInstance(result.instance);
      setTo(result.mailbox.address);
      const done: Run = { ...current, puzzles, phase: "READY", note: `Domain created: ${result.domain.address}` };
      runRef.current = done;
      setRun(done);
      solverRef.current = null;
      return;
    }
    if (!current.draft) return;
    const result = issuePermit(
      instanceRef.current,
      current.draft,
      puzzles.map((item) => ({ givens: item.givens, candidate: item.candidate! })),
    );
    if (!result.ok) {
      const failed = { ...current, puzzles, phase: "FAILED" as const, note: result.reason };
      runRef.current = failed;
      setRun(failed);
      return;
    }
    setInstance(result.instance);
    const done: Run = { ...current, puzzles, phase: "READY", note: "ENVELOPE READY — NOT SENT" };
    runRef.current = done;
    setRun(done);
    solverRef.current = null;
  }

  function stepOnce(): boolean {
    const solver = solverRef.current;
    if (!solver || !runRef.current || runRef.current.phase !== "LIVE SOLVING") return true;
    const event = solver.step();
    if (!event) return true;
    paint(solver, `${event.type} · ${event.rule} · depth ${event.depth} · node ${event.nodes}`);
    if (event.type === "GUESS") setCounts((current) => ({ ...current, guesses: current.guesses + 1 }));
    if (event.type === "RETRACT") setCounts((current) => ({ ...current, retractions: current.retractions + 1 }));
    if (event.type === "SEARCH_SOLVED") {
      const verifying = { ...runRef.current, phase: "VERIFYING" as const, note: "Checking givens, rows, columns, and boxes." };
      runRef.current = verifying;
      setRun(verifying);
      finishSolved();
      return true;
    }
    if (event.type === "SEARCH_EXHAUSTED") {
      const failed = { ...runRef.current, phase: "FAILED" as const, note: "The search ended without a candidate. Nothing was issued." };
      runRef.current = failed;
      setRun(failed);
      solverRef.current = null;
      return true;
    }
    return false;
  }

  const stepRef = useRef<() => boolean>(() => true);
  stepRef.current = stepOnce;

  useEffect(() => {
    const id = window.setInterval(() => {
      if (pausedRef.current || stepping.current) return;
      if (!solverRef.current || runRef.current?.phase !== "LIVE SOLVING") return;
      const count = speedRef.current;
      for (let i = 0; i < count; i++) {
        if (stepRef.current()) break;
      }
    }, 100);
    const onHide = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  function startDomain() {
    const allowed = issuanceAllowed(instance.g);
    if (!allowed.ok) {
      setLastEvent(allowed.reason);
      return;
    }
    if (runRef.current?.phase === "LIVE SOLVING") return;
    const named = normalizeLabel(label);
    if (!named.ok) {
      setLastEvent(named.reason);
      return;
    }
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    const ordinal = instance.g;
    setComposing(true);
    setLastEvent("Composing the hard 16×16 cipher…");
    window.setTimeout(() => {
      try {
        const count = puzzlesRequired(ordinal);
        const puzzles: Puzzle[] = [];
        for (let i = 0; i < count; i++) puzzles.push({ givens: dealPlayable(ordinal, seed + i + 1), candidate: null });
        beginPuzzle(
          { action: "domain", label: named.label, draft: null, puzzles, index: 0, phase: "LIVE SOLVING", note: "Hard cipher. A finished animation does not create the domain." },
          puzzles[0]!.givens,
          true,
        );
      } catch (error) {
        setLastEvent(error instanceof Error ? error.message : "The dealer paused.");
      } finally {
        setComposing(false);
      }
    }, 40);
  }

  function startEnvelope() {
    const allowed = issuanceAllowed(instance.g);
    if (!allowed.ok) {
      setLastEvent(allowed.reason);
      return;
    }
    const sender = instance.mailboxes[0]?.address;
    if (!sender) {
      setLastEvent("Create a local domain before an envelope.");
      return;
    }
    const frozenDraft = freezeDraft({ from: sender, to, bcc: "", subject, body }, instance);
    if (!frozenDraft.ok) {
      setLastEvent(frozenDraft.reason);
      return;
    }
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    const ordinal = instance.g;
    setComposing(true);
    setLastEvent("Composing the hard 16×16 cipher…");
    window.setTimeout(() => {
      try {
        const count = puzzlesRequired(ordinal);
        const puzzles: Puzzle[] = [];
        for (let i = 0; i < count; i++) puzzles.push({ givens: dealPlayable(ordinal, seed + i + 17), candidate: null });
        beginPuzzle(
          {
            action: "envelope",
            label: "",
            draft: frozenDraft.draft,
            puzzles,
            index: 0,
            phase: "LIVE SOLVING",
            note: "The draft is frozen. This cipher is harder than the domain. Solving does not send it.",
          },
          puzzles[0]!.givens,
          true,
        );
      } catch (error) {
        setLastEvent(error instanceof Error ? error.message : "The dealer paused.");
      } finally {
        setComposing(false);
      }
    }, 40);
  }

  function stopRun() {
    solverRef.current = null;
    if (runRef.current) {
      const stopped = { ...runRef.current, phase: "FAILED" as const, note: "Stopped. No resource was issued." };
      runRef.current = stopped;
      setRun(stopped);
    }
  }

  const gate = issuanceAllowed(instance.g);
  const mailbox = instance.mailboxes[0]?.address ?? "";
  const openPermit = instance.permits.find((permit) => permit.state === "READY" && permit.draft);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <header className="border-b border-line pb-6">
        <p className="font-mono text-xs tracking-widest text-seal">GLYPHOKU · LOCAL 127 · NOT A CURRENCY</p>
        <h1 className="mt-2 font-serif text-5xl">Watch the board, then the registry moves</h1>
        <p className="mt-3 max-w-2xl text-muted">
          The computer solves a 16×16 Glyphoku cipher: digits, letters, and symbols, each once in every row, column, and box. This is the hard band, not a numeral sudoku. The first domain takes one board. The next envelope takes two.
        </p>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-3 font-mono text-xs sm:grid-cols-4">
        <div className="border border-line px-3 py-2">
          <dt className="text-muted">Next ordinal</dt>
          <dd className="text-lg text-fg">g={instance.g}</dd>
        </div>
        <div className="border border-line px-3 py-2">
          <dt className="text-muted">Puzzles required</dt>
          <dd className="text-lg text-fg">{gate.ok ? gate.puzzles : "paused"}</dd>
        </div>
        <div className="border border-line px-3 py-2">
          <dt className="text-muted">Domains</dt>
          <dd className="text-lg text-fg">{instance.domains.length}</dd>
        </div>
        <div className="border border-line px-3 py-2">
          <dt className="text-muted">Inbox</dt>
          <dd className="text-lg text-fg">{instance.deliveries.length}</dd>
        </div>
      </dl>

      <section className="mt-6 grid gap-6 lg:grid-cols-[auto_1fr]">
        <div>
          <div className="overflow-x-auto">
            <div
              className="inline-grid border-2 border-fg bg-surface"
              role="grid"
              aria-label="Glyphoku cipher"
              style={{ gridTemplateColumns: `repeat(${PLAYED.order}, 1.75rem)` }}
            >
              {board.map((value, index) => {
                const glyph = glyphText(PLAYED.order, value);
                return (
                  <div key={index} role="gridcell" className={cellClass(index, kind[index] ?? "empty", glyph)} aria-label={`row ${Math.floor(index / PLAYED.order) + 1} column ${(index % PLAYED.order) + 1} ${glyph || "empty"}`}>
                    {glyph}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-2 max-w-md font-mono text-xs text-muted">
            {glyphsFor(PLAYED.order).map((glyph) => (
              <span key={glyph} className={glyphKind(glyph) === "letter" ? "mr-1 text-moss" : glyphKind(glyph) === "symbol" ? "mr-1 text-seal" : "mr-1 text-fg"}>{glyph}</span>
            ))}
            <span className="text-muted">Given is heavy. A guess is underlined.</span>
          </p>
          <p className="mt-2 min-h-11 font-mono text-xs text-fg">{lastEvent}</p>
          <p className="font-mono text-xs text-muted">Guesses {counts.guesses} · Retractions {counts.retractions}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="min-h-11 border border-line px-3 font-mono text-xs" onClick={() => setPaused((value) => !value)}>
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              className="min-h-11 border border-line px-3 font-mono text-xs"
              onClick={() => {
                stepping.current = true;
                setPaused(true);
                stepOnce();
                stepping.current = false;
              }}
            >
              Single step
            </button>
            <button type="button" className="min-h-11 border border-line px-3 font-mono text-xs" onClick={stopRun}>
              Stop
            </button>
            <label className="flex min-h-11 items-center gap-2 font-mono text-xs text-muted">
              Speed
              <select className="min-h-11 border border-line bg-bg px-2 text-fg" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                <option value={1}>1×</option>
                <option value={8}>8×</option>
                <option value={24}>24×</option>
                <option value={40}>40×</option>
              </select>
            </label>
          </div>
          {run && (
            <p className="mt-3 text-sm text-muted">
              {run.phase} · puzzle {run.index + 1} of {run.puzzles.length}. {run.note}
            </p>
          )}
        </div>

        <div className="grid content-start gap-6">
          <section className="border border-line bg-surface p-4">
            <h2 className="font-serif text-2xl">Create a local domain</h2>
            <p className="mt-2 text-sm text-muted">The name stays inside this browser. It is not a public registration.</p>
            <label className="mt-3 grid gap-1 font-mono text-xs text-muted">
              Label
              <input className="min-h-11 border border-line bg-bg px-3 font-mono text-sm text-fg" value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <button type="button" className="mt-3 min-h-11 bg-seal px-4 font-mono text-xs text-seal-ink disabled:opacity-40" disabled={!gate.ok || composing || run?.phase === "LIVE SOLVING"} onClick={startDomain}>
              Solve & Create Domain
            </button>
            {instance.domains[0] && <p className="mt-3 font-mono text-xs text-moss">{instance.domains[0].address}</p>}
            {mailbox && <p className="font-mono text-xs text-muted">{mailbox}</p>}
          </section>

          <section className="border border-line bg-surface p-4">
            <h2 className="font-serif text-2xl">Freeze a message</h2>
            <p className="mt-2 text-sm text-muted">Solving issues one permit. It stays unsent until you press send.</p>
            <label className="mt-3 grid gap-1 font-mono text-xs text-muted">
              To
              <input className="min-h-11 border border-line bg-bg px-3 font-mono text-sm text-fg" value={to} onChange={(event) => setTo(event.target.value)} placeholder={mailbox || "owner@studio.glyphoku.localhost"} />
            </label>
            <label className="mt-3 grid gap-1 font-mono text-xs text-muted">
              Subject
              <input className="min-h-11 border border-line bg-bg px-3 text-sm text-fg" value={subject} maxLength={120} onChange={(event) => setSubject(event.target.value)} />
            </label>
            <label className="mt-3 grid gap-1 font-mono text-xs text-muted">
              Body
              <textarea className="min-h-24 border border-line bg-bg px-3 py-2 text-sm text-fg" value={body} maxLength={4000} onChange={(event) => setBody(event.target.value)} />
            </label>
            <button type="button" className="mt-3 min-h-11 bg-seal px-4 font-mono text-xs text-seal-ink disabled:opacity-40" disabled={!mailbox || !gate.ok || composing || run?.phase === "LIVE SOLVING"} onClick={startEnvelope}>
              Solve for Envelope
            </button>
            {openPermit && (
              <div className="mt-4 border border-seal px-3 py-3">
                <p className="font-mono text-xs text-seal">ENVELOPE READY — NOT SENT</p>
                <p className="mt-2 text-sm">{openPermit.draft.subject}</p>
                <p className="text-sm text-muted">{openPermit.draft.from} → {openPermit.draft.to.join(", ")}</p>
                <button
                  type="button"
                  className="mt-3 min-h-11 border border-line px-4 font-mono text-xs"
                  onClick={() => {
                    setInstance((current) => {
                      const permit = current.permits.find((item) => item.state === "READY");
                      if (!permit) return current;
                      const result = sendLocal(current, permit.id, permit.draft);
                      if (!result.ok) {
                        setLastEvent(result.reason);
                        return current;
                      }
                      setLastEvent(result.instance === current ? "Already delivered." : "DELIVERED LOCAL");
                      setRun((active) => (active ? { ...active, phase: "SENT", note: "Delivered to the local inbox." } : active));
                      return result.instance;
                    });
                  }}
                >
                  Send Local Email
                </button>
              </div>
            )}
          </section>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-2xl">Local inbox</h2>
        {instance.deliveries.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing delivered. A queued flag is not a message.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {instance.deliveries.map((message) => (
              <li key={message.id} className="border border-line px-3 py-3">
                <p className="font-mono text-xs text-muted">{message.from} → {message.mailbox}</p>
                <p className="mt-1 font-serif text-xl">{message.subject}</p>
                <p className="mt-1 text-sm">{message.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-10 border-t border-line py-6 font-mono text-xs text-muted">
        <p>
          16×16 cipher, hard band. Speed only changes pacing. Ordinals after g=2 are paused. The 4,800 source controls stay NOT_ASSESSED. No public DNS, no coin.
        </p>
        {!gate.ok && <p className="mt-2 text-seal">{gate.reason}</p>}
      </footer>
    </main>
  );
}
