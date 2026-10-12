import {
  createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes,
} from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Independent portable format. This is neither native .ja21pkg nor an 8S cipher.
// v1 layout: magic[8], version[1], codec[1], flags[2], ciphertextLength[8 BE],
// salt[32], nonce[12], ciphertext[length], GCM tag[16].
// The complete 64-byte public header is AAD. The encrypted body is
// manifestLength[4 BE] + UTF-8 manifest + opaque, exact ZIP bytes.
export const ARCHIVE_FORMAT = Object.freeze({
  name: 'workspace-portable-archive',
  version: 1,
  codec: 'AES-256-GCM/HKDF-SHA256',
  headerBytes: 64,
  tagBytes: 16,
  maxZipBytes: 256 * 1024 * 1024,
  maxManifestBytes: 4096,
});
const MAGIC = Buffer.from('WSPACEAR', 'ascii');
const INFO = Buffer.from('workspace-portable-archive/v1/aes-256-gcm/zip', 'utf8');
const MAX_BODY = 4 + ARCHIVE_FORMAT.maxManifestBytes + ARCHIVE_FORMAT.maxZipBytes;
const MAX_ARCHIVE = ARCHIVE_FORMAT.headerBytes + MAX_BODY + ARCHIVE_FORMAT.tagBytes;

export class ArchiveError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'ArchiveError';
    this.code = code;
  }
}

function requireKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new ArchiveError('ARCHIVE_KEY', 'A 32-byte binary archive key is required.');
  }
}
function requireBytes(bytes, maximum, kind) {
  if (!Buffer.isBuffer(bytes)) {
    throw new ArchiveError('ARCHIVE_INPUT', kind + ' must be binary bytes.');
  }
  if (bytes.length > maximum) {
    throw new ArchiveError('ARCHIVE_LIMIT', kind + ' exceeds the supported size limit.');
  }
}
function derivedKey(key, salt) {
  return Buffer.from(hkdfSync('sha256', key, salt, INFO, 32));
}
function zipManifest(bytes) {
  return {
    format: ARCHIVE_FORMAT.name,
    version: ARCHIVE_FORMAT.version,
    payload: 'zip-bytes',
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export function protectArchive(zipBytes, key) {
  requireKey(key);
  requireBytes(zipBytes, ARCHIVE_FORMAT.maxZipBytes, 'ZIP');
  const manifest = Buffer.from(JSON.stringify(zipManifest(zipBytes)), 'utf8');
  const body = Buffer.allocUnsafe(4 + manifest.length + zipBytes.length);
  body.writeUInt32BE(manifest.length);
  manifest.copy(body, 4);
  zipBytes.copy(body, 4 + manifest.length);
  const header = Buffer.alloc(ARCHIVE_FORMAT.headerBytes);
  MAGIC.copy(header);
  header[8] = ARCHIVE_FORMAT.version;
  header[9] = 1; // AES-256-GCM/HKDF-SHA256, defined by this format version.
  header.writeBigUInt64BE(BigInt(body.length), 12);
  randomBytes(32).copy(header, 20);
  randomBytes(12).copy(header, 52);
  const sessionKey = derivedKey(key, header.subarray(20, 52));
  try {
    const cipher = createCipheriv('aes-256-gcm', sessionKey, header.subarray(52, 64));
    cipher.setAAD(header);
    return Buffer.concat([header, cipher.update(body), cipher.final(), cipher.getAuthTag()]);
  } finally {
    sessionKey.fill(0);
    body.fill(0);
    manifest.fill(0);
  }
}

function readHeader(bytes) {
  requireBytes(bytes, MAX_ARCHIVE, 'Archive');
  if (bytes.length < ARCHIVE_FORMAT.headerBytes + ARCHIVE_FORMAT.tagBytes + 4) {
    throw new ArchiveError('ARCHIVE_FORMAT', 'The archive is truncated.');
  }
  const header = bytes.subarray(0, ARCHIVE_FORMAT.headerBytes);
  if (!header.subarray(0, 8).equals(MAGIC) || header[8] !== 1 ||
      header[9] !== 1 || header.readUInt16BE(10) !== 0) {
    throw new ArchiveError('ARCHIVE_FORMAT', 'Unsupported archive header.');
  }
  const bodySize = header.readBigUInt64BE(12);
  if (bodySize < 4n || bodySize > BigInt(MAX_BODY) ||
      bodySize !== BigInt(bytes.length - ARCHIVE_FORMAT.headerBytes - ARCHIVE_FORMAT.tagBytes)) {
    throw new ArchiveError('ARCHIVE_FORMAT', 'Invalid archive length.');
  }
  return { header, bodySize: Number(bodySize) };
}

function readManifest(body) {
  const size = body.readUInt32BE(0);
  if (size === 0 || size > ARCHIVE_FORMAT.maxManifestBytes || size > body.length - 4) {
    throw new ArchiveError('ARCHIVE_FORMAT', 'Invalid encrypted manifest length.');
  }
  let manifest;
  try {
    const encoded = body.subarray(4, 4 + size);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(encoded);
    manifest = JSON.parse(text);
  } catch {
    throw new ArchiveError('ARCHIVE_FORMAT', 'Invalid encrypted manifest.');
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
      Object.keys(manifest).sort().join(',') !== 'format,payload,sha256,size,version' ||
      manifest.format !== ARCHIVE_FORMAT.name || manifest.version !== 1 ||
      manifest.payload !== 'zip-bytes' || !Number.isSafeInteger(manifest.size) ||
      manifest.size < 0 || manifest.size > ARCHIVE_FORMAT.maxZipBytes ||
      typeof manifest.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.sha256) ||
      manifest.size !== body.length - 4 - size) {
    throw new ArchiveError('ARCHIVE_FORMAT', 'Invalid encrypted manifest fields.');
  }
  const payload = body.subarray(4 + size);
  if (createHash('sha256').update(payload).digest('hex') !== manifest.sha256) {
    throw new ArchiveError('ARCHIVE_FORMAT', 'The ZIP does not match its encrypted manifest.');
  }
  return { bytes: Buffer.from(payload), manifest: Object.freeze(manifest) };
}

export function openArchive(archiveBytes, key) {
  requireKey(key);
  const { header, bodySize } = readHeader(archiveBytes);
  const sessionKey = derivedKey(key, header.subarray(20, 52));
  let pending, body;
  try {
    const decipher = createDecipheriv('aes-256-gcm', sessionKey, header.subarray(52, 64));
    decipher.setAAD(header);
    decipher.setAuthTag(archiveBytes.subarray(64 + bodySize));
    try {
      // No plaintext leaves this function until final() authenticates the entire body.
      pending = decipher.update(archiveBytes.subarray(64, 64 + bodySize));
      body = Buffer.concat([pending, decipher.final()]);
    } catch {
      throw new ArchiveError('ARCHIVE_AUTH', 'Archive authentication failed.');
    }
    return readManifest(body);
  } finally {
    sessionKey.fill(0);
    pending?.fill(0);
    body?.fill(0);
  }
}

async function readBoundedFile(file, maximum) {
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let bytes;
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new ArchiveError('ARCHIVE_INPUT', 'Input must be a regular file.');
    if (!Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > maximum) {
      throw new ArchiveError('ARCHIVE_LIMIT', 'Input exceeds the supported size limit.');
    }
    bytes = Buffer.allocUnsafe(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) throw new ArchiveError('ARCHIVE_INPUT', 'Input changed during reading.');
      offset += bytesRead;
    }
    const extra = Buffer.alloc(1);
    if ((await handle.read(extra, 0, 1, offset)).bytesRead !== 0 ||
        (await handle.stat()).size !== stat.size) {
      throw new ArchiveError('ARCHIVE_INPUT', 'Input changed during reading.');
    }
    return bytes;
  } catch (error) {
    bytes?.fill(0);
    throw error;
  } finally {
    await handle.close();
  }
}

