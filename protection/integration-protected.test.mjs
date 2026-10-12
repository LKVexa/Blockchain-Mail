import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { Store, restoreNew } from '../app/src/store.mjs';
import { serve, boundedControlLines } from '../app/src/main.mjs';
import { startHttp } from '../app/src/http.mjs';
import { startSmtp } from '../app/src/smtp.mjs';
import { parseMail } from '../app/src/mime.mjs';
import { deriveWordKey, VAULT_PREFIX } from '../app/src/vault.mjs';
import { deriveRecovery, deriveTransport, encodeFrame, decodeFrame, base64, unbase64 } from '../app/web/protected-wire.mjs';
import { protectExport, openExport } from '../app/web/protected-export.mjs';

// All words, keys, tokens, mail and directories in this suite are disposable fixtures.
const words = ['synthetic', 'fixture', 'private', 'adapter'];
const key = deriveWordKey(words);
const operator = 'postmaster@local.test', recipient = 'user@local.test';
const subject = 'Private synthetic subject ' + randomBytes(16).toString('hex');
const body = 'Private synthetic body ' + randomBytes(16).toString('hex');
const outerHeaders = { 'content-type': 'application/json', 'x-bve-request': '1' };

async function fixture(fn) {
  const directory = await fs.mkdtemp(path.join(import.meta.dirname, 'protected-test-'));
  const servers = [];
  async function launch(name = 'state') {
    const running = await serve({ root: path.join(directory, name), vaultKey: key, httpPort: 0, smtpPort: 0 });
    servers.push(running);
    assert.equal(running.protected, true);
    assert.equal(running.smtp, null, 'protected serve must not create an SMTP listener');
    return running;
  }
  try { await fn({ directory, launch }); }
  finally {
    for (const running of servers) await running.stop();
    const relative = path.relative(import.meta.dirname, path.resolve(directory));
    assert(relative.startsWith('protected-test-') && !relative.includes(path.sep) && !path.isAbsolute(relative));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function client(running, chosenKey = key, chosenRun = running.run_id) {
  const session = await deriveTransport(chosenKey, chosenRun), wire = [];
  const url = 'http://127.0.0.1:' + running.http.port;
  function input(method, endpoint, token, value) {
    return { method, path: endpoint, headers: token ? { authorization: 'Bearer ' + token, ...outerHeaders } : {}, body: method === 'GET' ? null : JSON.stringify(value ?? {}) };
  }
  async function post(frame) {
    const text = JSON.stringify(frame);
    const response = await fetch(url + '/api/protected', { method: 'POST', headers: outerHeaders, body: text, signal: AbortSignal.timeout(10000) });
    const responseText = await response.text();
    wire.push(text, responseText);
    return { status: response.status, frame: JSON.parse(responseText), response };
  }
  async function call(method, endpoint, token, value) {
    const request = await encodeFrame(session, 'request', input(method, endpoint, token, value));
    const response = await post(request);
    assert.equal(response.status, 200, 'outer protected response status for ' + endpoint);
    const result = await decodeFrame(session, 'response', response.frame, request);
    assert(Array.isArray(result.chunks) && result.chunks.length <= 16);
    const bytes = Buffer.concat(result.chunks.map(chunk => Buffer.from(unbase64(chunk, 500000))));
    assert(bytes.length <= 8000000);
    return { ...result, bytes, json: result.headers['content-type'] === 'application/json' ? JSON.parse(bytes.toString('utf8')) : null, request, responseFrame: response.frame };
  }
  return { session, wire, url, input, post, call };
}

function assertNoSecrets(bytes, secrets, where) {
  for (const secret of secrets) assert(!bytes.includes(Buffer.isBuffer(secret) ? secret : Buffer.from(secret)), 'plaintext fixture leaked into ' + where);
}
async function assertPrivateFiles(directory, secrets) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink(), 'synthetic fixture must not contain links');
    if (entry.isDirectory()) await assertPrivateFiles(file, secrets);
    else if (entry.isFile()) assertNoSecrets(await fs.readFile(file), secrets, path.relative(import.meta.dirname, file));
  }
}
function sendInput(attachment = null, suffix = '01') {
  return { to: [recipient], subject, body, attachments: attachment ? [{ name: 'fixture.bin', data: attachment.toString('base64') }] : [], max_cost: 20, request_id: 'protected-send-' + suffix };
}

