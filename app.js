// VenuxMail — static, no-backend version, powered by the free mail.tm API.
// Everything runs client-side: generate an address, poll for mail, and
// "save for later" via a portable recovery code (no server, no database).

const API = 'https://api.mail.tm';
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

const ADJECTIVES = ['amber','brisk','coral','dusky','ember','fable','giddy','hazel','jolly','keen','lunar','mellow','nimble','onyx','plume','quiet','rusty','sable','tidal','umber','violet','willow','zesty'];
const NOUNS = ['otter','falcon','sparrow','cinder','harbor','lantern','meadow','thistle','compass','quartz','raven','anchor','orchid','pigeon','satchel','timber','brook','cobalt','wisp','dune','ridge'];

const state = {
  address: null,
  password: null,
  token: null,
  saved: false,
  pollTimer: null
};

const el = {
  addressText: document.getElementById('addressText'),
  statusLabel: document.getElementById('statusLabel'),
  copyBtn: document.getElementById('copyBtn'),
  newBtn: document.getElementById('newBtn'),
  saveBtn: document.getElementById('saveBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  saveCodeMsg: document.getElementById('saveCodeMsg'),
  messageList: document.getElementById('messageList'),
  emptyState: document.getElementById('emptyState'),
  inboxCount: document.getElementById('inboxCount'),
  postmark: document.getElementById('postmark'),
  ringProgress: document.getElementById('ringProgress'),
  restoreToggle: document.getElementById('restoreToggle'),
  restorePanel: document.getElementById('restorePanel'),
  restoreInput: document.getElementById('restoreInput'),
  restoreSubmit: document.getElementById('restoreSubmit'),
  restoreHint: document.getElementById('restoreHint'),
  overlay: document.getElementById('messageOverlay'),
  closeMessage: document.getElementById('closeMessage'),
  msgFrom: document.getElementById('msgFrom'),
  msgSubject: document.getElementById('msgSubject'),
  msgTime: document.getElementById('msgTime'),
  msgBody: document.getElementById('msgBody')
};

el.ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);
el.ringProgress.style.strokeDashoffset = '0'; // full ring; mail.tm addresses don't auto-expire

function randomLocalPart() {
  // Plain letters + digits only, no hyphens or other special characters.
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const d = Math.floor(100 + Math.random() * 900);
  return `${a}${n}${d}`;
}

function randomPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) + '!Aa1';
}

async function mtFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.message || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

// ---------- inbox lifecycle ----------

async function createInbox() {
  el.addressText.textContent = 'generating…';
  el.statusLabel.textContent = 'generating your inbox…';

  const domains = await mtFetch('/domains');
  const domain = (domains['hydra:member'] || domains.member || domains).find(d => d.isActive !== false);
  const domainName = domain.domain;

  const address = `${randomLocalPart()}@${domainName}`;
  const password = randomPassword();

  await mtFetch('/accounts', {
    method: 'POST',
    body: JSON.stringify({ address, password })
  });

  const tokenRes = await mtFetch('/token', {
    method: 'POST',
    body: JSON.stringify({ address, password })
  });

  state.address = address;
  state.password = password;
  state.token = tokenRes.token;
  state.saved = false;
  persistLocal();
  render();
  startPolling();
}

async function restoreInbox(address, password) {
  const tokenRes = await mtFetch('/token', {
    method: 'POST',
    body: JSON.stringify({ address, password })
  });
  state.address = address;
  state.password = password;
  state.token = tokenRes.token;
  state.saved = true;
  persistLocal();
  render();
  startPolling();
}

function persistLocal() {
  localStorage.setItem('venuxmail_address', state.address || '');
  localStorage.setItem('venuxmail_password', state.password || '');
  localStorage.setItem('venuxmail_saved', state.saved ? '1' : '');
}

function render() {
  el.addressText.textContent = state.address || '…';
  el.postmark.classList.toggle('saved', state.saved);
  el.statusLabel.textContent = state.saved
    ? 'saved address · yours to keep'
    : 'temporary address · new each visit unless saved';
  el.saveBtn.textContent = state.saved ? 'Saved ✓' : 'Save for later';
}

// ---------- polling & messages ----------

function startPolling() {
  clearInterval(state.pollTimer);
  fetchMessages();
  state.pollTimer = setInterval(fetchMessages, 8000);
}

async function fetchMessages() {
  if (!state.token) return;
  try {
    const data = await mtFetch('/messages');
    const messages = data['hydra:member'] || data.member || [];
    renderMessages(messages);
  } catch (err) {
    // token may have expired after a long idle period; silently retry next tick
  }
}

