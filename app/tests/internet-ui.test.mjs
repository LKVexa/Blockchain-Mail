import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { SessionFence, SessionChangedError } from '../web/session.mjs';

const sender = { configured: true, enabled: true, role: 'operator', identity_address: 'postmaster@local.test', assigned_address: 'rmail@127.40.1.1', from: 'rmail@127.40.1.1', helo: '[127.40.1.1]', assignment: { owner: 'postmaster@local.test', address: 'rmail@127.40.1.1', created_height: 3 }, sender_warning: 'Receiving servers may reject your local sender.' };
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const event = { preventDefault() {} };

function harness(fetch, { initialSettings = sender } = {}) {
  const elements = new Map();
  const createElement = () => ({
    value: '', textContent: '', children: [], dataset: {}, checked: false, hidden: false, disabled: false, readOnly: false,
    classList: { toggle() {} }, append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; this.textContent = ''; },
    addEventListener() {}, focus() {}, showModal() { this.open = true; }, close() { this.open = false; }, reset() {}
  });
  function element(id) {
    if (!elements.has(id)) elements.set(id, createElement());
    return elements.get(id);
  }
  element('#compose-form').reset = () => { for (const id of ['#recipient', '#subject', '#message-body']) element(id).value = ''; };
  element('#config-form').reset = () => { element('#sender').value = ''; element('#helo').value = ''; element('#enabled').checked = false; };
  const confirmations = [];
  const context = vm.createContext({
    document: { querySelector: element, createElement }, window: {}, initializeTheme() {},
    crypto: { randomUUID }, SessionFence, SessionChangedError, AbortController, fetch,
    confirm: value => { confirmations.push(value); return true; }
  });
  const source = fs.readFileSync(new URL('../web/internet.mjs', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
  vm.runInContext(source, context, { filename: 'internet.mjs' });
  const run = code => vm.runInContext(code, context);
  if (initialSettings) run('access = "synthetic-operator-token"; renderSettings(' + JSON.stringify(initialSettings) + ', true);');
  return { element, run, confirmations };
}

async function review(h, subject = 'Original subject') {
  h.element('#recipient').value = 'recipient@example.org';
  h.element('#subject').value = subject;
  h.element('#message-body').value = 'Original message';
  await h.element('#compose-form').onsubmit(event);
  assert.equal(h.element('#confirm-send').open, true);
  assert.equal(h.element('#review-from').textContent, sender.from);
  assert.equal(h.element('#review-to').textContent, 'recipient@example.org');
}

test('INTERNET-UI-01 uncertain sends preserve identity and content, and checks replay the same request', async () => {
  const payloads = [];
  const h = harness(async (path, init) => {
    if (path === '/api/internet/send') {
      const payload = JSON.parse(init.body); payloads.push(payload);
      if (payloads.length === 1) throw Error('Connection lost after request');
      return response({ message: { ...payload, from: sender.from, status: 'ACCEPTED' }, replayed: true });
    }
    if (path === '/api/internet/status') return response(sender);
    if (path === '/api/internet/outbox') return response({ messages: [] });
    throw Error('Unexpected request ' + path);
  });
  await review(h);
  await h.element('#confirm-form').onsubmit(event);
  assert.match(h.element('#send-status').textContent, /Delivery uncertain — check recipient before sending again/);
  assert.equal(h.element('#recipient').readOnly, true);
  assert.equal(h.element('#sender').disabled, true);
  h.element('#subject').value = 'Accidental later change';
  h.run('updateControls()');
  assert.equal(h.element('#subject').value, 'Original subject');
  await h.element('#compose-form').onsubmit(event);
  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads[0], payloads[1]);
  assert.equal(payloads[0].confirmed_from, sender.from);
  assert.equal(payloads[0].confirmed_helo, sender.helo);
  assert.match(h.element('#send-status').textContent, /Recipient server accepted/);
  assert.match(h.element('#send-status').textContent, /does not prove inbox delivery/);
  assert.equal(h.element('#send').disabled, true);
  h.element('#new-message').onclick();
  assert.equal(h.element('#subject').readOnly, false);
  await review(h, 'Second explicit message');
  await h.element('#confirm-form').onsubmit(event);
  assert.notEqual(payloads[0].request_id, payloads[2].request_id);
});

test('INTERNET-UI-02 validation failure leaves an unchanged attempt and explicit new message unlocks edits', async () => {
  const h = harness(async () => response({ error: 'BAD_REQUEST', message: 'Invalid recipient.' }, 400));
  await review(h);
  await h.element('#confirm-form').onsubmit(event);
  assert.match(h.element('#send-status').textContent, /Invalid recipient/);
  assert.equal(h.element('#subject').readOnly, true);
  const originalID = h.run('activeAttempt.request_id');
  h.element('#new-message').onclick();
  assert.equal(h.run('activeAttempt'), null);
  assert.equal(h.element('#sender').disabled, false);
  assert.equal(h.element('#subject').readOnly, false);
  assert.equal(h.confirmations.length, 1);
  assert(originalID);
});

