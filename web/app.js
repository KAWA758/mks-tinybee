import { AXES, RT, PROFILE_KEYS, axisProfile, classifyLine, gamepadInput, jogLine } from './grbl.js';

// Jog streaming (Grbl "joystick jogging"): short increments of JOG_DT seconds,
// at most JOG_INFLIGHT unacknowledged, then 0x85 on release.
const JOG_DT = 0.1;
const JOG_INFLIGHT = 3;
// Character counting: FluidNC's UART receive buffer is 256 bytes (esp32/fnc_uart.cpp).
// Bursting more than that overflows it and the board stops answering, so lines
// wait in an outbox until the unacknowledged bytes fit in RX_BUDGET.
const RX_BUDGET = 127;
const STATUS_MS = 200;
const REPLY_TIMEOUT_MS = 5000;
// Shown in the console so a stale cached copy of the page is easy to spot.
const VERSION = 'web 5 (paced, waits for board)';
const CH340 = { usbVendorId: 0x1a86, usbProductId: 0x7523 };
const NAMES = { Z: 'Base', X: 'Joint 1', Y: 'Joint 2' };

const $ = sel => document.querySelector(sel);
const encoder = new TextEncoder();

const s = {
  port: null, writer: null, reader: null, writeChain: Promise.resolve(),
  outbox: [],              // line commands not yet sent
  pending: [],             // sent line commands awaiting ok/error, oldest first
  status: { state: 'Disconnected' }, wco: [0, 0, 0], pos: null,
  settings: { X: {}, Y: {}, Z: {} }, profile: {},
  armed: false, held: { X: 0, Y: 0, Z: 0 },
  jogging: false, waitIdle: false, // after a cancel, wait for Idle before the next jog
  gamepad: null, timers: [],
};

// ---------- serial ----------

function writeBytes(bytes) {
  if (!s.writer) return;
  s.writeChain = s.writeChain.then(() => s.writer.write(bytes)).catch(err => log('write failed: ' + err.message, 'err'));
}

function realtime(byte) { writeBytes(Uint8Array.of(byte)); }

function sendLine(line, { jog = false, quiet = false } = {}) {
  if (!s.writer) {
    if (!quiet) log('not connected — click Connect first (' + line + ' not sent)', 'err');
    return;
  }
  s.outbox.push({ line, jog, quiet, bytes: encoder.encode(line + '\n') });
  if (!quiet) log('> ' + line, 'tx');
  pump();
}

function pump() {
  let used = s.pending.reduce((n, p) => n + p.bytes.length, 0);
  while (s.writer && s.outbox.length && (used === 0 || used + s.outbox[0].bytes.length <= RX_BUDGET)) {
    const item = s.outbox.shift();
    item.at = performance.now();
    s.pending.push(item);
    used += item.bytes.length;
    writeBytes(item.bytes);
  }
}

function queued() { return [...s.pending, ...s.outbox]; }

async function connect() {
  if (!('serial' in navigator)) {
    alert('This browser has no Web Serial. Use Chrome or Edge, opened via http://localhost.');
    return;
  }
  let port;
  try {
    port = await navigator.serial.requestPort({ filters: [CH340] });
  } catch { return; }  // chooser cancelled
  try {
    await port.open({ baudRate: 115200 });
  } catch (err) {
    alert('Cannot open the port: ' + err.message + '\nClose pio device monitor or any other program using it.');
    return;
  }
  // Leave DTR/RTS as open() set them, like pio device monitor. setSignals changes
  // them one at a time, which pulses EN through the auto-reset circuit and
  // resets the ESP32 (see docs/windows-upload.md).
  s.port = port;
  s.writer = port.writable.getWriter();
  s.pending = [];
  s.outbox = [];
  s.status = { state: 'Connecting' };
  log('connected — ' + VERSION, 'sys');
  readLoop(port);
  s.timers.push(setInterval(() => realtime(RT.status), STATUS_MS));
  s.timers.push(setInterval(jogTick, JOG_DT * 1000));
  realtime(RT.status);  // the profile is queried once the board answers, see onStatus
  render();
  setTimeout(() => {
    if (s.port === port && s.status.state === 'Connecting')
      log('The board is not answering. Click Disconnect, press RESET on the TinyBee (replugging USB is not enough while the main supply is on), then Connect again.', 'err');
  }, 3000);
}

