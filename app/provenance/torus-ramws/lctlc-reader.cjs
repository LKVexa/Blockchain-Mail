// Local RAMWS backend reader for a deliberately narrow LCTL-C 1.0 profile.
// Grammar comes from the supplied LctlColumnMain.java. This does not implement
// the complete LCTL canonical semantic verifier or execute quantum operations.
'use strict';

const { createHash } = require('node:crypto');

function fail(message, line) {
  throw new Error('LCTL-C RAMWS profile: ' + message + (line ? ' at line ' + line : ''));
}

function splitOutside(text, separator) {
  const result = [];
  let current = '', quote = null, escaped = false;
  for (const character of text) {
    if (quote) {
      current += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character; current += character;
    } else if (separator(character)) {
      result.push(current); current = '';
    } else current += character;
  }
  if (quote || escaped) fail('unterminated quoted value');
  result.push(current);
  return result;
}

function unquote(raw) {
  const value = raw.trim();
  if (!value.startsWith('"') && !value.startsWith("'")) return value;
  const quote = value[0];
  if (value.length < 2 || value.at(-1) !== quote) fail('unterminated quoted value');
  let result = '';
  for (let index = 1; index < value.length - 1; index++) {
    let character = value[index];
    if (character === '\\') {
      character = value[++index];
      if (index >= value.length - 1 || (character !== '\\' && character !== quote)) {
        fail('unsupported quote escape');
      }
    } else if (character === quote) fail('unescaped quote');
    result += character;
  }
  return result;
}

function keyValues(text, separator, allowed, label) {
  const map = Object.create(null);
  for (const raw of splitOutside(text, separator)) {
    if (!raw.trim()) continue;
    const equal = raw.indexOf('=');
    if (equal <= 0) fail(label + ' requires key=value');
    const key = raw.slice(0, equal).trim();
    if (!allowed.includes(key)) fail('unsupported ' + label + ' key ' + key);
    if (Object.hasOwn(map, key)) fail('duplicate ' + label + ' key ' + key);
    const value = unquote(raw.slice(equal + 1));
    if (!value) fail('empty ' + label + ' value for ' + key);
    map[key] = value;
  }
  return map;
}

function required(map, names, label) {
  for (const key of names) if (!Object.hasOwn(map, key)) fail(label + ' missing ' + key);
}

function integer(value, label, minimum = 0) {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) fail(label + ' must be a nonnegative integer');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum) fail(label + ' out of range');
  return result;
}

function number(value, label, minimum = 0) {
  if (value === undefined || value.trim() === '') fail(label + ' must be a finite number');
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum) fail(label + ' out of range');
  return result;
}

function identifier(value, label) {
  if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(value)) fail(label + ' invalid identifier');
  return value;
}

function exact(map, key, value, label) {
  if (map[key] !== undefined && map[key] !== value) fail(label + ' requires ' + key + '=' + value);
}