test('INTERNET-UI-03 logout aborts an active send and late results cannot restore private content', async () => {
  let resolveSend, signal;
  const pending = new Promise(resolve => { resolveSend = resolve; });
  const h = harness(async (path, init) => { assert.equal(path, '/api/internet/send'); signal = init.signal; return pending; });
  await review(h);
  const task = h.element('#confirm-form').onsubmit(event);
  h.element('#logout').onclick();
  assert.equal(signal.aborted, true);
  resolveSend(response({ message: { status: 'ACCEPTED' } }));
  await task;
  assert.equal(h.run('access'), '');
  assert.equal(h.run('activeAttempt'), null);
  assert.equal(h.element('#subject').value, '');
  assert.equal(h.element('#send-status').textContent, '');
  assert.equal(h.element('#shell').hidden, true);
});

test('INTERNET-UI-04 queued and unknown attempts require explicit confirmation before a new send identity', async () => {
  const h = harness(async path => path === '/api/internet/status' ? response(sender) : path === '/api/internet/outbox' ? response({ messages: [] }) : response({ message: { status: 'UNKNOWN' } }));
  await review(h);
  await h.element('#confirm-form').onsubmit(event);
  assert.match(h.element('#send-status').textContent, /Delivery uncertain/);
  h.element('#new-message').onclick();
  assert.equal(h.confirmations.length, 1);
  assert.match(h.confirmations[0], /could produce a duplicate/);
});