async function disconnect(reason) {
  stopJog();
  s.timers.forEach(clearInterval);
  s.timers = [];
  const { port, reader, writer } = s;
  s.port = s.reader = s.writer = null;
  try { await reader?.cancel(); } catch {}
  try { await s.writeChain; writer?.releaseLock(); } catch {}
  try { await port?.close(); } catch {}
  s.pending = [];
  s.outbox = [];
  disarm();
  s.status = { state: 'Disconnected' };
  s.pos = null;
  log('disconnected' + (reason ? ': ' + reason : ''), 'sys');
  render();
}

async function readLoop(port) {
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (port.readable && s.port === port) {
      s.reader = port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await s.reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          let i;
          while ((i = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, i).replace(/\r$/, '');
            buffer = buffer.slice(i + 1);
            if (line) handleLine(line);
          }
        }
      } finally {
        s.reader?.releaseLock();
      }
    }
  } catch (err) {
    if (s.port === port) disconnect(err.message);
  }
}

// ---------- protocol ----------

function handleLine(line) {
  const msg = classifyLine(line);
  switch (msg.type) {
    case 'status':
      onStatus(msg.status);
      return;  // too frequent to log
    case 'ok':
    case 'error': {
      const done = s.pending.shift();
      if (msg.type === 'error') {
        log(line + (done ? '  (for: ' + done.line + ')' : ''), 'err');
        if (done?.jog) stopJog();
      } else if (done && !done.jog && !done.quiet) {
        log(line, 'rx');
      }  // an ok with nothing pending answers a line sent before a board restart
      pump();
      return;
    }
    case 'alarm':
      log(line + alarmHint(msg.code), 'err');
      stopJog();
      disarm();
      return;
    case 'banner':
      // Board restarted: queued commands are gone and position is unknown.
      s.pending = [];
      s.outbox = [];
      stopJog();
      disarm();
      log(line, 'sys');
      queryProfile();
      return;
    case 'setting':
      s.settings[msg.axis][msg.key] = msg.value;
      if (PROFILE_KEYS.every(k => k in s.settings[msg.axis])) {
        s.profile[msg.axis] = axisProfile(s.settings[msg.axis]);
        updateSpeedRange();
        render();
      }
      return;
    default:
      log(line, 'rx');
  }
}

function alarmHint(code) {
  if (code === 14) return '  — position not confirmed; use the reference steps, then Unlock';
  if (code === 3) return '  — reset during motion; position may be lost, set the reference again';
  if (code === 2) return '  — soft limit; target was outside the allowed window';
  return '';
}

function onStatus(status) {
  if (status.wco) s.wco = status.wco;
  s.pos = status.mpos ?? status.wpos?.map((w, i) => w + s.wco[i]) ?? s.pos;
  const first = s.status.state === 'Connecting';
  s.status = status;
  if (first) queryProfile();
  if (s.waitIdle && status.state === 'Idle' && !queued().some(p => p.jog)) s.waitIdle = false;
  if (s.armed && !['Idle', 'Jog'].includes(status.state)) disarm();
  render();
}

function queryProfile() {
  s.settings = { X: {}, Y: {}, Z: {} };
  s.profile = {};
  for (const axis of AXES)
    for (const key of PROFILE_KEYS) sendLine('$/axes/' + axis.toLowerCase() + '/' + key, { quiet: true });
}

// ---------- jogging ----------

function speed() { return Number($('#speed').value); }

function velocity() {
  const v = { X: 0, Y: 0, Z: 0 };
  let active = false;
  for (const axis of AXES) if (s.held[axis]) { v[axis] = s.held[axis] * speed(); active = true; }
  if (s.gamepad?.enabled && s.gamepad.active) {
    for (const axis of AXES) if (!s.held[axis] && s.gamepad.v[axis]) { v[axis] = s.gamepad.v[axis]; active = true; }
  }
  return active ? v : null;
}