test('PROTECTED-INTEGRATION-01 large mail, exact binary, proofs, restart and encrypted backup restore', async () => fixture(async ({ directory, launch }) => {
  assert.deepEqual(Buffer.from(await deriveRecovery(words)), key, 'browser and Node recovery adapter must agree');
  const running = await launch(), c = await client(running);
  const health = await (await fetch(c.url + '/health')).json();
  assert.deepEqual(Object.keys(health).sort(), ['ok', 'protected', 'protocol', 'runId', 'version']);
  assert.equal(health.runId, running.run_id);
  for (const endpoint of ['/', '/mail/']) {
    const page = await fetch(c.url + endpoint), html = await page.text();
    assert.equal(page.status, 200);
    assert(html.includes('<script src="/protected-bootstrap.js"></script>'), 'both shipped interfaces must load protected wrapping before their app scripts');
    assert.equal(page.headers.get('cache-control'), 'no-store');
  }
  const exportModule = await fetch(c.url + '/protected-export.mjs');
  assert.equal(exportModule.status, 200);
  assert.match(exportModule.headers.get('content-type'), /javascript/);
  const boot = await c.call('GET', '/api/bootstrap');
  assert.equal(boot.status, 200);
  assert.equal(boot.json.protection.smtp, false);
  assert.equal(boot.json.protection.ja21_engine, false);
  assert.equal(boot.json.protection.master_law, 'reference-only');
  const credentials = boot.json.credentials, attachment = randomBytes(512 * 1024);
  const result = await c.call('POST', '/api/send', credentials[operator], sendInput(attachment));
  assert.equal(result.status, 201);
  assert.equal(result.json.status, 'COMMITTED');
  const delivery = result.json.deliveries.find(d => d.mailbox === recipient && d.folder === 'INBOX');
  assert(delivery);
  const list = await c.call('GET', '/api/messages?folder=INBOX', credentials[recipient]);
  assert.equal(list.json.find(m => m.id === delivery.id).subject, subject);
  const mail = await c.call('GET', '/api/messages/' + delivery.id, credentials[recipient]);
  assert.equal(mail.json.body, body);
  const binary = await c.call('GET', '/api/messages/' + delivery.id + '/attachment/0', credentials[recipient]);
  assert.equal(binary.status, 200);
  assert.equal(binary.headers['content-type'], 'application/octet-stream');
  assert(binary.chunks.length > 1, '512 KiB response must span authenticated chunks');
  assert.deepEqual(binary.bytes, attachment);
  assert.match(binary.headers['Content-Disposition'], /fixture\.bin/);
  const eml = await c.call('GET', '/api/messages/' + delivery.id + '/eml', credentials[recipient]);
  assert.equal(eml.status, 200);
  const parsedEml = parseMail(eml.bytes.toString('utf8'));
  assert.equal(parsedEml.subject, subject, 'MIME export must decode its RFC 2047 subject losslessly');
  assert.equal(parsedEml.body, body);
  assert.deepEqual(Buffer.from(parsedEml.attachments[0].data, 'base64'), attachment);
  const proof = await c.call('GET', '/api/messages/' + delivery.id + '/proof', credentials[recipient]);
  assert.equal(proof.status, 200);
  assert.equal(proof.json.verified, true);
  assert.equal(proof.json.message_id, result.json.message_id);
  const ledger = await c.call('GET', '/api/ledger', credentials[recipient]);
  assert.equal(ledger.json.blocks.find(block => block.header.height === proof.json.height).hash, proof.json.block_hash);
  const exported = await c.call('GET', '/api/export', credentials[recipient]);
  assert.equal(exported.json.messages.find(m => m.id === delivery.id).subject, subject);
  assert.equal(exported.json.messages.find(m => m.id === delivery.id).attachments[0].data, attachment.toString('base64'));
  const rotation = await c.call('POST', '/api/rotate-token', credentials[operator], {});
  assert.equal(rotation.status, 200);
  const updated = rotation.json.token;
  assert.notEqual(updated, credentials[operator]);
  const secrets = [subject, body, ...Object.values(credentials), updated, key, key.toString('hex'), key.toString('base64'), ...words];
  assertNoSecrets(Buffer.from(c.wire.join('\n')), secrets, 'accepted protected wire');
  // Whole recovery words are common strings (e.g. "private"); state field names are not secrets.
  const stateSecrets = [subject, body, ...Object.values(credentials), updated, key, key.toString('hex'), key.toString('base64')];
  await assertPrivateFiles(path.join(directory, 'state'), stateSecrets);
  await running.stop();

  const restarted = await launch(), c2 = await client(restarted);
  assert.notEqual(restarted.run_id, running.run_id);
  const bootstrap2 = await c2.call('GET', '/api/bootstrap');
  assert.equal(bootstrap2.json.credentials[operator], updated, 'recovery must follow operator rotation atomically across restart');
  const oldAuth = await c2.call('GET', '/api/me', credentials[operator]);
  assert.equal(oldAuth.status, 401);
  const proof2 = await c2.call('GET', '/api/messages/' + delivery.id + '/proof', bootstrap2.json.credentials[recipient]);
  assert.deepEqual(proof2.json, proof.json, 'reopening must preserve the exact signed proof');
  assert.equal((await c2.post(proof.request)).status, 401, 'frames from the previous run cannot replay after restart');
  const backup = await c2.call('POST', '/api/admin/backup', updated, {});
  assert.equal(backup.status, 201);
  assert.equal(backup.json.protected, true);
  assert((await fs.readFile(path.join(backup.json.backup, 'manifest.json'), 'utf8')).startsWith(VAULT_PREFIX));
  const wrongRestore = path.join(directory, 'wrong-key-restore');
  assert.throws(() => restoreNew(backup.json.backup, wrongRestore, { vaultKey: Buffer.alloc(32, 7) }), { code: 'VAULT_AUTHENTICATION' });
  await assert.rejects(fs.stat(wrongRestore), { code: 'ENOENT' });
  const restoredDirectory = path.join(directory, 'restored');
  assert.equal(restoreNew(backup.json.backup, restoredDirectory, { vaultKey: key }).ok, true);
  const restored = await launch('restored'), c3 = await client(restored), boot3 = await c3.call('GET', '/api/bootstrap');
  assert.equal(boot3.json.credentials[operator], updated);
  assert.deepEqual((await c3.call('GET', '/api/messages/' + delivery.id + '/proof', boot3.json.credentials[recipient])).json, proof.json);
  assert.deepEqual((await c3.call('GET', '/api/messages/' + delivery.id + '/attachment/0', boot3.json.credentials[recipient])).bytes, attachment);
  const verify = await c3.call('POST', '/api/admin/verify', updated, { checkpoint: backup.json.checkpoint });
  assert.equal(verify.status, 200);
  assert.equal(verify.json.ok, true);
  assertNoSecrets(Buffer.from([...c2.wire, ...c3.wire].join('\n')), stateSecrets, 'restart/backup/restored protected wire');
  await assertPrivateFiles(directory, stateSecrets);
}));