test('INTERNET-UI-05 send history renders untrusted message text without HTML interpretation', () => {
  const h = harness(async () => { throw Error('Unexpected request'); });
  h.run('renderOutbox({messages:[{subject:"<img src=x onerror=alert(1)>",from:"<b>sender</b>",to:"recipient@example.org",status:"UNKNOWN",detail:"<script>bad()</script>",created_at:"invalid"}]})');
  const row = h.element('#outbox').children[0];
  assert.equal(row.children[0].children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.match(row.children[2].textContent, /<script>bad\(\)<\/script>/);
  const source = fs.readFileSync(new URL('../web/internet.mjs', import.meta.url), 'utf8');
  assert(!/innerHTML|sessionStorage|document\.cookie|indexedDB/.test(source));
});

test('INTERNET-UI-06 changing sender settings excludes simultaneous send attempts', async () => {
  let resolveConfig;
  const pending = new Promise(resolve => { resolveConfig = resolve; });
  const paths = [];
  const h = harness(async path => { paths.push(path); return pending; });
  const task = h.element('#config-form').onsubmit(event);
  assert.equal(h.element('#send').disabled, true);
  await h.element('#compose-form').onsubmit(event);
  assert.equal(h.element('#confirm-send').open, undefined);
  assert.deepEqual(paths, ['/api/internet/config']);
  resolveConfig(response(sender));
  await task;
  assert.equal(h.element('#send').disabled, false);
});

test('INTERNET-UI-07 uncertain attempts retain their original sender after refresh, and a new message uses current settings', async () => {
  const changed = { ...sender, from: 'operator@example.org', helo: 'mail.example.org', sender_warning: '' };
  const h = harness(async path => path === '/api/internet/status' ? response(changed) : path === '/api/internet/outbox' ? response({ messages: [] }) : response({ message: { status: 'UNKNOWN' } }));
  await review(h);
  await h.element('#confirm-form').onsubmit(event);
  assert.equal(h.element('#sender').value, sender.from);
  assert.equal(h.element('#helo').value, sender.helo);
  assert.equal(h.run('activeAttempt.from'), sender.from);
  h.element('#new-message').onclick();
  assert.equal(h.element('#sender').value, changed.from);
  assert.equal(h.element('#helo').value, changed.helo);
  h.element('#recipient').value = 'recipient@example.org'; h.element('#subject').value = 'New subject'; h.element('#message-body').value = 'New message';
  await h.element('#compose-form').onsubmit(event);
  assert.equal(h.element('#review-from').textContent, changed.from);
});

test('INTERNET-UI-08 every mailbox can log in and must reserve its sender before composing', async () => {
  for (const account of [
    { address: 'postmaster@local.test', role: 'operator' },
    { address: 'alice@local.test', role: 'user' },
    { address: 'gameowner@127.37.20.4', role: 'user' }
  ]) {
    const paths = [];
    const personal = { ...sender, role: account.role, identity_address: account.address,
      assigned_address: account.address.startsWith('gameowner@') ? account.address : sender.assigned_address };
    personal.from = personal.assigned_address;
    personal.helo = '[' + personal.from.split('@')[1] + ']';
    const h = harness(async (path, init) => {
      paths.push(path);
      if (path === '/api/me') return response(account);
      if (path === '/api/internet/login') {
        assert.equal(init.method, 'POST');
        assert.deepEqual(JSON.parse(init.body), {});
        assert.equal(h.element('#shell').hidden, true);
        return response(personal);
      }
      if (path === '/api/internet/status') return response(personal);
      if (path === '/api/internet/outbox') return response({ messages: [] });
      throw Error('Unexpected request ' + path);
    }, { initialSettings: null });
    h.element('#shell').hidden = true;
    h.element('#token').value = 'synthetic-mailbox-token';
    await h.element('#login-form').onsubmit(event);
    assert.deepEqual(paths.slice(0, 2), ['/api/me', '/api/internet/login']);
    assert.equal(h.element('#shell').hidden, false, account.address);
    assert.equal(h.element('#assigned-address').value, personal.assigned_address);
    assert.equal(h.element('#assignment-status').textContent, 'Reserved in this workspace’s signed ledger');
    assert.equal(h.element('#sender').value, personal.assigned_address);
    assert.equal(h.element('#sender').readOnly, account.role !== 'operator');
    assert.equal(h.element('#send').disabled, false);
    assert.equal(h.element('#token').value, '');
    assert.equal(h.element('#identity').textContent, account.address + ' · ' + account.role);
    await h.element('#refresh').onclick();
    assert.equal(paths.filter(path => path === '/api/internet/login').length, 1, 'Refreshing must not reserve another address');
  }
});

test('INTERNET-UI-09 allocation failure keeps compose hidden and clears the connection', async () => {
  const paths = [];
  const h = harness(async path => {
    paths.push(path);
    return path === '/api/me' ? response({ address: 'alice@local.test', role: 'user' })
      : response({ error: 'REGISTRY_FULL', message: 'No available rmail addresses.' }, 409);
  }, { initialSettings: null });
  h.element('#shell').hidden = true;
  h.element('#token').value = 'synthetic-mailbox-token';
  await h.element('#login-form').onsubmit(event);
  assert.deepEqual(paths, ['/api/me', '/api/internet/login']);
  assert.match(h.element('#login-status').textContent, /No available rmail addresses/);
  assert.equal(h.element('#shell').hidden, true);
  assert.equal(h.element('#assigned-address').value, '');
  assert.equal(h.run('access'), '');
  assert.equal(h.element('#send').disabled, true);
});

test('INTERNET-UI-10 signing out clears the assigned address and switching mailbox renders only its own history', async () => {
  const first = { ...sender, role: 'user', identity_address: 'alice@local.test' };
  const second = { ...sender, role: 'user', identity_address: 'bob@local.test', assigned_address: 'rmail@127.40.1.2', from: 'rmail@127.40.1.2', helo: '[127.40.1.2]' };
  let current = first;
  const h = harness(async path => {
    if (path === '/api/me') return response({ address: current.identity_address, role: current.role });
    if (path === '/api/internet/login' || path === '/api/internet/status') return response(current);
    if (path === '/api/internet/outbox') return response({ messages: current === first
      ? [{ subject: 'Alice’s private history', from: current.from, to: 'recipient@example.org', status: 'ACCEPTED' }] : [] });
    throw Error('Unexpected request ' + path);
  }, { initialSettings: null });
  h.element('#token').value = 'synthetic-alice-token';
  await h.element('#login-form').onsubmit(event);
  assert.equal(h.element('#outbox').children[0].children[0].children[0].textContent, 'Alice’s private history');
  h.element('#logout').onclick();
  assert.equal(h.element('#assigned-address').value, '');
  assert.equal(h.element('#assignment-status').textContent, '');
  assert.deepEqual(h.element('#outbox').children, []);
  assert.equal(h.element('#sender').value, '');
  current = second;
  h.element('#token').value = 'synthetic-bob-token';
  await h.element('#login-form').onsubmit(event);
  assert.equal(h.element('#assigned-address').value, second.assigned_address);
  assert.equal(h.element('#sender').value, second.from);
  assert.equal(h.element('#outbox-count').textContent, '0 messages');
  assert.equal(h.element('#outbox').children[0].textContent, 'Your Internet sends will appear here.');
});

test('INTERNET-UI-11 a normal mailbox always saves its assigned sender and brackets a blank numeric HELO', async () => {
  let payload;
  const personal = { ...sender, role: 'user' };
  const h = harness(async (path, init) => {
    assert.equal(path, '/api/internet/config');
    payload = JSON.parse(init.body);
    return response(personal);
  }, { initialSettings: personal });
  h.element('#sender').value = 'different@127.40.1.99';
  h.element('#helo').value = '';
  await h.element('#config-form').onsubmit(event);
  assert.deepEqual(payload, { enabled: true, from: personal.assigned_address, helo: '[127.40.1.1]' });
  assert.equal(h.element('#sender').value, personal.assigned_address);
});
