import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ARCHIVE_FORMAT, protectArchive, openArchive, protectArchiveFile, openArchiveFile } from './archive.mjs';

const key = Buffer.alloc(32, 0x75);
// A valid empty ZIP with a binary comment exercises opaque, lossless ZIP-byte handling.
function fixtureZip() {
  const comment = Buffer.concat([Buffer.from('synthetic-private-manifest-fixture\n'), ...Array.from({ length: 64 }, () => Buffer.from(Array.from({ length: 256 }, (_, i) => i)))]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([end, comment]);
}
async function fixture(fn) {
  const directory = await mkdtemp(path.join(import.meta.dirname, 'archive-test-'));
  try {
    await fn(directory);
  } finally {
    const relative = path.relative(import.meta.dirname, path.resolve(directory));
    assert(relative.startsWith('archive-test-') && !relative.includes(path.sep) && !path.isAbsolute(relative));
    await rm(directory, { recursive: true, force: true });
  }
}

test('ARCHIVE-01 complete ZIP and encrypted manifest survive a lossless round trip', () => {
  const zip = fixtureZip(), before = Buffer.from(zip), keyBefore = Buffer.from(key);
  const archive = protectArchive(zip, key), result = openArchive(archive, key);
  assert.deepEqual(result.bytes, zip);
  assert.deepEqual(zip, before);
  assert.deepEqual(key, keyBefore);
  assert.equal(result.manifest.size, zip.length);
  assert.equal(result.manifest.sha256, createHash('sha256').update(zip).digest('hex'));
  assert.equal(result.manifest.version, 1);
  assert(!archive.includes(Buffer.from('synthetic-private-manifest-fixture')));
  assert(!archive.includes(Buffer.from(result.manifest.sha256)));
  assert(!archive.includes(Buffer.from('zip-bytes')));
  assert(!archive.equals(protectArchive(zip, key)), 'fresh salt/nonce must change repeated protection');
});

test('ARCHIVE-02 wrong key, header/cipher/tag changes, truncation and extra data reject', () => {
  const archive = protectArchive(fixtureZip(), key);
  assert.throws(() => openArchive(archive, Buffer.alloc(32, 0x76)), { code: 'ARCHIVE_AUTH' });
  for (const offset of [0, 8, 9, 10, 12, 20, 51, 52, 63, 64, 100, archive.length - 1]) {
    const changed = Buffer.from(archive); changed[offset] ^= 1;
    assert.throws(() => openArchive(changed, key), 'tamper offset ' + offset);
  }
  for (const bytes of [archive.subarray(0, 63), archive.subarray(0, archive.length - 1), Buffer.concat([archive, Buffer.from([0])])]) {
    assert.throws(() => openArchive(bytes, key), { code: 'ARCHIVE_FORMAT' });
  }
  const reordered = Buffer.from(archive), a = Buffer.from(reordered.subarray(128, 256));
  reordered.copy(reordered, 128, 256, 384); a.copy(reordered, 256);
  assert.throws(() => openArchive(reordered, key), { code: 'ARCHIVE_AUTH' });
});

test('ARCHIVE-03 keys and attacker-controlled length are bounded before decryption', () => {
  for (const bad of [undefined, 'secret', new Uint8Array(32), Buffer.alloc(31), Buffer.alloc(33)]) {
    assert.throws(() => protectArchive(fixtureZip(), bad), { code: 'ARCHIVE_KEY' });
    assert.throws(() => openArchive(Buffer.alloc(0), bad), { code: 'ARCHIVE_KEY' });
  }
  const archive = protectArchive(fixtureZip(), key);
  archive.writeBigUInt64BE(0xffffffffffffffffn, 12);
  assert.throws(() => openArchive(archive, key), { code: 'ARCHIVE_FORMAT' });
});

// Build an independently authenticated malformed inner manifest with the public v1 layout.
// This tests inner format integrity, not just rejection of an invalid GCM tag.
function forgedManifestArchive(manifest, payload) {
  const text = Buffer.from(JSON.stringify(manifest)), body = Buffer.alloc(4 + text.length + payload.length);
  body.writeUInt32BE(text.length); text.copy(body, 4); payload.copy(body, 4 + text.length);
  const header = Buffer.alloc(64); Buffer.from('WSPACEAR').copy(header); header[8] = 1; header[9] = 1;
  header.writeBigUInt64BE(BigInt(body.length), 12); randomBytes(32).copy(header, 20); randomBytes(12).copy(header, 52);
  const derived = Buffer.from(hkdfSync('sha256', key, header.subarray(20, 52), Buffer.from('workspace-portable-archive/v1/aes-256-gcm/zip'), 32));
  try {
    const cipher = createCipheriv('aes-256-gcm', derived, header.subarray(52)); cipher.setAAD(header);
    return Buffer.concat([header, cipher.update(body), cipher.final(), cipher.getAuthTag()]);
  } finally { derived.fill(0); body.fill(0); }
}
test('ARCHIVE-04 authenticated manifests still require exact schema, size and digest', () => {
  const zip = fixtureZip(), valid = openArchive(protectArchive(zip, key), key).manifest;
  for (const manifest of [{ ...valid, size: zip.length + 1 }, { ...valid, sha256: '0'.repeat(64) }, { ...valid, path: '../file' }, { ...valid, payload: 'extract-files' }, { ...valid, version: 2 }]) {
    assert.throws(() => openArchive(forgedManifestArchive(manifest, zip), key), { code: 'ARCHIVE_FORMAT' });
  }
});

test('ARCHIVE-05 files recover only to a new ZIP and never write on authentication failure', async () => {
  await fixture(async (dir) => {
    const zip = fixtureZip(), input = path.join(dir, 'source.zip'), encrypted = path.join(dir, 'protected.wsarc'), recovered = path.join(dir, 'recovered.zip');
    await writeFile(input, zip);
    await protectArchiveFile(input, encrypted, key);
    await openArchiveFile(encrypted, recovered, key);
    assert.deepEqual(await readFile(recovered), zip);
    await assert.rejects(openArchiveFile(encrypted, recovered, key), { code: 'EEXIST' });
    assert.deepEqual(await readFile(recovered), zip);
    await assert.rejects(protectArchiveFile(input, encrypted, key), { code: 'EEXIST' });
    const rejected = path.join(dir, 'wrong-key.zip');
    await assert.rejects(openArchiveFile(encrypted, rejected, Buffer.alloc(32)), { code: 'ARCHIVE_AUTH' });
    await assert.rejects(stat(rejected), { code: 'ENOENT' });
    await assert.rejects(openArchiveFile(encrypted, path.join(dir, 'not-a-zip.txt'), key), { code: 'ARCHIVE_INPUT' });
    assert.deepEqual(await readFile(input), zip);
  });
});

test('ARCHIVE-06 oversized input file is rejected without allocating its contents or creating output', async () => {
  await fixture(async (dir) => {
    const input = path.join(dir, 'oversized.zip'), output = path.join(dir, 'result.wsarc'), handle = await open(input, 'wx');
    try { await handle.truncate(ARCHIVE_FORMAT.maxZipBytes + 1); } finally { await handle.close(); }
    await assert.rejects(protectArchiveFile(input, output, key), { code: 'ARCHIVE_LIMIT' });
    await assert.rejects(stat(output), { code: 'ENOENT' });
  });
});

test('ARCHIVE-07 standalone CLI accepts only binary stdin key and does not log it', async () => {
  await fixture(async (dir) => {
    const input = path.join(dir, 'source.zip'), encrypted = path.join(dir, 'protected.wsarc'), recovered = path.join(dir, 'recovered.zip');
    await writeFile(input, fixtureZip());
    const run = (...args) => spawnSync(process.execPath, [path.join(import.meta.dirname, 'archive.mjs'), ...args], { input: key, encoding: 'utf8', timeout: 10000 });
    for (const args of [['protect', input, encrypted], ['open', encrypted, recovered]]) {
      const result = run(...args); assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).format, ARCHIVE_FORMAT.name);
      assert(!result.stdout.includes(key.toString('hex')) && !result.stderr.includes(key.toString('hex')));
      assert(!result.stdout.includes(key.toString('base64')) && !result.stderr.includes(key.toString('base64')));
    }
    assert.deepEqual(await readFile(recovered), fixtureZip());
    const rejected = spawnSync(process.execPath, [path.join(import.meta.dirname, 'archive.mjs'), 'open', encrypted, path.join(dir, 'invalid.zip')], { input: Buffer.alloc(33), encoding: 'utf8', timeout: 10000 });
    assert.equal(rejected.status, 1); assert.match(rejected.stderr, /ARCHIVE_KEY/);
    await assert.rejects(stat(path.join(dir, 'invalid.zip')), { code: 'ENOENT' });
  });
});