// Independently re-encrypt with an existing nonce to exercise server nonce replay
// checks rather than merely corrupting an authenticated frame.
async function frameWithNonce(session, value, nonce) {
  const frame = { v: 1, runId: session.runId, id: randomBytes(16).toString('hex'), issued: Date.now(), nonce, data: '' };
  const aad = new TextEncoder().encode(['WORKSPACE/PROTECTED-API/v1', 'request', frame.runId, frame.id, String(frame.issued), frame.nonce].join('|'));
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: unbase64(nonce, 12), additionalData: aad, tagLength: 128 }, session.keys.request, new TextEncoder().encode(JSON.stringify(value)));
  frame.data = base64(new Uint8Array(bytes));
  return frame;
}

test('PROTECTED-INTEGRATION-02 plaintext APIs, wrong keys, frame tamper, replay and run substitution reject', async () => fixture(async ({ launch }) => {
  const running = await launch(), c = await client(running), credentials = running.store.credentials();
  const token = credentials[operator], before = running.store.checkpoint();
  for (const [endpoint, init] of [
    ['/api/me', { headers: { authorization: 'Bearer ' + token } }],
    ['/api/bootstrap', {}],
    ['/api/send', { method: 'POST', headers: { authorization: 'Bearer ' + token, ...outerHeaders }, body: JSON.stringify(sendInput()) }],
  ]) {
    const response = await fetch(c.url + endpoint, init);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'PROTECTED_REQUIRED');
  }
  const malformed = await c.post({});
  assert.equal(malformed.status, 401);
  const wrong = await client(running, Buffer.alloc(32, 3));
  assert.equal((await wrong.post(await encodeFrame(wrong.session, 'request', wrong.input('GET', '/api/bootstrap')))).status, 401);
  const good = await encodeFrame(c.session, 'request', c.input('GET', '/api/me', token));
  const tamper = { ...good, data: (good.data[0] === 'A' ? 'B' : 'A') + good.data.slice(1) };
  assert.equal((await c.post(tamper)).status, 401);
  const substituted = { ...good, runId: randomBytes(16).toString('hex') };
  assert.equal((await c.post(substituted)).status, 401);
  const other = await client(running, key, randomBytes(16).toString('hex'));
  assert.equal((await other.post(await encodeFrame(other.session, 'request', other.input('GET', '/api/me', token)))).status, 401);
  const stale = await encodeFrame(c.session, 'request', c.input('GET', '/api/me', token), { id: randomBytes(16).toString('hex'), issued: Date.now() - 121000 });
  assert.equal((await c.post(stale)).status, 401);
  const farFuture = await encodeFrame(c.session, 'request', c.input('GET', '/api/me', token), { id: randomBytes(16).toString('hex'), issued: Date.now() + 240000 });
  assert.equal((await c.post(farFuture)).status, 401);
  assert.deepEqual(running.store.checkpoint(), before, 'rejected attacks must not mutate signed state');
  const value = c.input('POST', '/api/send', token, sendInput(null, 'replay'));
  const request = await encodeFrame(c.session, 'request', value), response = await c.post(request);
  assert.equal(response.status, 200);
  assert.equal((await decodeFrame(c.session, 'response', response.frame, request)).status, 201);
  const after = running.store.checkpoint();
  assert.equal((await c.post(request)).status, 409);
  assert.equal((await c.post(await frameWithNonce(c.session, value, request.nonce))).status, 409);
  const repeatedId = await encodeFrame(c.session, 'request', value, request);
  assert.notEqual(repeatedId.nonce, request.nonce);
  assert.equal((await c.post(repeatedId)).status, 409);
  assert.deepEqual(running.store.checkpoint(), after, 'transport replay must not deliver or debit twice');
  await assert.rejects(decodeFrame(c.session, 'response', response.frame, good), /another request/);
  await assert.rejects(decodeFrame(c.session, 'request', response.frame));
  const denied = await c.call('POST', '/api/admin/credit', credentials[recipient], { address: recipient, amount: 1, request_id: 'unauthorized-credit-01' });
  assert.equal(denied.status, 403);
  assert.equal(denied.json.error, 'ROLE', 'valid encryption must not bypass bearer permissions');
}));

