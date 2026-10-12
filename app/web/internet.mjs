import { SessionFence, SessionChangedError } from './session.mjs';
import { initializeTheme } from './theme.mjs';

initializeTheme(document, window);
const $ = selector => document.querySelector(selector);
const fence = new SessionFence();
let access = '', settings = null, activeAttempt = null, pendingDraft = null, accountRole = '';
let sessionVersion = 0, refreshVersion = 0, sending = false, configuring = false;

function feedback(selector, message = '', kind = '') {
  const element = $(selector);
  element.textContent = message;
  element.dataset.kind = kind;
}

async function api(path, body) {
  const operation = fence.begin(), bearer = access;
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      signal: operation.signal,
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + bearer, ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-BVE-Request': '1' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    operation.check();
    const result = await response.json();
    operation.check();
    if (!response.ok) {
      const error = new Error(result.message || result.error || 'The request could not be completed.');
      error.code = result.error;
      error.responseReceived = true;
      throw error;
    }
    return result;
  } finally { operation.finish(); }
}

function obsolete(error) { return error instanceof SessionChangedError || error.code === 'SESSION_CHANGED' || error.name === 'AbortError'; }
function handled(handler, selector = '#page-status') {
  return async event => {
    try { await handler(event); }
    catch (error) { if (!obsolete(error)) feedback(selector, error.message, 'error'); }
  };
}

function updateControls() {
  const locked = !!activeAttempt;
  $('#sender').readOnly = accountRole !== 'operator' || locked;
  for (const selector of ['#recipient', '#subject', '#message-body']) $(selector).readOnly = locked;
  if (locked) {
    $('#recipient').value = activeAttempt.to; $('#subject').value = activeAttempt.subject; $('#message-body').value = activeAttempt.body;
    $('#sender').value = activeAttempt.from; $('#helo').value = activeAttempt.helo;
  }
  for (const selector of ['#sender', '#helo', '#enabled', '#save-config']) $(selector).disabled = locked || sending || configuring;
  $('#send').disabled = sending || configuring || (!activeAttempt && !settings?.enabled) || activeAttempt?.status === 'ACCEPTED';
  $('#send').textContent = sending ? 'Checking mail server…' : activeAttempt ? 'Check send attempt' : 'Review and send';
  $('#new-message').disabled = sending;
  $('#compose-help').textContent = locked
    ? 'This draft is kept unchanged. Checking this attempt uses the same message ID and cannot create a second send.'
    : settings?.enabled ? 'Your sender is enabled. Review the sender and recipient before sending.' : 'Save and enable your sender before sending.';
}

function renderSettings(value, overwriteForm = false) {
  settings = value;
  accountRole = value.role || accountRole;
  $('#assigned-address').value = value.assigned_address || '';
  $('#assignment-status').textContent = value.assigned_address ? 'Reserved in this workspace’s signed ledger' : 'Your email address will be reserved when you connect.';
  $('#sender-help').textContent = accountRole === 'operator'
    ? 'Your assigned address is ready to use. You can also save a custom sender for this mailbox.'
    : 'Sending uses your assigned email address.';
  $('#connection-state').textContent = value.enabled ? 'Internet sending enabled' : value.configured ? 'Sender saved · sending paused' : 'Set up your Internet sender';
  $('#connection-detail').textContent = value.enabled
    ? 'Sending from ' + value.from + ' · mail server name ' + value.helo
    : value.configured ? 'Enable Internet sending when you are ready.' : 'Connect to reserve your email address in the workspace ledger.';
  feedback('#sender-warning', value.sender_warning || '', 'uncertain');
  $('#status-dot').classList.toggle('enabled', !!value.enabled);
  if (overwriteForm && !activeAttempt) {
    $('#sender').value = value.from || value.assigned_address || '';
    $('#helo').value = value.helo || '';
    $('#enabled').checked = !!value.enabled;
  }
  updateControls();
}

const statusLabels = {
  QUEUED: 'Queued', SENDING: 'Connecting to mail server', ACCEPTED: 'Recipient server accepted',
  FAILED: 'Send failed', UNKNOWN: 'Delivery uncertain'
};

