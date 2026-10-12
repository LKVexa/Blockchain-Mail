import { useState } from "react";
import { canonicalize, MAILBOXES, runMail, signLocal, type LocalMessage, type Stage } from "@/lib/bem-mail";
import { SELF_ACCOUNT } from "@/lib/corpus";
import { judgePolicy, openSession, type IntentDraft } from "@/lib/lattice-store";

const CLEAN: LocalMessage = {
  from: "clinic@loopback.invalid",
  to: "archive@loopback.invalid",
  subject: "Daily twin",
  body: "The clinic twin summary is ready for the local archive.",
};

function tone(state: Stage["state"]): string {
  if (state === "PASS") return "text-moss";
  if (state === "FAIL") return "text-seal";
  return "text-muted";
}

export function MailSequence({
  onSeal,
}: {
  onSeal: (draft: IntentDraft) => Promise<{ ok: boolean; reason: string; commitment?: string; words?: string[] }>;
}) {
  const [message, setMessage] = useState<LocalMessage>(CLEAN);
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [inbox, setInbox] = useState<{ to: string; subject: string; cid: string }[]>([]);

  return (
    <section className="mt-6 border border-line bg-surface px-4 py-4">
      <p className="font-mono text-xs tracking-widest text-seal">LOCAL MAIL</p>
      <h2 className="mt-1 font-serif text-2xl">Check the message, then seal it</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        A stage is green only when that check passed. Signature, membership, and the local router run here. EVM, zero-knowledge proving, and a blob store do not.
      </p>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          let signature: string | null = null;
          try {
            signature = signLocal(canonicalize(message));
          } catch {
            signature = null;
          }
          const run = runMail(message, signature);
          setStages(run.stages);
          if (!run.ok || !run.record || run.vertex == null) {
            setNote(run.stages.find((stage) => stage.state === "FAIL")?.observed ?? "Not delivered.");
            return;
          }
          let token: string;
          try {
            token = openSession(message.from);
          } catch (error) {
            setNote(error instanceof Error ? error.message : "No session.");
            return;
          }
          const draft: IntentDraft = {
            statement: message.subject.trim(),
            value: 1,
            target: SELF_ACCOUNT,
            selector: "mail.accept",
            cap: 250,
            hiddenCount: 1,
            vertex: run.vertex,
            sessionToken: token,
            record: { to: message.to, body: message.body },
          };
          const policy = judgePolicy(draft);
          if (policy.length > 0) {
            setNote(policy[0]!);
            return;
          }
          setBusy(true);
          void onSeal(draft).then((result) => {
            setBusy(false);
            if (!result.ok) {
              setNote(result.reason);
              return;
            }
            setStages((current) =>
              (current ?? run.stages).map((stage) => {
                if (stage.id === "P08" && result.commitment) {
                  return { ...stage, state: "PASS" as const, observed: `Sealed. Commitment ${result.commitment.slice(0, 16)}.` };
                }
                if (stage.id === "P12") {
                  return { ...stage, state: "PASS" as const, observed: "The lattice accepted this admission once." };
                }
                return stage;
              }),
            );
            setInbox((rows) => [
              { to: message.to, subject: message.subject.trim(), cid: run.record?.cid.slice(0, 16) ?? "" },
              ...rows,
            ]);
            setNote(result.words ? `${result.reason} ${result.words.join(" ")}` : result.reason);
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 font-mono text-xs text-muted">
            From
            <select
              className="min-h-11 border border-line bg-bg px-3 font-mono text-sm text-fg"
              value={message.from}
              onChange={(event) => setMessage({ ...message, from: event.target.value })}
            >
              {MAILBOXES.map((box) => (
                <option key={box.address} value={box.address}>
                  {box.label} · {box.address}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 font-mono text-xs text-muted">
            To
            <select
              className="min-h-11 border border-line bg-bg px-3 font-mono text-sm text-fg"
              value={MAILBOXES.some((box) => box.address === message.to) ? message.to : "outside"}
              onChange={(event) =>
                setMessage({
                  ...message,
                  to: event.target.value === "outside" ? "outsider@example.com" : event.target.value,
                })
              }
            >
              {MAILBOXES.map((box) => (
                <option key={box.address} value={box.address}>
                  {box.label} · vertex {String(box.vertex).padStart(2, "0")}
                </option>
              ))}
              <option value="outside">Outside recipient</option>
            </select>
          </label>
        </div>
        <label className="grid gap-1 font-mono text-xs text-muted">
          Subject
          <input
            className="min-h-11 border border-line bg-bg px-3 font-serif text-base text-fg"
            value={message.subject}
            maxLength={120}
            onChange={(event) => setMessage({ ...message, subject: event.target.value })}
          />
        </label>
        <label className="grid gap-1 font-mono text-xs text-muted">
          Body
          <textarea
            className="min-h-24 border border-line bg-bg px-3 py-2 font-serif text-base text-fg"
            value={message.body}
            maxLength={2000}
            onChange={(event) => setMessage({ ...message, body: event.target.value })}
          />
        </label>
        <button type="submit" disabled={busy} className="min-h-11 justify-self-start bg-seal px-4 font-mono text-xs text-seal-ink disabled:opacity-40">
          Check and seal
        </button>
      </form>
      {stages && (
        <ol className="mt-4 grid gap-2">
          {stages.map((stage) => (
            <li key={stage.id} className="border border-line px-3 py-2">
              <p className={"font-mono text-xs " + tone(stage.state)}>
                {stage.id} · {stage.state} · {stage.owner}
              </p>
              <p className="text-sm text-fg">{stage.title}</p>
              <p className="text-xs text-muted">{stage.observed}</p>
            </li>
          ))}
        </ol>
      )}
      {note && <p className="mt-3 font-mono text-xs text-muted">{note}</p>}
      {inbox.length > 0 && (
        <ul className="mt-3 grid gap-1 font-mono text-xs text-muted">
          {inbox.map((row) => (
            <li key={`${row.cid}-${row.subject}`}>
              Admitted {row.subject} → {row.to} · {row.cid}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