function renderMessages(messages) {
  el.inboxCount.textContent = `${messages.length} message${messages.length === 1 ? '' : 's'}`;
  el.messageList.innerHTML = '';

  if (messages.length === 0) {
    el.messageList.appendChild(el.emptyState);
    return;
  }

  for (const msg of messages) {
    const li = document.createElement('li');
    li.className = 'message-row';
    const fromName = (msg.from && (msg.from.name || msg.from.address)) || 'unknown sender';
    li.innerHTML = `
      <span class="seal-dot ${msg.seen ? 'read' : ''}"></span>
      <div class="msg-meta">
        <div class="msg-from-preview">${escapeHtml(fromName)}</div>
        <div class="msg-subject-preview">${escapeHtml(msg.subject || '(no subject)')}</div>
      </div>
      <span class="msg-time-preview">${formatTime(msg.createdAt)}</span>
    `;
    li.addEventListener('click', () => openMessage(msg.id));
    el.messageList.appendChild(li);
  }
}

async function openMessage(id) {
  if (!id) return; // safety guard: never open an empty overlay
  const msg = await mtFetch(`/messages/${id}`);
  const fromName = (msg.from && (msg.from.name || msg.from.address)) || 'unknown sender';
  el.msgFrom.textContent = fromName;
  el.msgSubject.textContent = msg.subject || '(no subject)';
  el.msgTime.textContent = formatTime(msg.createdAt, true);

  const html = Array.isArray(msg.html) ? msg.html.join('') : msg.html;
  el.msgBody.innerHTML = html
    ? sanitizeHtml(html)
    : `<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(msg.text || '')}</pre>`;

  el.overlay.hidden = false;
  fetchMessages();
}

function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script, style, iframe, object, embed').forEach(n => n.remove());
  template.content.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attr => {
      if (/^on/i.test(attr.name) || attr.value.trim().toLowerCase().startsWith('javascript:')) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return template.innerHTML;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(iso, full = false) {
  const d = new Date(iso);
  return full ? d.toLocaleString() : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------- actions ----------

el.newBtn.addEventListener('click', () => createInbox().catch(showError));

el.copyBtn.addEventListener('click', async () => {
  if (!state.address) return;
  await navigator.clipboard.writeText(state.address);
  el.copyBtn.textContent = 'copied';
  setTimeout(() => (el.copyBtn.textContent = 'copy'), 1200);
});

el.saveBtn.addEventListener('click', () => {
  if (!state.address || state.saved) return;
  state.saved = true;
  persistLocal();
  render();
  const code = btoa(`${state.address}:${state.password}`);
  el.saveCodeMsg.hidden = false;
  el.saveCodeMsg.textContent = `Recovery code — keep this safe, it's the only way back in on another device: ${code}`;
});

el.refreshBtn.addEventListener('click', fetchMessages);

el.restoreToggle.addEventListener('click', () => {
  el.restorePanel.hidden = !el.restorePanel.hidden;
});

el.restoreSubmit.addEventListener('click', async () => {
  const code = el.restoreInput.value.trim();
  if (!code) return;
  try {
    const decoded = atob(code);
    const sep = decoded.lastIndexOf(':');
    const address = decoded.slice(0, sep);
    const password = decoded.slice(sep + 1);
    await restoreInbox(address, password);
    el.restoreHint.textContent = '';
    el.restorePanel.hidden = true;
  } catch (err) {
    el.restoreHint.textContent = 'That recovery code doesn\'t look right.';
  }
});

el.closeMessage.addEventListener('click', () => (el.overlay.hidden = true));
el.overlay.addEventListener('click', (e) => {
  if (e.target === el.overlay) el.overlay.hidden = true;
});

function showError(err) {
  el.statusLabel.textContent = `Something went wrong: ${err.message}`;
}

// ---------- boot ----------

(async function init() {
  el.overlay.hidden = true; // always start with the message popup closed

  const savedAddress = localStorage.getItem('venuxmail_address');
  const savedPassword = localStorage.getItem('venuxmail_password');
  const wasSaved = localStorage.getItem('venuxmail_saved') === '1';

  if (savedAddress && savedPassword) {
    try {
      await restoreInbox(savedAddress, savedPassword);
      state.saved = wasSaved;
      render();
      return;
    } catch (err) {
      // fall through to creating a fresh inbox
    }
  }

  createInbox().catch(showError);
})();