test('PROTECTED-INTEGRATION-03 malformed authenticated endpoints and oversized wire fail closed', async () => fixture(async ({ launch }) => {
  const running = await launch(), c = await client(running), token = running.store.credentials()[operator];
  const before = running.store.checkpoint();
  for (const endpoint of ['https://example.test/api/me', '//example.test/api/me', '/health', '/api/protected', '/api/me#fragment']) {
    const frame = await encodeFrame(c.session, 'request', c.input('GET', endpoint, token));
    assert.equal((await c.post(frame)).status, 400, 'invalid protected endpoint ' + endpoint);
  }
  for (const value of [
    { ...c.input('GET', '/api/me', token), headers: { authorization: 'Bearer ' + token, cookie: 'forbidden' } },
    { ...c.input('GET', '/api/me', token), body: '{}' },
    { ...c.input('GET', '/api/me', token), method: 'DELETE' },
    { ...c.input('GET', '/api/me', token), extra: true },
  ]) assert.equal((await c.post(await encodeFrame(c.session, 'request', value))).status, 400);
  const missing = await fetch(c.url + '/api/protected', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(missing.status, 415);
  const tooLarge = await fetch(c.url + '/api/protected', { method: 'POST', headers: outerHeaders, body: JSON.stringify({ data: 'a'.repeat(1700001) }), signal: AbortSignal.timeout(10000) });
  assert.equal(tooLarge.status, 413);
  await assert.rejects(encodeFrame(c.session, 'request', c.input('POST', '/api/send', token, { body: 'a'.repeat(1200000) })), /too large/);
  assert.deepEqual(running.store.checkpoint(), before);
  const missingInner = await c.call('GET', '/api/missing', token);
  assert.equal(missingInner.status, 404);
  assert.equal(missingInner.json.error, 'NOT_FOUND');
}));

test('PROTECTED-INTEGRATION-04 protected transport requires protected storage and the same external key', async () => fixture(async ({ directory }) => {
  const plaintext = new Store(path.join(directory, 'plaintext'));
  let unexpected;
  try {
    await assert.rejects(async () => { unexpected = await startHttp(plaintext, { port: 0, vaultKey: key, runId: randomBytes(16).toString('hex') }); }, { code: 'VAULT_CHANNEL_REQUIRED' });
  } finally { await unexpected?.close(); plaintext.close(); }
  const protectedStore = new Store(path.join(directory, 'protected'), { vaultKey: key });
  try {
    await assert.rejects(async () => { unexpected = await startHttp(protectedStore, { port: 0 }); }, { code: 'VAULT_CHANNEL_REQUIRED' });
    await assert.rejects(async () => { unexpected = await startHttp(protectedStore, { port: 0, vaultKey: Buffer.alloc(32, 9), runId: randomBytes(16).toString('hex') }); }, { code: 'VAULT_CHANNEL_KEY' });
    await assert.rejects(startSmtp(protectedStore, { port: 0 }), { code: 'VAULT_SMTP_DISABLED' });
  } finally { await unexpected?.close(); protectedStore.close(); }
}));

test('PROTECTED-INTEGRATION-05 actual CLI accepts recovery on stdin, publishes readiness and shuts down cleanly', async () => fixture(async ({ directory }) => {
  const root = path.join(directory, 'cli'), main = path.resolve(import.meta.dirname, '../app/src/main.mjs');
  const child = spawn(process.execPath, [main, 'serve-protected', '--state', root, '--http-port', '0', '--smtp-port', '0', '--key-stdin', '1'], { cwd: directory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', readyTimer, exitTimer, rejectReady;
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
  const ready = new Promise((resolve, reject) => {
    rejectReady = reject;
    readyTimer = setTimeout(() => reject(new Error('Protected CLI did not publish readiness')), 15000);
    child.stdout.on('data', bytes => {
      stdout += bytes.toString('utf8');
      if (stdout.length > 65536) { reject(new Error('CLI output exceeded test bound')); child.kill(); return; }
      for (const line of stdout.split(/\r?\n/)) { try { const value = JSON.parse(line); if (value.event === 'ready') { clearTimeout(readyTimer); resolve(value); } } catch {} }
    });
    child.stderr.on('data', bytes => { stderr += bytes.toString('utf8'); if (stderr.length > 65536) { reject(new Error('CLI diagnostics exceeded test bound')); child.kill(); } });
    child.once('error', reject);
  });
  void closed.then(result => { if (!stdout.includes('"event":"ready"')) rejectReady(new Error('Protected CLI exited before readiness: ' + result.code + '; ' + stderr)); }, rejectReady);
  child.stdin.on('error', () => {});
  try {
    child.stdin.write(JSON.stringify({ version: 1, recovery: words }) + '\n');
    const published = await ready;
    assert.equal(published.protected, true);
    assert.match(published.runId, /^[a-f0-9]{32}$/);
    assert.equal(published.pid, child.pid);
    const info = JSON.parse(await fs.readFile(path.join(root, 'listener.json'), 'utf8'));
    assert.equal(info.smtp, null);
    assert.equal(info.run_id, published.runId);
    const running = { http: { port: Number(new URL(published.http).port) }, run_id: published.runId }, c = await client(running);
    const health = await (await fetch(c.url + '/health')).json();
    assert.equal(health.runId, published.runId);
    const bootstrap = await c.call('GET', '/api/bootstrap');
    assert.equal(bootstrap.status, 200);
    const secrets = [...Object.values(bootstrap.json.credentials), ...words, key, key.toString('hex'), key.toString('base64')];
    assertNoSecrets(Buffer.from(stdout + stderr), secrets, 'CLI output');
    await assertPrivateFiles(root, secrets.filter(value => !words.includes(value)));
    child.stdin.write(JSON.stringify({ command: 'stop' }) + '\n');
    const result = await Promise.race([closed, new Promise((_, reject) => { exitTimer = setTimeout(() => reject(new Error('Protected CLI did not exit after stdin stop')), 15000); })]);
    assert.equal(result.code, 0);
    assert.equal(result.signal, null);
    await assert.rejects(fs.stat(path.join(root, 'server.lock')), { code: 'ENOENT' });
    await assert.rejects(fs.stat(path.join(root, 'listener.json')), { code: 'ENOENT' });
    assertNoSecrets(Buffer.from(stdout + stderr), secrets, 'CLI shutdown output');
  } finally {
    clearTimeout(readyTimer); clearTimeout(exitTimer);
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await closed;
  }
}));

test('PROTECTED-INTEGRATION-06 encrypted exports retain exact binary and private Unicode metadata across runs', async () => {
  const session = await deriveTransport(key, randomBytes(16).toString('hex'));
  const bytes = randomBytes(512 * 1024), before = Buffer.from(bytes), metadata = { name: '私的-π-😀.bin', type: 'application/octet-stream' };
  const file = await protectExport(session.master, bytes, metadata), file2 = await protectExport(session.master, bytes, metadata);
  assert.deepEqual(bytes, before, 'export must not change caller-owned bytes');
  assert.equal(file.format, 'WORKSPACE-EXPORT/1');
  assert.notEqual(file.salt, file2.salt);
  assert.notEqual(file.nonce, file2.nonce);
  assert.notEqual(file.data, file2.data);
  assertNoSecrets(Buffer.from(JSON.stringify(file)), [metadata.name, metadata.type, key, key.toString('hex'), key.toString('base64')], 'protected download');
  assert(!file.data.includes(bytes.toString('base64')), 'the payload must not merely be public base64');
  const result = await openExport(session.master, file);
  assert.equal(result.name, metadata.name);
  assert.equal(result.type, metadata.type);
  assert.deepEqual(Buffer.from(result.bytes), bytes);
  const newRun = await deriveTransport(key, randomBytes(16).toString('hex'));
  assert.deepEqual(Buffer.from((await openExport(newRun.master, file)).bytes), bytes, 'exports must remain portable after a server restart');
  const empty = await openExport(session.master, await protectExport(session.master, new Uint8Array(), { name: 'empty.bin', type: 'application/octet-stream' }));
  assert.equal(empty.bytes.length, 0);
  await assert.rejects(protectExport(session.master, new Uint8Array(16 * 1024 * 1024 + 1), metadata), /Invalid private export/);
});

async function independentlySealedExport(master, value, info = 'WORKSPACE-EXPORT/1/AES-256-GCM') {
  const salt = crypto.getRandomValues(new Uint8Array(32)), nonce = crypto.getRandomValues(new Uint8Array(12));
  const header = { format: 'WORKSPACE-EXPORT/1', salt: base64(salt), nonce: base64(nonce) };
  const exportKey = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) }, master, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: new TextEncoder().encode(JSON.stringify(header)), tagLength: 128 }, exportKey, new TextEncoder().encode(JSON.stringify(value)));
  return { ...header, data: base64(new Uint8Array(data)) };
}