function showAttempt(message, replayed = false) {
  if (!activeAttempt) return;
  activeAttempt.status = message.status;
  const suffix = replayed ? ' This is the existing send attempt.' : '';
  if (message.status === 'UNKNOWN') feedback('#send-status', 'Delivery uncertain — check recipient before sending again.' + suffix + ' Creating a new message could send a duplicate.', 'uncertain');
  else if (message.status === 'ACCEPTED') feedback('#send-status', 'Recipient server accepted.' + suffix + ' This does not prove inbox delivery.', 'success');
  else if (message.status === 'FAILED') feedback('#send-status', 'Send failed.' + suffix + (message.detail ? ' ' + message.detail : '') + ' Start a new message only when you are ready to make a new attempt.', 'error');
  else feedback('#send-status', (statusLabels[message.status] || 'Send attempt recorded') + '.' + suffix + ' Refresh to check progress.');
  updateControls();
}

function renderOutbox(result) {
  const messages = Array.isArray(result.messages) ? result.messages : [];
  $('#outbox-count').textContent = messages.length + (messages.length === 1 ? ' message' : ' messages');
  const container = $('#outbox');
  container.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Your Internet sends will appear here.'; container.append(empty);
  }
  for (const message of messages) {
    const row = document.createElement('article'); row.className = 'outbox-row';
    const heading = document.createElement('div'); heading.className = 'outbox-row-heading';
    const subject = document.createElement('h3'); subject.className = 'outbox-subject'; subject.textContent = message.subject || '(No subject)';
    const tag = document.createElement('span'); tag.className = 'outbox-tag ' + ({ACCEPTED:'accepted', UNKNOWN:'unknown', FAILED:'failed'}[message.status] || ''); tag.textContent = statusLabels[message.status] || 'Status unavailable';
    heading.append(subject, tag);
    const meta = document.createElement('p'); meta.className = 'outbox-meta';
    const date = new Date(message.created_at); const time = Number.isFinite(date.getTime()) ? date.toLocaleString() : '';
    meta.textContent = 'From ' + String(message.from || '') + ' → ' + String(message.to || '') + (time ? ' · ' + time : '');
    row.append(heading, meta);
    if (message.detail || message.status === 'UNKNOWN') {
      const detail = document.createElement('p'); detail.className = 'outbox-detail';
      detail.textContent = message.status === 'UNKNOWN' ? 'Delivery uncertain — check recipient before sending again.' + (message.detail ? ' ' + message.detail : '') : String(message.detail);
      row.append(detail);
    }
    container.append(row);
    if (activeAttempt && message.request_id === activeAttempt.request_id) showAttempt(message, true);
  }
}

async function refresh(overwriteForm = false) {
  const version = ++refreshVersion;
  const [status, outbox] = await Promise.all([api('/api/internet/status'), api('/api/internet/outbox')]);
  if (version !== refreshVersion) return;
  renderSettings(status, overwriteForm);
  renderOutbox(outbox);
}

async function fillToken() {
  if (!window.workspaceAccess) {
    feedback('#login-status', 'Internet email requires the protected workspace. Start it using your workspace launcher.', 'error');
    return;
  }
  const version = sessionVersion;
  const token = await window.workspaceAccess('postmaster@local.test');
  if (version === sessionVersion && !access) $('#token').value = token;
}

$('#fill-token').onclick = handled(fillToken, '#login-status');
if (window.workspaceAccess) void fillToken().catch(error => feedback('#login-status', error.message, 'error'));

$('#login-form').onsubmit = handled(async event => {
  event.preventDefault();
  fence.invalidate(); sessionVersion++; refreshVersion++;
  access = $('#token').value.trim();
  const version = sessionVersion;
  $('#connect').disabled = true;
  feedback('#login-status', 'Connecting…');
  try {
    const me = await api('/api/me');
    accountRole = me.role;
    const connected = await api('/api/internet/login', {});
    renderSettings(connected, true);
    await refresh(true);
    if (version !== sessionVersion) return;
    $('#identity').textContent = me.address + ' · ' + me.role;
    $('#token').value = ''; $('#login').hidden = true; $('#shell').hidden = false;
    feedback('#login-status');
  } catch (error) {
    if (version === sessionVersion) {
      access = ''; settings = null; accountRole = '';
      $('#assigned-address').value = ''; $('#assignment-status').textContent = '';
      updateControls();
    }
    throw error;
  }
  finally { if (version === sessionVersion) $('#connect').disabled = false; }
}, '#login-status');

$('#logout').onclick = () => {
  fence.invalidate(); sessionVersion++; refreshVersion++;
  access = ''; settings = null; activeAttempt = null; pendingDraft = null; accountRole = ''; sending = false; configuring = false;
  $('#token').value = ''; $('#identity').textContent = ''; $('#outbox').replaceChildren();
  $('#assigned-address').value = ''; $('#assignment-status').textContent = '';
  $('#compose-form').reset(); $('#config-form').reset(); $('#confirm-send').close();
  for (const selector of ['#page-status', '#config-status', '#send-status', '#login-status', '#sender-warning']) feedback(selector);
  $('#shell').hidden = true; $('#login').hidden = false; updateControls(); $('#token').focus();
};

