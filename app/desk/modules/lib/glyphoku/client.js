/** In-memory browser authority; stale or aborted sessions cannot publish results. */
export class DeskSession {
    fetcher;
    token = '';
    generation = 0;
    pending = new Set();
    constructor(fetcher = (...args) => fetch(...args)) {
        this.fetcher = fetcher;
    }
    open(token) { this.close(); this.token = token; }
    close() { this.generation++; this.token = ''; for (const c of this.pending)
        c.abort(); this.pending.clear(); }
    cancelAndClose(ref) { const token = this.token; if (token && ref) {
        try {
            void this.fetcher('/api/glyphoku/control', { method: 'POST', keepalive: true, credentials: 'omit', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'X-BVE-Request': '1' }, body: JSON.stringify({ ...ref, action: 'stop' }) }).catch(() => { });
        }
        catch { }
    } this.close(); }
    get active() { return !!this.token; }
    async request(path, body) {
        if (!this.token)
            throw new Error('AUTH: Sign in to the local operator account.');
        const epoch = this.generation, c = new AbortController();
        this.pending.add(c);
        const timer = setTimeout(() => c.abort(), 15000);
        try {
            const response = await this.fetcher(path, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', credentials: 'omit', signal: c.signal, headers: { Authorization: 'Bearer ' + this.token, ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-BVE-Request': '1' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
            const value = await response.json();
            if (epoch !== this.generation)
                throw new Error('STALE_SESSION: Response belongs to an ended session.');
            if (c.signal.aborted)
                throw new DOMException('Request was cancelled or timed out.', 'AbortError');
            if (!response.ok)
                throw new Error(`${value.error ?? 'HTTP_' + response.status}: ${value.message ?? 'Request failed'}`);
            return value;
        }
        finally {
            clearTimeout(timer);
            this.pending.delete(c);
        }
    }
}
/** Recheck observation at callback time: a queued paint may outlive its run or viewport. */
export function canAcknowledgeFrame({ epoch, generation, active, hidden, visible, inflight, live, status, frame, renderedFrameId }) {
    return epoch === generation && active && !hidden && visible && !inflight && !!live && !!frame && typeof frame.id === 'string' && typeof frame.digest === 'string' && status?.run_id === live.run_id && status?.frame?.id === frame.id && status?.frame?.digest === frame.digest && renderedFrameId === frame.id;
}
export const THEME_KEY = 'workspace-theme';
export function savedTheme(storage) { try {
    const value = storage?.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
}
catch {
    return null;
} }
export function preferredTheme(storage, darkSystem = false) { return savedTheme(storage) ?? (darkSystem ? 'dark' : 'light'); }
export function persistTheme(storage, theme) { try {
    if (!storage || (theme !== 'light' && theme !== 'dark'))
        return false;
    storage.setItem(THEME_KEY, theme);
    return true;
}
catch {
    return false;
} }
/** One keyboard tab stop for the read-only board, with conventional row navigation. */
export function adjacentCell(index, key, wholeBoard = false) {
    if (!Number.isInteger(index) || index < 0 || index > 255)
        return null;
    if (key === 'ArrowUp')
        return index < 16 ? index : index - 16;
    if (key === 'ArrowDown')
        return index >= 240 ? index : index + 16;
    if (key === 'ArrowLeft')
        return index % 16 === 0 ? index : index - 1;
    if (key === 'ArrowRight')
        return index % 16 === 15 ? index : index + 1;
    if (key === 'Home')
        return wholeBoard ? 0 : index - index % 16;
    if (key === 'End')
        return wholeBoard ? 255 : index - index % 16 + 15;
    return null;
}
export async function downloadJson(name, value) { if (window.workspaceDownload)
    return window.workspaceDownload(JSON.stringify(value, null, 2), name, 'application/json'); const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
