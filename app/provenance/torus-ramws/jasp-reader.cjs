// Bounded reader for the supplied provisional JA Service & Protocol source profile.
// This binds a fixed host ABI. It is not a native JA compiler or JA Service Runtime.
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const PROFILE = {
  NodeAddress: { x: 'Count', y: 'Count' },
  OpenRequest: { session_id: 'Text', node: 'NodeAddress' },
  SessionReply: { session_id: 'Text', state: 'Text', accepted: 'Flag', obfuscated: 'Flag', math_context_hash: 'Text' },
  TorusMessage: { message_id: 'Text', session_id: 'Text', source: 'NodeAddress', destination: 'NodeAddress', payload: 'Text' },
  TorusAck: { message_id: 'Text', session_id: 'Text', delivered: 'Flag', hops: 'Count', path: 'Text', obfuscated: 'Flag', math_context_hash: 'Text' },
  CloseRequest: { session_id: 'Text' },
  Failure: { code: 'Text', detail: 'Text' },
};
const ENDPOINTS = {
  open: { parameters: { request: 'OpenRequest' }, result: 'Result<SessionReply,Failure>', retries: '0', idempotency: 'request.session_id' },
  send: { parameters: { request: 'TorusMessage' }, result: 'Result<TorusAck,Failure>', retries: '0', idempotency: 'request.message_id' },
  close: { parameters: { request: 'CloseRequest' }, result: 'Result<SessionReply,Failure>', retries: '0', idempotency: 'request.session_id' },
};

function tokenize(source) {
  const tokens = [];
  const pattern = /\s+|"[^"\r\n]*"|[A-Za-z][A-Za-z0-9_]*|[0-9]+(?:\.[0-9]+)+|[0-9]+|->|==|[{}(),:.<>/]/y;
  let cursor = 0;
  while (cursor < source.length) {
    pattern.lastIndex = cursor;
    const found = pattern.exec(source);
    if (!found) throw new Error(`JASP syntax: unsupported character at offset ${cursor}`);
    if (!/^\s+$/.test(found[0])) tokens.push(found[0]);
    cursor = pattern.lastIndex;
  }
  return tokens;
}