async function writeNewFile(file, bytes) {
  // Exclusive creation never overwrites an existing file, directory or symlink.
  // A storage failure can leave a newly created partial file; it is not a successful output.
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function protectArchiveFile(inputZip, outputArchive, key) {
  requireKey(key);
  if (path.extname(inputZip).toLowerCase() !== '.zip') {
    throw new ArchiveError('ARCHIVE_INPUT', 'Protection input must be a ZIP file.');
  }
  const bytes = await readBoundedFile(inputZip, ARCHIVE_FORMAT.maxZipBytes);
  try {
    await writeNewFile(outputArchive, protectArchive(bytes, key));
  } finally {
    bytes.fill(0);
  }
}

export async function openArchiveFile(inputArchive, outputZip, key) {
  requireKey(key);
  if (path.extname(outputZip).toLowerCase() !== '.zip') {
    throw new ArchiveError('ARCHIVE_INPUT', 'Recovery output must be a new ZIP file.');
  }
  const archive = await readBoundedFile(inputArchive, MAX_ARCHIVE);
  const result = openArchive(archive, key);
  try {
    await writeNewFile(outputZip, result.bytes);
    return result.manifest;
  } finally {
    result.bytes.fill(0);
  }
}

async function stdinKey() {
  const parts = [];
  let size = 0;
  try {
    for await (const part of process.stdin) {
      size += part.length;
      parts.push(part);
      if (size > 32) throw new ArchiveError('ARCHIVE_KEY', 'Standard input must contain exactly 32 binary key bytes.');
    }
    if (size !== 32) throw new ArchiveError('ARCHIVE_KEY', 'Standard input must contain exactly 32 binary key bytes.');
    return Buffer.concat(parts);
  } finally {
    for (const part of parts) part.fill(0);
  }
}

async function main() {
  const [mode, input, output, ...extra] = process.argv.slice(2);
  if (!['protect', 'open'].includes(mode) || !input || !output || extra.length) {
    throw new ArchiveError('ARCHIVE_USAGE', 'Usage: archive.mjs protect INPUT.zip OUTPUT | open INPUT OUTPUT.zip; supply exactly 32 binary key bytes on standard input.');
  }
  const key = await stdinKey();
  try {
    if (mode === 'protect') await protectArchiveFile(input, output, key);
    else await openArchiveFile(input, output, key);
    process.stdout.write(JSON.stringify({ status: mode === 'protect' ? 'PROTECTED' : 'RECOVERED', format: ARCHIVE_FORMAT.name, version: 1, output }) + '\n');
  } finally {
    key.fill(0);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write((error.code ?? 'ARCHIVE_FAILED') + ': ' + error.message + '\n');
    process.exitCode = 1;
  });
}
