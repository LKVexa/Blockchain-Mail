import React, { useState, useEffect, useLayoutEffect, useRef } from '../../../vendor/react-runtime.js';
import { freezeDraft, normalizeLabel } from '../../lib/glyphoku/registry.js';
import { glyphText, glyphKind } from '../../lib/glyphoku/glyphs.js';
import { eventPolicy, boxOf } from '../../lib/glyphoku/rules.js';
import { DeskSession, downloadJson, canAcknowledgeFrame, preferredTheme, savedTheme, persistTheme, adjacentCell } from '../../lib/glyphoku/client.js';
const STORAGE_KEY = 'glyphoku-local-127';
const ID = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
const EMPTY = Array(256).fill(0);
function themeStorage() { try {
    return window.localStorage;
}
catch {
    return undefined;
} }
const phaseNames = { 'IDLE': 'Ready', 'PREPARING': 'Preparing board', 'INITIAL_FRAME': 'Ready to begin', 'LIVE SOLVING': 'Checking board', 'FINAL_FRAME': 'Checking result', 'COMMIT_READY': 'Saving result', 'COMMITTED': 'Completed', 'FAILED': 'Needs attention', 'CANCELLED': 'Stopped' };
/** Same candidate desk/root component, connected to the single local SQL authority. */
export function GlyphokuStudio() {
    const [login, setLogin] = useState(''), [connected, setConnected] = useState(false), [state, setState] = useState(null), [run, setRun] = useState(null), [notice, setNotice] = useState('Connect to create a mailbox and prepare a local message.'), [error, setError] = useState(''), [busy, setBusy] = useState(false), [theme, setTheme] = useState(() => preferredTheme(themeStorage(), window.matchMedia('(prefers-color-scheme: dark)').matches));
    useEffect(() => { let live = true; if (window.workspaceAccess)
        void window.workspaceAccess().then((token) => { if (live)
            setLogin(token); }); return () => { live = false; }; }, []);
    const [label, setLabel] = useState('workspace'), [to, setTo] = useState(''), [bcc, setBcc] = useState(''), [subject, setSubject] = useState('Local note'), [body, setBody] = useState('Hello from my local workspace.'), [frozen, setFrozen] = useState(null), [speed, setSpeed] = useState(24), [board, setBoard] = useState(EMPTY), [kind, setKind] = useState([]), [selected, setSelected] = useState(null), [events, setEvents] = useState([]), [milestones, setMilestones] = useState([]), [mail, setMail] = useState([]), [verify, setVerify] = useState(null), [legacy, setLegacy] = useState(null), [legacyUnavailable, setLegacyUnavailable] = useState(false), [online, setOnline] = useState(true);
    const explicitTheme = useRef(savedTheme(themeStorage()) !== null);
    function toggleTheme() { const next = theme === 'dark' ? 'light' : 'dark'; explicitTheme.current = true; setTheme(next); document.documentElement.dataset.theme = next; persistTheme(themeStorage(), next); }
    useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
    useEffect(() => { const media = window.matchMedia('(prefers-color-scheme: dark)'), update = (event) => { if (event.key !== null && event.key !== 'workspace-theme')
        return; explicitTheme.current = !!savedTheme(themeStorage()); setTheme(preferredTheme(themeStorage(), media.matches)); }, onSystem = () => { if (!explicitTheme.current)
        setTheme(media.matches ? 'dark' : 'light'); }; media.addEventListener('change', onSystem); window.addEventListener('storage', update); return () => { media.removeEventListener('change', onSystem); window.removeEventListener('storage', update); }; }, []);
    const session = useRef(new DeskSession()), live = useRef(null), status = useRef(null), stateRef = useRef(null), generation = useRef(0), inflight = useRef(0), speedRef = useRef(24), mounted = useRef(true), commitFlight = useRef(false), seenFrame = useRef(''), boardNode = useRef(null), visible = useRef(false), inViewport = useRef(false), pausedIntent = useRef(false), needsPoll = useRef(false);
    const instance = state?.instance, permit = instance?.permits?.[0], owner = instance?.mailboxes?.[0]?.address ?? '', active = !!run && !['COMMITTED', 'FAILED', 'CANCELLED'].includes(run.phase);
    function safeError(e) { if (mounted.current && !String(e).includes('STALE_SESSION') && !String(e).includes('AbortError')) {
        setError(String(e.message ?? e));
        setNotice('Something needs attention. Refresh your workspace before retrying.');
    } }
    function apply(p) { if (!mounted.current)
        return; const previous = status.current?.phase; if (p.phase !== previous && p.phase === 'LIVE SOLVING')
        setNotice('Checking the board. Keep it visible; you can pause or stop at any time.'); if (p.phase !== previous && p.phase === 'FAILED')
        setNotice('The check stopped. Refresh your workspace to confirm the saved result.'); status.current = p; setRun(p); if (p.frame && p.frame.id !== seenFrame.current) {
        seenFrame.current = p.frame.id;
        setBoard(p.frame.board);
        setKind(p.frame.kind);
        setEvents(x => [...x, ...p.frame.events].slice(-18));
        if (p.frame.initial)
            setMilestones(x => [...x, `Board ${p.index + 1}: starting cells shown`]);
        if (p.frame.terminal)
            setMilestones(x => [...x, `Board ${p.index + 1}: completed; checking result`]);
    } }
    async function refresh() { const v = await session.current.request('/api/glyphoku/state'); if (!mounted.current)
        return; stateRef.current = v; setState(v); const own = v.instance.mailboxes[0]?.address; if (own)
        setTo(x => x || own); return v; }
    async function guarded(fn) { setBusy(true); setError(''); try {
        await fn();
    }
    catch (e) {
        safeError(e);
    }
    finally {
        if (mounted.current)
            setBusy(false);
    } }
    async function signIn() { await guarded(async () => { session.current.open(login.trim()); const account = await session.current.request('/api/login', {}); const v = await refresh(); setLogin(''); setConnected(true); if (v.instance.mailboxes.length)
        await refreshMail(); setNotice(v.active ? 'A previous check is still active. Stop it below before starting again.' : 'Connected as ' + account.assigned_address + '. Your Internet email address is reserved in the ledger.'); }); }
    function disconnect() { generation.current++; const ref = live.current; session.current.cancelAndClose(ref); live.current = null; status.current = null; stateRef.current = null; setConnected(false); setState(null); setRun(null); setBoard(EMPTY); setKind([]); setFrozen(null); setMail([]); setEvents([]); setMilestones([]); setVerify(null); setError(''); setNotice('Signed out. Connect again to check any saved work.'); }
    async function runRequest(name, extra = {}) { const ref = live.current; if (!ref)
        return; const epoch = generation.current; inflight.current++; try {
        const p = await session.current.request('/api/glyphoku/' + name, { ...ref, ...extra });
        if (epoch === generation.current) {
            apply(p);
            if (name === 'poll')
                needsPoll.current = false;
        }
        return p;
    }
    catch (e) {
        if (epoch === generation.current) {
            needsPoll.current = true;
            pausedIntent.current = true;
        }
        throw e;
    }
    finally {
        inflight.current--;
    } }
    async function start(action) {
        await guarded(async () => {
            const v = stateRef.current;
            if (!v)
                throw Error('AUTH');
            const normalized = normalizeLabel(label);
            if (action === 'domain' && !normalized.ok)
                throw Error(normalized.reason);
            if (action === 'envelope' && !frozen)
                throw Error('Freeze the exact message first.');
            generation.current++;
            const epoch = generation.current;
            setMilestones([]);
            setEvents([]);
            setBoard(EMPTY);
            seenFrame.current = '';
            pausedIntent.current = false;
            const h = await session.current.request('/api/glyphoku/start', { action, intent: action === 'domain' ? { label: normalized.ok ? normalized.label : label } : { draft: frozen }, instance_id: v.instance_id, expected_revision: v.revision, operation_id: ID() });
            if (epoch !== generation.current)
                return;
            if (h.phase === 'COMMITTED') {
                await refresh();
                return;
            }
            live.current = { run_id: h.run_id, observer_key: h.observer_key };
            boardNode.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            apply({ ...h, total: action === 'domain' ? 1 : 2, index: 0, paused: false, counts: { events: 0, guesses: 0, retractions: 0, rendered: 0 } });
            setNotice('Preparing the board. This can take a moment.');
        });
    }
    function freeze() { if (!instance)
        return; const f = freezeDraft({ from: owner, to, bcc, subject, body }, instance); if (!f.ok) {
        setError(f.reason);
        return;
    } setFrozen(f.draft); setError(''); setNotice('Draft saved for preparation. You can edit it before starting the check.'); }
    async function control(action) { if (!live.current)
        return; generation.current++; needsPoll.current = false; pausedIntent.current = action !== 'resume'; await guarded(async () => { await runRequest('control', { action }); if (action === 'stop') {
        setNotice('Check stopped. Previously saved work remains available.');
        await refresh();
    } }); }
    async function step() { if (inflight.current || !live.current)
        return; await guarded(async () => { pausedIntent.current = true; await runRequest('advance', { count: 1, single_step: true }); }); }
    async function finish() { if (commitFlight.current || !live.current || status.current?.phase !== 'COMMIT_READY' || status.current.paused || pausedIntent.current)
        return; commitFlight.current = true; const ref = live.current, op = status.current.operation_id, epoch = generation.current; try {
        const result = await session.current.request('/api/glyphoku/commit', { ...ref, operation_id: op });
        if (epoch !== generation.current)
            return;
        apply({ ...status.current, phase: 'COMMITTED', result });
        await refresh();
        setNotice(status.current.action === 'domain' ? 'Your mailbox is ready. Write a message in step 2.' : 'Message prepared, not sent. Review it and choose Send locally.');
    }
    catch (e) {
        if (epoch === generation.current && session.current.active) {
            safeError(e);
            const p = status.current;
            if (p)
                apply({ ...p, phase: 'FAILED', note: 'COMMIT_UNCERTAIN' });
        }
    }
    finally {
        commitFlight.current = false;
    } }
    async function refreshMail() { const data = await session.current.request('/api/glyphoku/mail'); if (mounted.current)
        setMail(data.messages); }
    async function send() { await guarded(async () => { const v = stateRef.current, p = v.instance.permits[0]; if (!p)
        throw Error('Prepare your message first.'); const answer = await session.current.request('/api/glyphoku/send', { permit_id: p.id, draft: p.draft, instance_id: v.instance_id, expected_revision: v.revision, operation_id: ID() }); await refresh(); await refreshMail(); setNotice(answer.replayed ? 'Previous delivery recovered. No duplicate message was sent.' : 'Message delivered to your local mailbox. Open Inbox at the top of this page to read it.'); }); }
    async function exportTrace(id) { await guarded(async () => { const value = await session.current.request('/api/glyphoku/trace?id=' + encodeURIComponent(id)); if (session.current.active && mounted.current)
        await downloadJson('glyphoku-' + id + '.json', value); }); }
    useEffect(() => {
        mounted.current = true;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw !== null)
                setLegacy(raw);
        }
        catch {
            setLegacyUnavailable(true);
        }
        const onVisibility = () => { visible.current = inViewport.current && !document.hidden; if (document.hidden) {
            pausedIntent.current = true;
            if (live.current)
                void control('hidden');
        } };
        document.addEventListener('visibilitychange', onVisibility);
        const onOffline = () => { setOnline(false); pausedIntent.current = true; if (live.current)
            void control('pause'); };
        const onOnline = () => setOnline(true);
        window.addEventListener('offline', onOffline);
        window.addEventListener('online', onOnline);
        return () => { mounted.current = false; generation.current++; session.current.cancelAndClose(live.current); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline); };
    }, []);
    useEffect(() => { speedRef.current = speed; }, [speed]);
    useEffect(() => { const heartbeat = setInterval(() => { const p = status.current; if (session.current.active && live.current && p && !['COMMITTED', 'FAILED', 'CANCELLED'].includes(p.phase) && !inflight.current)
        void runRequest('poll').catch(safeError); }, 10000); return () => clearInterval(heartbeat); }, []);
    useEffect(() => { inViewport.current = false; visible.current = false; if (!boardNode.current)
        return; const observer = new IntersectionObserver(entries => { const yes = entries[0]?.intersectionRatio >= 0.8; inViewport.current = yes; visible.current = yes && !document.hidden; if (!yes && live.current && status.current?.phase === 'LIVE SOLVING' && !status.current.paused) {
        pausedIntent.current = true;
        void control('pause');
    } }, { threshold: [0, 0.8, 1] }); observer.observe(boardNode.current); return () => { inViewport.current = false; visible.current = false; observer.disconnect(); }; }, [connected]);
    function acknowledgeFrame(frame, epoch) { if (canAcknowledgeFrame({ frame, epoch, generation: generation.current, active: session.current.active && mounted.current, hidden: document.hidden, visible: visible.current, inflight: inflight.current, live: live.current, status: status.current, renderedFrameId: boardNode.current?.dataset.frameId }))
        void runRequest('ack', { frame_id: frame.id, digest: frame.digest }).catch(safeError); }
    // The frame is already in React's committed DOM. Two animation frames precede acknowledgment.
    useLayoutEffect(() => { const f = run?.frame; if (!f || !connected)
        return; const epoch = generation.current; let cancelled = false, r1 = 0, r2 = 0; const acknowledge = () => { if (!cancelled)
        acknowledgeFrame(f, epoch); }; r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(acknowledge); }); return () => { cancelled = true; cancelAnimationFrame(r1); cancelAnimationFrame(r2); }; }, [run?.frame?.id, connected]);
    useEffect(() => {
        const interval = setInterval(() => {
            if (!session.current.active || !live.current || inflight.current || commitFlight.current || document.hidden)
                return;
            const p = status.current;
            if (!p || ['COMMITTED', 'FAILED', 'CANCELLED'].includes(p.phase))
                return;
            if (needsPoll.current) {
                void runRequest('poll').catch(safeError);
                return;
            }
            if (p.phase === 'COMMIT_READY') {
                if (visible.current)
                    void finish();
                return;
            }
            if (p.frame) {
                if (visible.current) {
                    const epoch = generation.current;
                    requestAnimationFrame(() => requestAnimationFrame(() => acknowledgeFrame(p.frame, epoch)));
                }
                return;
            }
            if (p.phase === 'LIVE SOLVING' && !p.paused && !pausedIntent.current && visible.current)
                void runRequest('advance', { count: speedRef.current, single_step: false }).catch(safeError);
            else if (p.phase === 'PREPARING')
                void runRequest('poll').catch(safeError);
        }, 100);
        return () => clearInterval(interval);
    }, []);
    let candidates = [];
    if (selected !== null && board[selected] === 0) {
        const r = selected >> 4, c = selected % 16, b = boxOf(selected), used = new Set(board.filter((v, i) => (i >> 4) === r || i % 16 === c || boxOf(i) === b));
        candidates = Array.from({ length: 16 }, (_, i) => i + 1).filter(v => !used.has(v));
    }
    const cap = run?.g && run.g <= 2 ? eventPolicy(run.g).cap : 0, phase = run?.phase ?? 'IDLE';
    const currentStep = !owner ? 1 : !frozen && !permit ? 2 : !permit ? 3 : 4;
    const completed = [!!owner, !!frozen || !!permit, !!permit, permit?.state === 'DELIVERED_LOCAL'];
    const displayedDraft = permit?.draft ?? frozen;
    function navigateBoard(event, index) { const next = adjacentCell(index, event.key, event.ctrlKey || event.metaKey); if (next === null)
        return; event.preventDefault(); setSelected(next); boardNode.current?.querySelectorAll('[role="gridcell"]')[next]?.focus({ preventScroll: true }); }
    return React.createElement("main", { className: "desk-shell" },
        React.createElement("header", { className: "masthead" },
            React.createElement("div", null,
                React.createElement("p", { className: "eyebrow" }, "Local workspace"),
                React.createElement("h1", null, "Workspace"),
                React.createElement("p", { className: "muted" }, "Create a mailbox. Prepare a message. Send it locally.")),
            React.createElement("div", { className: "header-actions" },
                React.createElement("button", { type: "button", className: "theme-toggle quiet", "data-testid": "theme-toggle", "aria-label": `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`, "aria-pressed": theme === 'dark', onClick: toggleTheme },
                    React.createElement("span", { "aria-hidden": "true" }, theme === 'dark' ? '◐' : '○'),
                    theme === 'dark' ? 'Light theme' : 'Dark theme'),
                connected && React.createElement("a", { href: "#inbox", "data-testid": "inbox-link" }, "Inbox"),
                React.createElement("a", { href: "/mail/", "data-testid": "mail-ledger-link" }, "Mail & ledger"), React.createElement("a", { href: "/internet/", "data-testid": "internet-mail-link" }, "Internet email"))),
        !connected ? React.createElement("section", { className: "login-panel panel" },
            React.createElement("span", { className: "tag" }, "On this computer"),
            React.createElement("h2", null, "Open your workspace"),
            React.createElement("p", null, "Use your local access key to connect. Your key stays in this page while you are signed in."),
            React.createElement("form", { onSubmit: e => { e.preventDefault(); void signIn(); } },
                React.createElement("label", null,
                    "Access key",
                    React.createElement("input", { "data-testid": "operator-token", type: "password", autoComplete: "off", spellCheck: false, value: login, onChange: e => setLogin(e.target.value), "aria-describedby": "access-help" })),
                React.createElement("p", { id: "access-help", className: "muted" }, "Paste the access key created when you set up this workspace."),
                React.createElement("button", { "data-testid": "connect", disabled: busy || !login.trim() }, busy ? 'Connecting…' : 'Connect')),
            React.createElement("details", { className: "setup-details" },
                React.createElement("summary", null, "Where do I find my access key?"),
                window.workspaceAccess ? React.createElement("p", null, "Unlock with your four recovery words. Your operator access key is supplied to this page in memory. Keep the recovery words separately from the workspace.") : React.createElement("p", null,
                    "Start the local service, then open ",
                    React.createElement("code", null, "state/credentials.secret.json"),
                    ". Use the key for ",
                    React.createElement("code", null, "postmaster@local.test"),
                    ". Keep this file private."),
                React.createElement("p", null, "This workspace sends messages between mailboxes on this computer.")),
            React.createElement("div", { className: "login-steps" },
                React.createElement("span", null, "1 \u00B7 Mailbox"),
                React.createElement("span", null, "2 \u00B7 Draft"),
                React.createElement("span", null, "3 \u00B7 Prepare"),
                React.createElement("span", null, "4 \u00B7 Send"))) : React.createElement(React.Fragment, null,
            React.createElement("div", { className: "session-strip" },
                React.createElement("span", { className: "connection-status" },
                    React.createElement("i", { "aria-hidden": "true" }),
                    "Connected locally"),
                React.createElement("span", null,
                    "Saved changes ",
                    React.createElement("b", { "data-testid": "revision" }, state?.revision)),
                React.createElement("span", { className: "visually-hidden", "data-testid": "ordinal" },
                    "g = ",
                    instance?.g),
                React.createElement("div", { className: "session-actions" },
                    React.createElement("button", { className: "quiet", onClick: () => void guarded(async () => { await refresh(); if (owner)
                            await refreshMail(); }) }, "Refresh workspace"),
                    React.createElement("button", { className: "quiet", onClick: disconnect }, "Sign out"))),
            React.createElement("ol", { className: "step-nav", "aria-label": "Message workflow" }, ['Mailbox', 'Draft', 'Prepare', 'Send'].map((name, i) => React.createElement("li", { key: name, className: completed[i] ? 'is-complete' : currentStep === i + 1 ? 'is-current' : '', "aria-current": currentStep === i + 1 && !completed[i] ? 'step' : undefined },
                React.createElement("span", { "aria-hidden": "true" }, completed[i] ? '✓' : i + 1),
                React.createElement("b", null, name),
                React.createElement("small", null, completed[i] ? 'Done' : currentStep === i + 1 ? 'Current step' : 'Next')))),
            state?.active && !live.current && React.createElement("section", { className: "warning" },
                "A previous check is still active. Stop it before starting again. ",
                React.createElement("button", { className: "quiet", onClick: () => void guarded(async () => { await session.current.request('/api/glyphoku/abandon', {}); await refresh(); setNotice('Previous check stopped. You can continue.'); }) }, "Stop previous check")),
            React.createElement("div", { className: "workspace" },
                React.createElement("section", { className: "board-panel panel" },
                    React.createElement("div", { className: "section-heading" },
                        React.createElement("div", null,
                            React.createElement("p", { className: "eyebrow" }, "Verification board"),
                            React.createElement("h2", { "data-testid": "phase", "data-phase": phase }, phaseNames[phase] ?? 'Checking')),
                        React.createElement("span", { className: "tag" }, active ? 'In progress' : 'Local check')),
                    React.createElement("div", { className: "board-caption" },
                        React.createElement("span", null, run ? `Board ${run.index + 1} of ${run.total ?? 0}` : 'Your check will appear here'),
                        React.createElement("span", null, run?.paused || pausedIntent.current ? 'Paused' : active ? 'Keep board visible' : '16 × 16')),
                    React.createElement("div", { ref: boardNode, className: "board", role: "grid", "aria-label": "Verification board", "aria-readonly": true, "aria-rowcount": 16, "aria-colcount": 16, "aria-describedby": "board-help", "data-testid": "board", "data-frame-id": run?.frame?.id ?? seenFrame.current, "data-event-seq": run?.counts?.events ?? 0 }, Array.from({ length: 16 }, (_, row) => React.createElement("div", { className: "board-row", role: "row", key: row }, board.slice(row * 16, row * 16 + 16).map((value, column) => { const i = row * 16 + column; return React.createElement("button", { key: i, type: "button", role: "gridcell", "aria-rowindex": row + 1, "aria-colindex": column + 1, "aria-selected": selected === i, tabIndex: (selected ?? 0) === i ? 0 : -1, title: `Row ${row + 1}, column ${column + 1}: ${glyphText(16, value) || 'empty'}; ${kind[i] ?? 'empty'}`, "aria-label": `Row ${row + 1} column ${column + 1} ${glyphText(16, value) || 'empty'}`, onClick: () => setSelected(i), onFocus: () => setSelected(i), onKeyDown: e => navigateBoard(e, i), className: `cell ${glyphKind(glyphText(16, value))} ${kind[i] ?? ''} ${column % 4 === 3 && column !== 15 ? 'box-right' : ''} ${row % 4 === 3 && row < 15 ? 'box-bottom' : ''} ${column === 15 ? 'last-column' : ''} ${row === 15 ? 'last-row' : ''} ${selected === i ? 'selected' : ''}` }, glyphText(16, value)); })))),
                    React.createElement("div", { className: "legend" },
                        React.createElement("span", null, "Bold: starting cell"),
                        React.createElement("span", { className: "legend-guess" }, "Underlined: trial value")),
                    React.createElement("p", { className: "candidate-line", id: "board-help" }, selected === null ? 'Select a cell, or use the arrow keys, to inspect the board.' : `Row ${(selected >> 4) + 1}, column ${selected % 16 + 1} · ${board[selected] ? 'filled' : candidates.map(v => glyphText(16, v)).join(' ') || 'no available values'}`),
                    React.createElement("div", { className: "controls" },
                        React.createElement("label", null,
                            "Check speed",
                            React.createElement("select", { "aria-label": "Check speed", value: speed, onChange: e => setSpeed(Number(e.target.value)) }, [1, 8, 24, 40].map(n => React.createElement("option", { key: n, value: n }, { 1: "Slow", 8: "Normal", 24: "Fast", 40: "Very fast" }[n])))),
                        React.createElement("button", { "data-testid": "pause", className: "quiet", disabled: !active || run?.paused, onClick: () => void control('pause') }, "Pause"),
                        React.createElement("button", { "data-testid": "resume", className: "quiet", disabled: !active || (!run?.paused && !pausedIntent.current), onClick: () => void control('resume') }, "Resume"),
                        React.createElement("button", { "data-testid": "step", className: "quiet", disabled: !active || !run?.paused || !!run?.frame || phase !== 'LIVE SOLVING', onClick: () => void step() }, "One step"),
                        React.createElement("button", { "data-testid": "stop", className: "danger", disabled: !active, onClick: () => void control('stop') }, "Stop")),
                    React.createElement("p", { className: "muted" }, "The check pauses when you leave the tab or move the board out of view."),
                    React.createElement("details", null,
                        React.createElement("summary", null, "Check details"),
                        React.createElement("div", { className: "metrics" },
                            React.createElement("div", null,
                                React.createElement("strong", { "data-testid": "events-count" }, run?.counts?.events ?? 0),
                                React.createElement("span", null,
                                    "Steps / ",
                                    cap || '—')),
                            React.createElement("div", null,
                                React.createElement("strong", { "data-testid": "guess-count" }, run?.counts?.guesses ?? 0),
                                React.createElement("span", null, "Trial values")),
                            React.createElement("div", null,
                                React.createElement("strong", { "data-testid": "retract-count" }, run?.counts?.retractions ?? 0),
                                React.createElement("span", null, "Undo steps")),
                            React.createElement("div", null,
                                React.createElement("strong", null, run?.counts?.rendered ?? 0),
                                React.createElement("span", null, "Displayed frames"))),
                        React.createElement("p", { className: "muted" },
                            "Preparation ",
                            run?.preparation_ms ?? '—',
                            " ms \u00B7 checking ",
                            Math.round(run?.active_ms ?? 0),
                            " ms \u00B7 paused ",
                            Math.round(run?.paused_ms ?? 0),
                            " ms \u00B7 total ",
                            Math.round(run?.elapsed_ms ?? 0),
                            " ms."))),
                React.createElement("aside", { className: "journeys", "aria-label": "Workspace steps" },
                    React.createElement("section", { className: "panel" },
                        React.createElement("p", { className: "eyebrow" }, "Step 1"),
                        React.createElement("h2", null, "Create a mailbox"),
                        owner ? React.createElement(React.Fragment, null,
                            React.createElement("span", { className: "success-label" }, "Mailbox ready"),
                            React.createElement("div", { className: "address", "data-testid": "owner-address" }, owner),
                            React.createElement("p", { className: "muted" }, "This workspace has one mailbox. Use it to send a message to yourself.")) : React.createElement(React.Fragment, null,
                            React.createElement("p", null, "Choose a name. One board check creates your local mailbox."),
                            React.createElement("label", null,
                                "Mailbox name",
                                React.createElement("input", { value: label, onChange: e => setLabel(e.target.value), disabled: active || busy, maxLength: 24, spellCheck: false })),
                            React.createElement("button", { "data-testid": "create-domain", disabled: active || busy || instance?.g !== 1, onClick: () => void start('domain') }, active ? 'Checking…' : 'Create mailbox'))),
                    React.createElement("section", { className: "panel" },
                        React.createElement("p", { className: "eyebrow" }, "Step 2"),
                        React.createElement("h2", null, "Write your message"),
                        permit ? React.createElement(React.Fragment, null,
                            React.createElement("dl", { className: "draft-summary" },
                                React.createElement("dt", null, "From"),
                                React.createElement("dd", null, permit.draft.from),
                                React.createElement("dt", null, "To"),
                                React.createElement("dd", null, permit.draft.to.join(', ')),
                                React.createElement("dt", null, "Private copy"),
                                React.createElement("dd", null, permit.draft.bcc.join(', ') || 'None'),
                                React.createElement("dt", null, "Subject"),
                                React.createElement("dd", null, permit.draft.subject)),
                            React.createElement("pre", { className: "body-preview" }, permit.draft.body)) : React.createElement(React.Fragment, null,
                            React.createElement("fieldset", { disabled: !owner || active || busy || !!frozen },
                                React.createElement("label", null,
                                    "To",
                                    React.createElement("input", { value: to, onChange: e => setTo(e.target.value), spellCheck: false })),
                                React.createElement("label", null,
                                    "Private copy (Bcc)",
                                    React.createElement("input", { value: bcc, onChange: e => setBcc(e.target.value), spellCheck: false })),
                                React.createElement("label", null,
                                    "Subject",
                                    React.createElement("input", { value: subject, onChange: e => setSubject(e.target.value), maxLength: 120 })),
                                React.createElement("label", null,
                                    "Message",
                                    React.createElement("textarea", { "aria-label": "Message", rows: 4, value: body, onChange: e => setBody(e.target.value), maxLength: 4000 }))),
                            frozen ? React.createElement(React.Fragment, null,
                                React.createElement("span", { className: "success-label" }, "Draft saved for preparation"),
                                React.createElement("button", { className: "quiet", disabled: active || busy, onClick: () => setFrozen(null) }, "Edit draft")) : React.createElement("button", { "data-testid": "freeze", disabled: !owner || busy || active, onClick: freeze }, "Save draft for preparation")),
                        displayedDraft && React.createElement("details", null,
                            React.createElement("summary", null, "Message fingerprint"),
                            React.createElement("div", { className: "digest" },
                                React.createElement("code", null, displayedDraft.digest)),
                            React.createElement("p", { className: "muted" }, "Preparation is bound to this exact message."))),
                    React.createElement("section", { className: "panel" },
                        React.createElement("p", { className: "eyebrow" }, "Step 3"),
                        React.createElement("h2", null, "Prepare the message"),
                        React.createElement("p", null, permit ? 'Preparation is complete. Review your message before sending.' : 'Two board checks prepare your saved draft. This step does not send it.'),
                        !permit && frozen && React.createElement("button", { "data-testid": "create-envelope", disabled: active || busy || instance?.g !== 2, onClick: () => void start('envelope') }, "Prepare message"),
                        !permit && !frozen && React.createElement("p", { className: "muted" }, "Save your draft in step 2 to continue."),
                        permit && React.createElement("span", { className: "success-label" }, "Preparation complete")),
                    React.createElement("section", { className: "panel" },
                        React.createElement("p", { className: "eyebrow" }, "Step 4"),
                        React.createElement("h2", null, "Send locally"),
                        permit ? React.createElement(React.Fragment, null,
                            React.createElement("div", { className: 'permit-state ' + (permit.state === 'READY' ? 'ready' : 'delivered'), "data-testid": "permit-status" }, permit.state === 'READY' ? 'Prepared, not sent' : 'Delivered locally'),
                            React.createElement("button", { "data-testid": "send-locally", disabled: busy, onClick: () => void send() }, permit.state === 'READY' ? 'Send locally' : 'Recover delivery receipt'),
                            React.createElement("p", { className: "horizon", "data-testid": "horizon" }, "This setup supports one prepared message. Reading your mailbox and recovering the receipt remain available.")) : React.createElement("p", { className: "muted" }, "Your prepared message will be ready to send here.")))),
            React.createElement("section", { className: "feedback panel", "aria-live": "polite" },
                React.createElement("p", { className: "eyebrow" }, "Status"),
                React.createElement("p", { "data-testid": "notice" }, notice),
                run?.note && React.createElement("details", null,
                    React.createElement("summary", null, "Check information"),
                    React.createElement("code", null, run.note)),
                !online && React.createElement("p", { className: "warning" }, "You are offline. The check is paused; sending will not retry automatically.")),
            React.createElement("div", { className: "evidence-row" },
                React.createElement("section", { className: "panel", id: "inbox", "aria-label": "Inbox", tabIndex: -1 },
                    React.createElement("div", { className: "section-heading" },
                        React.createElement("h2", null, "Your inbox"),
                        React.createElement("button", { className: "quiet", disabled: !owner || busy, onClick: () => void guarded(refreshMail) }, "Refresh inbox")),
                    React.createElement("div", { "data-testid": "inbox" }, mail.some(m => m.folder === 'INBOX') ? mail.filter(m => m.folder === 'INBOX').map(m => React.createElement("article", { className: "message", key: m.id },
                        React.createElement("span", { className: "tag" }, m.folder === 'INBOX' ? 'Inbox' : m.folder === 'Sent' ? 'Sent' : m.folder),
                        React.createElement("h3", null, m.subject),
                        React.createElement("p", { className: "muted" },
                            m.from,
                            " \u2192 ",
                            m.to.join(', ')),
                        React.createElement("pre", null, m.body),
                        React.createElement("details", null,
                            React.createElement("summary", null, "Message identifier"),
                            React.createElement("code", null, m.message_id)))) : React.createElement("p", { className: "empty-state" }, "Your inbox is empty. A prepared message appears here only after you send it."))),
                React.createElement("section", { className: "panel" },
                    React.createElement("div", { className: "section-heading" },
                        React.createElement("h2", null, "Saved activity"),
                        React.createElement("button", { className: "quiet", onClick: () => void guarded(async () => setVerify(await session.current.request('/api/admin/verify', {}))) }, "Check saved data")),
                    verify && React.createElement("pre", { className: "verify-result", "data-testid": "verification" }, JSON.stringify(verify, null, 2)),
                    milestones.length > 0 && React.createElement("ol", null, milestones.map((m, i) => React.createElement("li", { key: i }, m))),
                    state?.operations?.map((op) => React.createElement("div", { className: "receipt", key: op.id },
                        React.createElement("b", null, op.kind === 'domain' ? 'Mailbox created' : op.kind === 'envelope' ? 'Message prepared' : 'Message delivered'),
                        React.createElement("button", { className: "quiet", onClick: () => void exportTrace(op.id) }, "Export receipt"))),
                    React.createElement("details", null,
                        React.createElement("summary", null, "Recent check steps"),
                        React.createElement("pre", { className: "event-log" }, events.map(e => `${e.seq} ${e.type} ${e.cell === null ? '' : `r${(e.cell >> 4) + 1}c${e.cell % 16 + 1} ${glyphText(16, e.oldValue) || '·'}→${glyphText(16, e.newValue) || '·'}`} ${e.rule}`).join('\n'))),
                    state?.local127_registry && React.createElement("details", { "data-testid": "local127-register" },
                        React.createElement("summary", null, "Local 127 address register"),
                        React.createElement("p", { className: "muted" }, "These addresses are reserved by this workspace's signed ledger. They identify local mailboxes; the service opens at 127.0.0.1."),
                        React.createElement("p", { className: "muted" },
                            "Service: ",
                            React.createElement("code", null, state.local127_registry.service.host)),
                        state.local127_registry.claims.length ? React.createElement("ul", null, state.local127_registry.claims.map((claim) => React.createElement("li", { key: claim.address },
                            React.createElement("code", null, claim.address),
                            " \u00B7 ",
                            claim.kind,
                            " \u00B7 block ",
                            claim.created_height))) : React.createElement("p", { className: "muted" }, "No mailbox addresses have been reserved yet."),
                        state.local127_registry.reconciliation_required && React.createElement(React.Fragment, null,
                            React.createElement("p", { className: "warning" }, "Earlier local addresses are in use. The next local address operation records their reservations in a new signed block."),
                            React.createElement("ul", null, state.local127_registry.unreconciled_claims.map((claim) => React.createElement("li", { key: claim.address },
                                React.createElement("code", null, claim.address),
                                " \u00B7 ",
                                claim.kind,
                                " \u00B7 awaiting registration"))),
                            state.local127_registry.reconciliation_conflicts.length > 0 && React.createElement("p", { className: "warning" }, "Existing addresses conflict with another mailbox or the service reservation. New allocation is blocked until these records are resolved."))),
                    React.createElement("details", null,
                        React.createElement("summary", null, "Workspace identifiers"),
                        React.createElement("p", { className: "muted" },
                            "Instance ",
                            React.createElement("code", null, state?.instance_id),
                            " \u00B7 saved block ",
                            state?.head?.header?.height))))),
        error && React.createElement("section", { className: "error", role: "alert", "data-testid": "error" }, error),
        legacyUnavailable && React.createElement("section", { className: "warning" }, "Browser storage is unavailable. Any older saved data has been left unchanged."),
        legacy !== null && React.createElement("section", { className: "warning" },
            React.createElement("b", null, "Older browser data found."),
            " It has been preserved and is not imported into this workspace. ",
            React.createElement("button", { className: "quiet", onClick: () => void guarded(async () => { await downloadJson('preserved-browser-data.json', { storageKey: STORAGE_KEY, raw: legacy, status: 'UNASSESSED_NOT_IMPORTED' }); }) }, "Export original data")),
        React.createElement("footer", null,
            React.createElement("p", null, "Messages stay on this computer. Your access key stays in memory while you are signed in."),
            React.createElement("details", null,
                React.createElement("summary", null, "Storage and verification details"),
                React.createElement("p", null, "Storage encryption uses a server-held key; it is not end-to-end encryption. Saved records are signed by the local service. Displayed-frame acknowledgments show the client protocol was followed; they do not prove human attention."))));
}