$('#refresh').onclick = handled(async () => {
  feedback('#page-status'); $('#refresh').disabled = true;
  try { await refresh(); } finally { $('#refresh').disabled = false; }
});

$('#config-form').onsubmit = handled(async event => {
  event.preventDefault();
  if (activeAttempt || sending || configuring) return;
  const version = sessionVersion;
  const from = accountRole === 'operator' ? $('#sender').value.trim() : settings.assigned_address;
  const domain = from.includes('@') ? from.slice(from.lastIndexOf('@') + 1) : '';
  const helo = $('#helo').value.trim() || (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(domain) ? '[' + domain + ']' : domain);
  configuring = true; updateControls();
  feedback('#config-status', 'Saving sender settings…');
  try {
    const result = await api('/api/internet/config', { enabled: $('#enabled').checked, from, helo });
    renderSettings(result, true);
    feedback('#config-status', result.enabled ? 'Sender saved. Internet sending is enabled.' : 'Sender settings saved. Internet sending is paused.', 'success');
  } finally { if (version === sessionVersion) { configuring = false; updateControls(); } }
}, '#config-status');

$('#compose-form').onsubmit = handled(async event => {
  event.preventDefault();
  if (sending || configuring) return;
  if (activeAttempt) { await submitAttempt(); return; }
  if (!settings?.enabled) throw new Error('Save and enable your sender before sending.');
  pendingDraft = { to: $('#recipient').value.trim(), subject: $('#subject').value, body: $('#message-body').value, from: settings.from, helo: settings.helo };
  $('#review-from').textContent = pendingDraft.from;
  $('#review-to').textContent = pendingDraft.to;
  $('#review-subject').textContent = pendingDraft.subject;
  $('#confirm-send').showModal();
}, '#send-status');

function closeReview() { pendingDraft = null; $('#confirm-send').close(); }
$('#confirm-close').onclick = closeReview;
$('#confirm-cancel').onclick = closeReview;
$('#confirm-send').addEventListener('cancel', () => { pendingDraft = null; });

$('#confirm-form').onsubmit = handled(async event => {
  event.preventDefault();
  if (!pendingDraft || activeAttempt || sending || configuring) return;
  activeAttempt = { ...pendingDraft, request_id: crypto.randomUUID(), status: null };
  pendingDraft = null; $('#confirm-send').close(); updateControls();
  await submitAttempt();
}, '#send-status');

async function submitAttempt() {
  if (!activeAttempt || sending) return;
  const attempt = activeAttempt, version = sessionVersion;
  sending = true; updateControls();
  feedback('#send-status', 'Checking the send attempt with the recipient’s mail server…');
  try {
    const result = await api('/api/internet/send', { to: attempt.to, subject: attempt.subject, body: attempt.body, request_id: attempt.request_id, confirmed_from: attempt.from, confirmed_helo: attempt.helo });
    if (version !== sessionVersion || attempt !== activeAttempt) return;
    showAttempt(result.message, !!result.replayed);
    try { await refresh(); } catch (error) { if (!obsolete(error)) feedback('#page-status', 'Send history could not be refreshed. Your message result above is preserved.', 'error'); }
  } catch (error) {
    if (obsolete(error) || version !== sessionVersion) return;
    feedback('#send-status', error.responseReceived
      ? error.message + ' Your unchanged draft and send attempt are preserved. Check the attempt to retrieve its existing result.'
      : 'Delivery uncertain — check recipient before sending again. Your unchanged draft and send attempt are preserved. Use “Check send attempt” to retrieve the existing result.', error.responseReceived ? 'error' : 'uncertain');
  } finally { if (version === sessionVersion) { sending = false; updateControls(); } }
}

$('#new-message').onclick = () => {
  if (sending) return;
  if (activeAttempt && !['ACCEPTED', 'FAILED'].includes(activeAttempt.status) && !confirm('This send attempt may still be accepted by the recipient’s mail server. Check with the recipient before sending again. Starting a new message creates a new send attempt and could produce a duplicate. Start a new message?')) return;
  activeAttempt = null; pendingDraft = null; $('#compose-form').reset(); feedback('#send-status'); feedback('#config-status');
  if (settings) renderSettings(settings, true); else updateControls();
  $('#recipient').focus();
};