function jogTick() {
  pollGamepad();
  const v = s.armed ? velocity() : null;
  if (!v) {
    if (s.jogging) stopJog();
    return;
  }
  if (s.waitIdle || !['Idle', 'Jog'].includes(s.status.state)) return;
  if (queued().some(p => !p.jog)) return;  // let typed commands finish first
  if (s.outbox.length || s.pending.length >= JOG_INFLIGHT) return;
  const line = jogLine(v, JOG_DT);
  if (!line) return;
  sendLine(line, { jog: true, quiet: true });
  s.jogging = true;
}

function stopJog() {
  s.outbox = s.outbox.filter(p => !p.jog);
  if (s.jogging || s.status.state === 'Jog') {
    realtime(RT.jogCancel);
    s.waitIdle = true;
  }
  s.jogging = false;
}

function stopAll() {
  s.outbox = s.outbox.filter(p => !p.jog);
  realtime(RT.jogCancel);
  if (s.status.state === 'Run') realtime(RT.hold);  // a G-code move, not a jog
  s.held = { X: 0, Y: 0, Z: 0 };
  s.jogging = false;
  s.waitIdle = true;
  disarm();
  log('STOP', 'err');
}

function arm() {
  if (!s.port || !['Idle', 'Jog'].includes(s.status.state)) return;
  s.armed = true;
  render();
}

function disarm() {
  s.armed = false;
  s.held = { X: 0, Y: 0, Z: 0 };
  render();
}

// ---------- gamepad ----------

function pollGamepad() {
  const pad = [...(navigator.getGamepads?.() ?? [])].find(p => p && p.connected);
  if (!pad) { s.gamepad = null; return; }
  s.gamepad = { id: pad.id, ...gamepadInput(pad, speed()) };
}

// ---------- UI ----------

function log(text, kind = 'rx') {
  const box = $('#log');
  const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 4;
  const row = document.createElement('div');
  row.className = kind;
  row.textContent = text;
  box.append(row);
  while (box.childElementCount > 400) box.firstChild.remove();
  if (atBottom) box.scrollTop = box.scrollHeight;
}

