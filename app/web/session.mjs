/** Page-memory session invalidation; not a browser storage or identity provider. */
export class SessionChangedError extends Error {
  constructor() { super('Session changed; obsolete operation discarded'); this.code = 'SESSION_CHANGED'; }
}
export class SessionFence {
  #epoch = 0;
  #pending = new Set();
  get epoch() { return this.#epoch; }
  invalidate() {
    this.#epoch++;
    for (const controller of this.#pending) controller.abort();
    this.#pending.clear();
  }
  begin() {
    const epoch = this.#epoch, controller = new AbortController();
    this.#pending.add(controller);
    return {
      signal: controller.signal,
      check: () => { if (epoch !== this.#epoch) throw new SessionChangedError(); },
      finish: () => this.#pending.delete(controller)
    };
  }
}
