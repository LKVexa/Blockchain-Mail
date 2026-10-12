import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { SessionFence, SessionChangedError } from '../web/session.mjs';

// Execute the product's exact native readiness probe against its Internet UI.
// The small DOM model only renders the supplied static HTML. No WebView, vault,
// local server, network request, credential or email delivery is involved.
const bridge = fs.readFileSync(new URL('../../console/host/LiveWebBridge.cs', import.meta.url), 'utf8');
const expression = /const string rendered = "([^"\r\n]+)";/.exec(bridge)?.[1];
assert.ok(expression, 'Native readiness expression must exist');
const probe = new vm.Script(expression, { filename: 'actual-console-readiness-expression.js' });
const internetHtml = fs.readFileSync(new URL('../web/internet.html', import.meta.url), 'utf8');
const internetModule = fs.readFileSync(new URL('../web/internet.mjs', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
const voidTags = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR']);

function element(name = 'div', attributes = {}) {
  const node = {
    nodeType: 1, nodeName: name.toUpperCase(), attributes, parentElement: null, childNodes: [],
    hidden: Object.hasOwn(attributes, 'hidden'), value: attributes.value || '', checked: Object.hasOwn(attributes, 'checked'),
    disabled: Object.hasOwn(attributes, 'disabled'), dataset: {}, visibility: 'visible', displayed: true,
    className: attributes.class || '',
    append(...children) { for (const child of children) { child.parentElement = this; this.childNodes.push(child); } },
    replaceChildren(...children) { this.childNodes = []; this.append(...children); },
    closest() { for (let current = this; current; current = current.parentElement) if (current.hidden || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(current.nodeName)) return current; return null; },
    getClientRects() { for (let current = this; current; current = current.parentElement) if (current.hidden || !current.displayed) return []; return [{}]; },
    addEventListener() {}, focus() {}, showModal() { this.open = true; }, close() { this.open = false; }, reset() {}
  };
  node.classList = { contains: value => node.className.split(/\s+/).includes(value), toggle() {} };
  Object.defineProperties(node, {
    firstElementChild: { get() { return this.childNodes.find(child => child.nodeType === 1) || null; } },
    textContent: { get() { return this.childNodes.map(child => child.nodeType === 3 ? child.nodeValue : child.textContent).join(''); }, set(value) { this.replaceChildren({ nodeType: 3, nodeValue: String(value), parentElement: this }); } }
  });
  return node;
}

function parseHtml(html) {
  const root = element(), ids = new Map(), stack = [root];
  for (const token of html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || []) {
    if (/^<!/.test(token)) continue;
    if (/^<\//.test(token)) { if (stack.length > 1) stack.pop(); continue; }
    if (token.startsWith('<')) {
      const tag = /^<([\w-]+)/.exec(token)?.[1];
      if (!tag) continue;
      const attributes = {};
      for (const match of token.slice(tag.length + 1, -1).matchAll(/([\w-]+)(?:\s*=\s*"([^"]*)")?/g)) attributes[match[1]] = match[2] ?? '';
      const node = element(tag, attributes);
      stack.at(-1).append(node);
      if (attributes.id) ids.set(attributes.id, node);
      if (!voidTags.has(node.nodeName)) stack.push(node);
    } else stack.at(-1).append({ nodeType: 3, nodeValue: token, parentElement: stack.at(-1) });
  }
  return { root, ids };
}

function harness({ route = '/internet/', html = internetHtml, installInternet = true } = {}) {
  const { root, ids } = parseHtml(html), requests = [];
  const descendants = surface => surface.childNodes.flatMap(node => [node, ...(node.nodeType === 1 ? descendants(node) : [])]);
  const document = {
    readyState: 'complete', body: root, getElementById: id => ids.get(id) || null,
    querySelector: selector => { const node = ids.get(selector.slice(1)); assert.ok(node, 'Actual HTML must contain ' + selector); return node; },
    createElement: name => element(name),
    createTreeWalker: (surface, filter) => { assert.equal(filter, 0xFFFFFFFF); const nodes = descendants(surface); let index = 0; return { nextNode: () => nodes[index++] || null }; }
  };
  const sender = { configured: true, enabled: true, from: 'rmail@127.40.1.1', helo: '[127.40.1.1]', assigned_address: 'rmail@127.40.1.1', role: 'user', identity_address: 'synthetic-mailbox@local.test' };
  const context = vm.createContext({
    document, window: { workspaceAccess: () => new Promise(() => {}) }, location: { pathname: route },
    NodeFilter: { SHOW_ALL: 0xFFFFFFFF }, getComputedStyle: node => {
      for (let current = node; current; current = current.parentElement) if (current.visibility === 'hidden') return { visibility: 'hidden' };
      return { visibility: 'visible' };
    },
    initializeTheme() {}, SessionFence, SessionChangedError, AbortController,
    fetch: async path => {
      requests.push(path);
      const body = path === '/api/me' ? { role: 'user', address: 'synthetic-mailbox@local.test' }
        : path === '/api/internet/login' || path === '/api/internet/status' ? sender : path === '/api/internet/outbox' ? { messages: [] } : null;
      assert.notEqual(body, null, 'Unexpected synthetic API request');
      return { ok: true, json: async () => body };
    }
  });
  if (installInternet) vm.runInContext(internetModule, context, { filename: 'actual-internet.mjs' });
  return { document, context, requests, get: id => ids.get(id), ready: () => probe.runInContext(context, { timeout: 1000 }) };
}

test('CONSOLE-READINESS-01 actual Internet login mounts and is available before unlock', () => {
  assert.match(internetHtml, /<script type="module" src="\/internet\.mjs"><\/script>/);
  const h = harness();
  assert.equal(h.get('login').hidden, false);
  assert.equal(h.get('shell').hidden, true);
  assert.equal(typeof h.get('login-form').onsubmit, 'function');
  assert.equal(h.ready(), true);
  assert.deepEqual(h.requests, []);
});

test('CONSOLE-READINESS-02 actual Internet login transition keeps the visible authenticated shell ready', async () => {
  const h = harness();
  h.get('token').value = 'synthetic-access-token';
  await h.get('login-form').onsubmit({ preventDefault() {} });
  assert.equal(h.get('login').hidden, true);
  assert.equal(h.get('shell').hidden, false);
  assert.equal(h.ready(), true);
  assert.deepEqual(h.requests.sort(), ['/api/internet/login', '/api/internet/outbox', '/api/internet/status', '/api/me']);
  assert.equal(h.get('assigned-address').value, 'rmail@127.40.1.1');
});

test('CONSOLE-READINESS-03 static Internet HTML and failed module initialization remain unavailable', () => {
  const h = harness({ installInternet: false });
  assert.equal(h.ready(), false);
  h.get('login-form').onsubmit = 'untrusted-handler-text';
  assert.equal(h.ready(), false);
});

test('CONSOLE-READINESS-04 hidden, CSS-hidden and empty Internet surfaces remain unavailable', () => {
  const bothHidden = harness(); bothHidden.get('login').hidden = true;
  assert.equal(bothHidden.ready(), false);
  const displayHidden = harness(); displayHidden.get('login').displayed = false;
  assert.equal(displayHidden.ready(), false);
  const visibilityHidden = harness(); visibilityHidden.get('login').visibility = 'hidden';
  assert.equal(visibilityHidden.ready(), false);
  const empty = harness(); empty.get('login').replaceChildren();
  assert.equal(empty.ready(), false);
});

test('CONSOLE-READINESS-05 Internet needs protected bootstrap and completed document', () => {
  const h = harness(); h.context.window.workspaceAccess = undefined;
  assert.equal(h.ready(), false);
  h.context.window.workspaceAccess = () => new Promise(() => {});
  h.document.readyState = 'loading';
  assert.equal(h.ready(), false);
  h.document.readyState = 'complete'; h.document.body = null;
  assert.equal(h.ready(), false);
});

test('CONSOLE-READINESS-06 unknown routes cannot masquerade as a mounted Internet page', () => {
  for (const route of ['/health', '/api/internet/status', '/internet.html', '/unrelated/']) assert.equal(harness({ route }).ready(), false, route);
});

test('CONSOLE-READINESS-07 existing desk and mailbox readiness contracts remain supported', () => {
  for (const route of ['/', '/desk/index.html']) {
    const h = harness({ route, html: '<div id="root"><main class="desk-shell"><h1>Workspace</h1></main></div>', installInternet: false });
    assert.equal(h.ready(), true, route);
    h.get('root').firstElementChild.className = 'placeholder';
    assert.equal(h.ready(), false, route);
  }
  const mailboxHtml = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const h = harness({ route: '/mail/', html: mailboxHtml, installInternet: false });
  assert.equal(h.ready(), false);
  h.get('login-form').onsubmit = () => {};
  assert.equal(h.ready(), true);
  h.get('login').hidden = true; h.get('shell').hidden = false;
  assert.equal(h.ready(), true);
  h.get('shell').hidden = true;
  assert.equal(h.ready(), false);
});