function parseJasp(source) {
  if (typeof source !== 'string') throw new TypeError('JASP source must be text');
  const tokens = tokenize(source);
  let position = 0;
  const peek = () => tokens[position];
  const take = expected => {
    const actual = tokens[position++];
    if (actual !== expected) throw new Error(`JASP syntax: expected ${expected}, received ${actual ?? '<end>'}`);
    return actual;
  };
  const identifier = () => {
    const value = tokens[position++];
    if (!value || !/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) throw new Error(`JASP syntax: expected identifier, received ${value ?? '<end>'}`);
    return value;
  };
  const qualifiedName = () => {
    let value = identifier();
    while (peek() === '.') { take('.'); value += '.' + identifier(); }
    return value;
  };
  const integer = () => {
    const value = tokens[position++];
    if (!value || !/^[0-9]+$/.test(value)) throw new Error('JASP syntax: expected integer');
    return value;
  };
  const duration = () => {
    const value = integer(), unit = identifier();
    if (!['ms', 's', 'm'].includes(unit)) throw new Error('JASP syntax: unsupported duration');
    return value + unit;
  };
  const type = () => {
    if (['Stream', 'Result'].includes(peek())) {
      const name = identifier(); take('<'); const arguments_ = [type()];
      if (name === 'Result') { take(','); arguments_.push(type()); }
      take('>'); return name + '<' + arguments_.join(',') + '>';
    }
    return qualifiedName();
  };
  const fields = closing => {
    const result = {};
    if (peek() !== closing) {
      for (;;) {
        const name = identifier(); take(':');
        if (Object.hasOwn(result, name)) throw new Error(`JASP syntax: duplicate field ${name}`);
        result[name] = type();
        if (peek() !== ',') break;
        take(',');
      }
    }
    take(closing); return result;
  };
  const expression = () => {
    if (peek()?.startsWith('"')) return tokens[position++];
    if (/^[0-9]+$/.test(peek() ?? '')) return integer();
    return qualifiedName();
  };

  take('ja'); take('source'); const version = tokens[position++];
  if (!version || !/^[0-9]+(?:\.[0-9]+)*$/.test(version)) throw new Error('JASP syntax: invalid source version');
  take('module'); const module = qualifiedName();
  const imports = [], policies = [];
  while (peek() === 'use') { take('use'); imports.push(identifier()); }
  while (peek() === 'policy') { take('policy'); policies.push(identifier()); }
  take('service'); const service = identifier(); take('{');
  const messages = {}, endpointContracts = {}, protocols = [], transports = [];
  while (peek() !== '}') {
    if (peek() === 'message') {
      take('message'); const name = identifier(); take('{');
      if (Object.hasOwn(messages, name)) throw new Error(`JASP syntax: duplicate message ${name}`);
      messages[name] = fields('}');
    } else if (peek() === 'endpoint') {
      take('endpoint'); const name = identifier(); take('('); const parameters = fields(')'); take('->');
      const endpoint = { parameters, result: type() };
      if (Object.hasOwn(endpointContracts, name)) throw new Error(`JASP syntax: duplicate endpoint ${name}`);
      const add = (key, value) => {
        if (Object.hasOwn(endpoint, key)) throw new Error(`JASP syntax: duplicate endpoint clause ${key}`);
        endpoint[key] = value;
      };
      while (['auth', 'deadline', 'retry', 'idempotency', 'quota', 'rate'].includes(peek())) {
        const clause = identifier();
        if (clause === 'auth') { take('capability'); add('auth', qualifiedName()); }
        else if (clause === 'deadline') add('deadline', duration());
        else if (clause === 'retry') {
          take('max'); add('retries', integer());
          if (peek() === 'backoff') { take('backoff'); add('backoff', duration()); }
        } else if (clause === 'idempotency') add('idempotency', expression());
        else { const count = integer(); take('/'); add(clause, count + '/' + duration()); }
      }
      endpointContracts[name] = endpoint;
    } else if (peek() === 'protocol') {
      take('protocol'); const name = identifier(); take('{');
      const states = [], transitions = [];
      while (peek() !== '}') {
        if (peek() === 'state') { take('state'); states.push(identifier()); }
        else {
          take('transition'); const id = identifier(); take(':'); const from = identifier(); take('->');
          transitions.push({ id, from, to: identifier() });
        }
      }
      take('}'); protocols.push({ name, states, transitions });
    } else if (peek() === 'transport') {
      take('transport'); const name = identifier(), scope = identifier();
      if (!['local', 'remote', 'offline'].includes(scope)) throw new Error('JASP syntax: invalid transport scope');
      const transport = { name, scope };
      if (peek() === 'capability') { take('capability'); transport.capability = qualifiedName(); }
      transports.push(transport);
    } else throw new Error(`JASP syntax: unexpected service declaration ${peek() ?? '<end>'}`);
  }
  take('}'); const assertions = [];
  while (peek() === 'assert') { take('assert'); const left = expression(); take('=='); assertions.push({ left, right: expression() }); }
  take('emit'); const format = identifier(), emission = qualifiedName();
  if (position !== tokens.length) throw new Error('JASP syntax: trailing input');

  const protocol = { name: 'Session', states: ['Created', 'Open', 'Closed'], transitions: [{ id: 'open', from: 'Created', to: 'Open' }, { id: 'close', from: 'Open', to: 'Closed' }] };
  const check = (condition, detail) => { if (!condition) throw new Error(`Unsupported JASP host profile: ${detail}`); };
  check(version === '0.3' && module === 'torus.ramws', 'source version or module');
  check(isDeepStrictEqual(imports, ['Service']) && isDeepStrictEqual(policies, ['no_network']), 'imports or policy');
  check(service === 'TorusRAMWS', 'service');
  check(isDeepStrictEqual(messages, PROFILE), 'message names or field types');
  check(isDeepStrictEqual(endpointContracts, ENDPOINTS), 'endpoint contract');
  check(isDeepStrictEqual(protocols, [protocol]), 'session states or transitions');
  check(isDeepStrictEqual(transports, [{ name: 'ramws', scope: 'local' }]), 'transport activation');
  check(isDeepStrictEqual(assertions, [{ left: 'protocol.transition.valid', right: 'true' }]), 'assertion declaration');
  check(format === 'json' && emission === 'TorusRAMWS.compatibility_report', 'emission declaration');
  return {
    version, module, service, transport: 'ramws', scope: 'local',
    endpoints: Object.keys(endpointContracts), endpointContracts, messages, protocol,
    assertions, assertions_executed: false,
    source_sha256: createHash('sha256').update(source, 'utf8').digest('hex'),
    reader_scope: 'Fixed TorusRAMWS host ABI; provisional grammar parse only; no native JA compilation or R12/MCRT lowering',
  };
}

// Host representation of Text/Flag/Count; this does not certify native JA types.
function validateMessage(type, value) {
  if (!Object.hasOwn(PROFILE, type)) throw new Error(`Unsupported message type ${type}`);
  const schema = PROFILE[type];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${type} must be an object`);
  if (!isDeepStrictEqual(Object.keys(value).sort(), Object.keys(schema).sort())) throw new TypeError(`${type} fields do not match the source contract`);
  for (const [name, fieldType] of Object.entries(schema)) {
    const field = value[name];
    if (fieldType === 'Text' && typeof field !== 'string') throw new TypeError(`${type}.${name} must be text`);
    if (fieldType === 'Flag' && typeof field !== 'boolean') throw new TypeError(`${type}.${name} must be a boolean`);
    if (fieldType === 'Count' && !(Number.isSafeInteger(field) && field >= 0)) throw new TypeError(`${type}.${name} must be a nonnegative safe integer in this host profile`);
    if (Object.hasOwn(PROFILE, fieldType)) validateMessage(fieldType, field);
  }
  return value;
}
module.exports = { parseJasp, validateMessage };