function buildJoints() {
  const tpl = $('#joint-tpl');
  for (const axis of ['Z', 'X', 'Y']) {
    const el = tpl.content.firstElementChild.cloneNode(true);
    el.dataset.axis = axis;
    el.querySelector('.name').textContent = NAMES[axis];
    el.querySelector('.axis').textContent = axis;
    for (const btn of el.querySelectorAll('.hold')) {
      const dir = Number(btn.dataset.dir);
      const release = () => { s.held[axis] = 0; btn.classList.remove('down'); };
      btn.addEventListener('pointerdown', e => {
        if (!s.armed) return;
        try { btn.setPointerCapture(e.pointerId); } catch {}
        s.held[axis] = dir;
        btn.classList.add('down');
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, release);
    }
    $('#joints').append(el);
  }
}

function updateSpeedRange() {
  const rates = AXES.map(a => s.profile[a]?.maxRate).filter(Boolean);
  if (!rates.length) return;
  const slider = $('#speed');
  slider.max = Math.min(...rates).toFixed(2);
  if (Number(slider.value) > Number(slider.max)) slider.value = slider.max;
}

function render() {
  const connected = !!s.port;
  const state = s.status.state;
  $('#connect').textContent = connected ? 'Disconnect' : 'Connect';
  $('#state').textContent = state + (s.status.sub ? ':' + s.status.sub : '');
  $('#state').dataset.state = state;
  $('#reference').hidden = !(connected && state === 'Alarm');
  $('#resume').hidden = state !== 'Hold';
  $('#arm').disabled = !connected || !['Idle', 'Jog'].includes(state);
  $('#arm').textContent = s.armed ? 'Motion enabled' : 'Enable motion';
  $('#arm').classList.toggle('on', s.armed);
  $('#zero').disabled = !s.armed;
  $('#speed-value').textContent = speed().toFixed(2) + ' °/s';
  document.body.classList.toggle('armed', s.armed);

  for (const el of document.querySelectorAll('.joint')) {
    const axis = el.dataset.axis;
    const i = AXES.indexOf(axis);
    const value = s.pos?.[i];
    el.querySelector('.value').textContent = value == null ? '—' : value.toFixed(3) + '°';
    const p = s.profile[axis];
    const bar = el.querySelector('.bar');
    bar.hidden = !(p && p.softLimits && value != null);
    if (!bar.hidden) {
      const t = Math.min(1, Math.max(0, (value - p.min) / (p.max - p.min)));
      bar.querySelector('.marker').style.left = (t * 100).toFixed(1) + '%';
      bar.querySelector('.min').textContent = p.min.toFixed(1) + '°';
      bar.querySelector('.max').textContent = p.max.toFixed(1) + '°';
    }
    for (const btn of el.querySelectorAll('.hold')) btn.disabled = !s.armed;
  }

  const g = s.gamepad;
  $('#pad').textContent = g
    ? g.id.replace(/\s*\(.*\)$/, '') + (g.enabled ? ' — enable held' : ' — hold LB or RB to move')
    : 'No gamepad (press any button on it to wake it)';
  $('#pad').classList.toggle('on', !!g?.enabled);
}

function confirmThen(question, action) {
  if (confirm(question)) action();
}

function bind() {
  $('#connect').addEventListener('click', () => (s.port ? disconnect() : connect()));
  $('#stop').addEventListener('click', stopAll);
  $('#resume').addEventListener('click', () => realtime(RT.resume));
  $('#arm').addEventListener('click', () => (s.armed ? disarm() : arm()));
  $('#speed').addEventListener('input', render);
  $('#zero').addEventListener('click', () => sendLine('$J=G90 G21 X0 Y0 Z0 F' + (speed() * 60).toFixed(3)));
  $('#motors-off').addEventListener('click', () => confirmThen(
    'Turn the motors off ($MD)? The arm can drop — support it first.', () => sendLine('$MD')));
  $('#restart').addEventListener('click', () => confirmThen(
    'Restart the board ($Bye)? The current pose becomes position 0.', () => sendLine('$Bye')));
  $('#unlock').addEventListener('click', () => confirmThen(
    'Is the arm exactly at the marked reference pose? Unlocking ($X) trusts the current position.', () => sendLine('$X')));
  $('#reset').addEventListener('click', () => confirmThen(
    'Soft reset (Ctrl-X)? Motion stops at once and the position may be lost.', () => realtime(RT.reset)));
  $('#console').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#cmd');
    const line = input.value.trim();
    if (!line) return;
    if (!s.writer) log('not connected — click Connect first (' + line + ' not sent)', 'err');
    else if (line === '?' || line === '!' || line === '~') realtime(line.charCodeAt(0));
    else sendLine(line);
    input.value = '';
  });

  // Anything that may hide a release from us stops motion.
  window.addEventListener('blur', () => { if (s.armed) { stopJog(); disarm(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && s.armed) { stopJog(); disarm(); } });
  window.addEventListener('keydown', e => {
    if (e.target instanceof Element && e.target.closest('input')) return;
    if (e.code === 'Space' || e.code === 'Escape') { e.preventDefault(); stopAll(); }
  });
  navigator.serial?.addEventListener('disconnect', e => { if (e.target === s.port) disconnect('USB unplugged'); });

  // Typed commands that never get an answer would block jogging forever.
  setInterval(() => {
    const first = s.pending[0];
    if (first && performance.now() - first.at > REPLY_TIMEOUT_MS) {
      // Everything still queued is unanswered too; drop it in one go, never resend.
      const lost = queued().filter(p => !p.quiet).map(p => p.line);
      log('The board stopped answering commands (waited for "' + first.line + '"' +
        (lost.length ? '; not sent: ' + lost.join(', ') : '') +
        '). Disconnect, press RESET on the TinyBee, then Connect again.', 'err');
      s.pending = [];
      s.outbox = [];
    }
  }, 1000);
  setInterval(() => { if (!s.port) { pollGamepad(); render(); } }, 250);
}

if (new URLSearchParams(location.search).has('sim')) {
  await import('./sim.js');
  document.title += ' (simulator)';
}
buildJoints();
bind();
render();
if (!('serial' in navigator)) log('Web Serial is not available here. Use Chrome or Edge at http://localhost.', 'err');