test('PROTECTED-INTEGRATION-07 encrypted exports reject wrong keys, tamper, other contexts and unsafe authenticated metadata', async () => {
  const session = await deriveTransport(key, randomBytes(16).toString('hex'));
  const file = await protectExport(session.master, randomBytes(32), { name: 'private.bin', type: 'application/octet-stream' });
  const wrong = await deriveTransport(Buffer.alloc(32, 4), randomBytes(16).toString('hex'));
  await assert.rejects(openExport(wrong.master, file));
  for (const field of ['salt', 'nonce', 'data']) {
    const changed = { ...file, [field]: (file[field][0] === 'A' ? 'B' : 'A') + file[field].slice(1) };
    await assert.rejects(openExport(session.master, changed), 'tampered export field ' + field);
  }
  for (const changed of [{ ...file, format: 'WORKSPACE-EXPORT/2' }, { ...file, extra: 1 }, { ...file, data: file.data.slice(0, -4) }, { ...file, nonce: file.nonce + '=' }]) await assert.rejects(openExport(session.master, changed));
  await assert.rejects(openExport(session.master, await independentlySealedExport(session.master, { name: 'private.bin', type: 'application/octet-stream', data: 'Zg==' }, 'WORKSPACE/PROTECTED-API/v1/request')));
  for (const name of ['', '.', '..', '../private.bin', 'folder/private.bin', 'folder\\private.bin', 'private:stream.bin', 'private\u0000.bin', 'private.bin.', 'private.bin ', 'CON', 'nul.bin', 'COM1.txt', 'LPT9.bin', 'COM\u00b9.txt', 'COM\u00b2.txt', 'COM\u00b3.txt', 'LPT\u00b9.bin', 'LPT\u00b2.bin', 'LPT\u00b3.bin', 'CONIN$', 'CONOUT$.txt', '\ud800.bin']) {
    await assert.rejects(protectExport(session.master, new Uint8Array([1]), { name, type: 'application/octet-stream' }), 'invalid output name ' + JSON.stringify(name));
    const authenticated = await independentlySealedExport(session.master, { name, type: 'application/octet-stream', data: 'AQ==' });
    await assert.rejects(openExport(session.master, authenticated), 'authenticated invalid output name ' + JSON.stringify(name));
  }
  for (const value of [
    { name: 'private.bin', type: 'application/octet-stream', data: 'Zg===' },
    { name: 'private.bin', type: {}, data: 'AQ==' },
    { name: 'private.bin', type: 'x'.repeat(129), data: 'AQ==' },
    { name: 'private.bin', type: 'application/octet-stream', data: 'AQ==', extra: 1 },
  ]) await assert.rejects(openExport(session.master, await independentlySealedExport(session.master, value)));
});

