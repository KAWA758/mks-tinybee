// Pure FluidNC/Grbl helpers: line parsing, jog commands, gamepad mapping.
// No DOM or serial access here, so node --test can cover it.

export const AXES = ['X', 'Y', 'Z'];

// Realtime bytes: sent alone, no newline, executed immediately, no "ok".
export const RT = { status: 0x3f, hold: 0x21, resume: 0x7e, reset: 0x18, jogCancel: 0x85 };

export function parseStatus(line) {
  const fields = line.slice(1, -1).split('|');
  const [state, sub] = fields[0].split(':');
  const status = { state, sub: sub ?? null };
  for (const field of fields.slice(1)) {
    const i = field.indexOf(':');
    if (i < 0) continue;
    const key = field.slice(0, i);
    const values = field.slice(i + 1).split(',').map(Number);
    if (key === 'MPos') status.mpos = values;
    else if (key === 'WPos') status.wpos = values;
    else if (key === 'WCO') status.wco = values;
    else if (key === 'FS' || key === 'F') status.feed = values[0];
  }
  return status;
}

// Setting replies look like "$/axes/x/max_rate_mm_per_min=120.000".
const SETTING = /^\$\/axes\/([xyz])\/([\w/]+)=(.*)$/i;

export function classifyLine(line) {
  if (line === 'ok') return { type: 'ok' };
  let m = /^error:(\d+)/.exec(line);
  if (m) return { type: 'error', code: Number(m[1]) };
  m = /^ALARM:(\d+)/.exec(line);
  if (m) return { type: 'alarm', code: Number(m[1]) };
  if (line.startsWith('<') && line.endsWith('>')) return { type: 'status', status: parseStatus(line) };
  if (/^Grbl \S+ \[FluidNC/.test(line)) return { type: 'banner' };
  m = SETTING.exec(line);
  if (m) return { type: 'setting', axis: m[1].toUpperCase(), key: m[2].toLowerCase(), value: m[3] };
  if (line.startsWith('[MSG:') && line.endsWith(']')) return { type: 'msg', text: line.slice(5, -1) };
  return { type: 'other' };
}

// Queries whose replies fill an axis profile; see axisProfile().
export const PROFILE_KEYS = ['max_rate_mm_per_min', 'max_travel_mm', 'soft_limits', 'homing/mpos_mm', 'homing/positive_direction'];

// Soft-limit window as FluidNC computes it (Limit.cpp), without the one-step slop.
export function axisProfile(settings) {
  const travel = Number(settings.max_travel_mm);
  const mpos = Number(settings['homing/mpos_mm'] ?? 0);
  const positive = (settings['homing/positive_direction'] ?? 'true') === 'true';
  return {
    maxRate: Number(settings.max_rate_mm_per_min) / 60,
    softLimits: settings.soft_limits === 'true',
    min: positive ? mpos - travel : mpos,
    max: positive ? mpos : mpos + travel,
  };
}

// One incremental jog of duration dt for velocities v (units/s per axis).
// F is the vector speed in units/min, so every axis arrives together.
export function jogLine(v, dt) {
  const parts = [];
  let sq = 0;
  for (const axis of AXES) {
    const d = (v[axis] || 0) * dt;
    if (Math.abs(d) < 1e-4) continue;
    parts.push(axis + d.toFixed(4));
    sq += (v[axis] || 0) ** 2;
  }
  if (!parts.length) return null;
  return '$J=G91 G21 ' + parts.join(' ') + ' F' + (Math.sqrt(sq) * 60).toFixed(3);
}

// Stick value -> -1..1 with a dead zone and a squared curve for fine control.
export function shapeStick(x, deadZone = 0.15) {
  const a = Math.abs(x);
  if (a <= deadZone) return 0;
  return Math.sign(x) * ((a - deadZone) / (1 - deadZone)) ** 2;
}

// Standard-mapping gamepad: LB/RB = enable (dead man), left stick X = base (Z),
// left stick Y = joint 1 (X), right stick Y = joint 2 (Y). Stick up is positive.
export const ENABLE_BUTTONS = [4, 5];

export function gamepadInput(pad, speed) {
  const enabled = ENABLE_BUTTONS.some(i => pad.buttons[i]?.pressed);
  const raw = { Z: pad.axes[0] ?? 0, X: -(pad.axes[1] ?? 0), Y: -(pad.axes[3] ?? 0) };
  const v = {};
  let active = false;
  for (const axis of AXES) {
    v[axis] = shapeStick(raw[axis]) * speed;
    if (v[axis]) active = true;
  }
  return { enabled, active, v };
}