function parseLctlc(sourceText) {
  if (typeof sourceText !== 'string') fail('source must be UTF-8 text');
  const lines = sourceText.split(/\r\n|\n|\r/);
  if (lines[0].trim() !== 'LCTLC/1.0') fail('expected LCTLC/1.0 magic');
  let unit = null, defaults = null, frame = null, columns = false, ended = false;
  const rowIds = new Set();
  const nodes = [], links = [], messages = [], code = [], declarations = [], rows = [];
  const nodeIds = new Set();
  const unitKeys = ['id','version','profile','entry','target','backend','network','replay',
    'precision','error_budget','resource_ceiling','admission','state','proof'];
  const defaultKeys = ['qspace','basis','regime','assume','error','conf'];

  for (let index = 1; index < lines.length; index++) {
    const text = lines[index].trim(), line = index + 1;
    if (!text || text.startsWith('#')) continue;
    if (ended) fail('content after @end', line);
    if (text.startsWith('@unit ')) {
      if (unit || defaults || frame) fail('misplaced or duplicate @unit', line);
      unit = keyValues(text.slice(6), c => /\s/.test(c), unitKeys, '@unit');
      required(unit, ['id','profile','entry'], '@unit');
      identifier(unit.id, 'unit id');
      if (!['distributed','lctl.quantum.parallel.distributed'].includes(unit.profile)) {
        fail('only the distributed profile is supported', line);
      }
      for (const [key, value] of Object.entries({ target:'local-reference',backend:'none',
        network:'deny',replay:'deterministic-seeded',precision:'f64',admission:'q1-q6',state:'sealed' })) {
        exact(unit, key, value, '@unit');
      }
      if (unit.error_budget !== undefined) number(unit.error_budget, 'error_budget');
      continue;
    }
    if (text.startsWith('@defaults ')) {
      if (!unit || defaults || frame) fail('misplaced or duplicate @defaults', line);
      defaults = keyValues(text.slice(10), c => /\s/.test(c), defaultKeys, '@defaults');
      for (const [key, value] of Object.entries({ qspace:'H',basis:'computational',
        regime:'exact',assume:'finite_dimension',error:'exact',conf:'1.0' })) {
        exact(defaults, key, value, '@defaults');
      }
      continue;
    }
    if (text.startsWith('@frame ')) {
      if (!unit || frame) fail('exactly one non-nested frame is supported', line);
      frame = keyValues(text.slice(7), c => /\s/.test(c), ['id','parent','module'], '@frame');
      required(frame, ['id','parent','module'], '@frame');
      identifier(frame.id, 'frame id');
      exact(frame, 'parent', 'ROOT', '@frame');
      exact(frame, 'module', unit.id, '@frame');
      continue;
    }
    if (text === '@end' || text === '@endframe') {
      if (!columns || !rows.length) fail('@end needs a nonempty frame', line);
      ended = true;
      continue;
    }
    if (text.replaceAll(' ', '') === 'ID│LANE│OP│OUT│CTRL│IN│ARG│META') {
      if (!frame || columns) fail('misplaced or duplicate column header', line);
      columns = true;
      continue;
    }
    if (!columns || !frame) fail('unexpected content', line);
    const cells = text.split('│').map(cell => cell.trim());
    if (cells.length !== 8 || cells.some(cell => !cell)) fail('expected eight nonempty cells', line);
    const [id,lane,rawOp,out,ctrl,input,arg,meta] = cells;
    identifier(id, 'row id');
    if (rowIds.has(id)) fail('duplicate row id ' + id, line);
    rowIds.add(id);
    // Nonempty META can change semantic roles. This backend deliberately rejects it.
    if (meta !== '_') fail('META overrides are outside the RAMWS backend subset', line);
    const op = ({ Q:'QREG', LK:'LINK', MSG:'MESSAGE', '.':'NOP' })[rawOp] || rawOp;
    if (!['QREG','NODE','LINK','MESSAGE','NOP'].includes(op)) fail('unsupported operation ' + rawOp, line);
    if (ctrl !== '_' || input !== '_') fail('operands are unsupported for ' + op, line);
    if (op !== 'QREG' && out !== '_') fail('OUT must be _ for ' + op, line);
    rows.push({ id,lane,op,out,ctrl,input,arg,meta });

    if (op === 'QREG') {
      if (lane !== 'alloc' || out !== 'q' || arg !== '1' || declarations.length) {
        fail('only one unused QREG q of size 1 is supported', line);
      }
      declarations.push({ id,op,out,size:1,used_by_ramws:false });
    } else if (op === 'NODE') {
      if (lane !== 'topology') fail('NODE requires topology lane', line);
      const fields = keyValues(arg, c => c === ';', ['id','class','x','y'], 'NODE');
      required(fields, ['id','class','x','y'], 'NODE');
      const nodeId = identifier(fields.id, 'NODE id');
      if (nodeIds.has(nodeId)) fail('duplicate NODE id ' + nodeId, line);
      exact(fields, 'class', 'emulated_cpu', 'NODE');
      const x = integer(fields.x, 'NODE x'), y = integer(fields.y, 'NODE y');
      if (x > 2 || y > 2 || nodeId !== 'n' + x + y) fail('NODE id/coordinates mismatch', line);
      nodeIds.add(nodeId);
      nodes.push({ id:nodeId,x,y,class:fields.class });
    } else if (op === 'LINK') {
      if (lane !== 'topology') fail('LINK requires topology lane', line);
      const fields = keyValues(arg, c => c === ';',
        ['src','dst','type','latency','bandwidth'], 'LINK');
      required(fields, ['src','dst','type','latency','bandwidth'], 'LINK');
      const src = identifier(fields.src, 'LINK src'), dst = identifier(fields.dst, 'LINK dst');
      if (src === dst) fail('LINK self-link is forbidden', line);
      exact(fields, 'type', 'classical', 'LINK');
      const latency = number(fields.latency, 'LINK latency');
      const bandwidth = number(fields.bandwidth, 'LINK bandwidth', Number.MIN_VALUE);
      links.push({ id,src,dst,type:fields.type,latency,bandwidth });
    } else if (op === 'MESSAGE') {
      if (lane !== 'message') fail('MESSAGE requires message lane', line);
      const fields = keyValues(arg, c => c === ';',
        ['src','dst','bytes','transport','payload','protection','math'], 'MESSAGE');
      required(fields, ['src','dst','bytes','transport','payload','protection','math'], 'MESSAGE');
      const src = identifier(fields.src, 'MESSAGE src'), dst = identifier(fields.dst, 'MESSAGE dst');
      exact(fields, 'transport', 'ramws', 'MESSAGE');
      exact(fields, 'protection', 'cypher', 'MESSAGE');
      exact(fields, 'math', '8s-image-v2', 'MESSAGE');
      const bytes = integer(fields.bytes, 'MESSAGE bytes');
      if (Buffer.byteLength(fields.payload, 'utf8') !== bytes) fail('MESSAGE bytes mismatch UTF-8 payload', line);
      messages.push({ id,src,dst,bytes,transport:fields.transport,payload:fields.payload,
        protection:fields.protection,math:fields.math });
    } else {
      if (lane !== 'main' || arg !== '_') fail('NOP requires main lane and empty ARG', line);
      code.push({ id,op,lane });
    }
  }
  if (!unit || !frame || !columns || !ended) fail('incomplete unit/frame');
  if (declarations.length !== 1 || code.length !== 1 || messages.length !== 1) {
    fail('requires one admission QREG, one NOP, and one MESSAGE');
  }
  if (unit.entry !== frame.id + ':' + code[0].id) fail('ENTRY must name the NOP row');
  for (const item of [...links,...messages]) {
    if (!nodeIds.has(item.src) || !nodeIds.has(item.dst)) fail('undeclared source/destination');
  }
  return {
    unit, defaults:defaults || {}, frame,nodes,links,messages,code,declarations,rows,
    source_sha256:createHash('sha256').update(sourceText, 'utf8').digest('hex'),
    validation_scope:'LCTL-C 1.0 bounded local RAMWS backend subset',
    canonical_java_verifier_executed:false
  };
}

module.exports = { parseLctlc };