test('PROTECTED-INTEGRATION-08 browser recovery mapping rejects Unicode folding and control input is bounded before newline', async () => {
  assert.deepEqual(Buffer.from(await deriveRecovery(words.map(word => ' ' + word.toUpperCase() + ' '))), key);
  for (const bad of [['Key', ...words.slice(1)], [null, ...words.slice(1)], ['ſynthetic', ...words.slice(1)], ['synthétic', ...words.slice(1)], ['a'.repeat(65), ...words.slice(1)]]) {
    await assert.rejects(deriveRecovery(bad));
    assert.throws(() => deriveWordKey(bad));
  }
  const exact = Readable.from([Buffer.alloc(4096, 0x61), Buffer.from('\n')]);
  const lines = [];
  for await (const line of boundedControlLines(exact)) lines.push(line);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].length, 4096);
  assert.equal(exact.destroyed, true);
  const unterminated = Readable.from([Buffer.alloc(2000, 0x61), Buffer.alloc(2000, 0x61), Buffer.alloc(97, 0x61)]);
  await assert.rejects(async () => { for await (const line of boundedControlLines(unterminated)) assert.fail('oversized line was yielded'); }, { code: 'KEY_INPUT' });
  assert.equal(unterminated.destroyed, true);
  const unicode = Buffer.from('π\nsecond\r\n', 'utf8'), fragmented = Readable.from([unicode.subarray(0, 1), unicode.subarray(1, 2), unicode.subarray(2)]), values = [];
  for await (const line of boundedControlLines(fragmented)) values.push(line);
  assert.deepEqual(values, ['π', 'second']);
  await assert.rejects(async () => { for await (const line of boundedControlLines(Readable.from([Buffer.from([0xff, 10])]))) assert.fail('invalid UTF-8 line was yielded'); });
});
