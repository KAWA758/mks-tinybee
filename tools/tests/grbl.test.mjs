import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLine, parseStatus, axisProfile, jogLine, shapeStick, gamepadInput } from '../../web/grbl.js';

test('status line from the board', () => {
  const s = parseStatus('<Idle|MPos:0.000,0.000,0.506|FS:0,0>');
  assert.equal(s.state, 'Idle');
  assert.deepEqual(s.mpos, [0, 0, 0.506]);
  assert.equal(s.feed, 0);
  assert.equal(parseStatus('<Hold:0|WPos:1,2,3|WCO:0,0,1>').sub, '0');
});

test('line classification', () => {
  assert.equal(classifyLine('ok').type, 'ok');
  assert.deepEqual(classifyLine('error:9'), { type: 'error', code: 9 });
  assert.deepEqual(classifyLine('ALARM:14'), { type: 'alarm', code: 14 });
  assert.equal(classifyLine("Grbl 4.1 [FluidNC v4.1.1 (esp32-wifi) '$' for help]").type, 'banner');
  assert.deepEqual(classifyLine('$/axes/x/max_rate_mm_per_min=120.000'),
    { type: 'setting', axis: 'X', key: 'max_rate_mm_per_min', value: '120.000' });
  assert.deepEqual(classifyLine('[MSG:INFO: ALARM: Unhomed]'), { type: 'msg', text: 'INFO: ALARM: Unhomed' });
  assert.equal(classifyLine('[MSG:RST]').type, 'msg');
});

test('soft-limit window matches the repo config', () => {
  const p = axisProfile({ max_rate_mm_per_min: '120.000', max_travel_mm: '10.000', soft_limits: 'true',
    'homing/mpos_mm': '-5.000', 'homing/positive_direction': 'false' });
  assert.deepEqual(p, { maxRate: 2, softLimits: true, min: -5, max: 5 });
});

test('jog line uses vector feed and skips idle axes', () => {
  assert.equal(jogLine({ Z: 2 }, 0.1), '$J=G91 G21 Z0.2000 F120.000');
  assert.equal(jogLine({ X: 0.3, Y: -0.4 }, 0.1), '$J=G91 G21 X0.0300 Y-0.0400 F30.000');
  assert.equal(jogLine({ X: 0, Y: 0, Z: 0 }, 0.1), null);
});

test('stick dead zone and curve', () => {
  assert.equal(shapeStick(0.1), 0);
  assert.equal(shapeStick(1), 1);
  assert.equal(shapeStick(-1), -1);
  assert.ok(shapeStick(0.5) < 0.5);
});

test('gamepad needs the enable button and maps sticks', () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  const pad = { axes: [1, -1, 0, 0], buttons };
  let r = gamepadInput(pad, 2);
  assert.equal(r.enabled, false);
  assert.deepEqual(r.v, { X: 2, Y: 0, Z: 2 });
  buttons[4].pressed = true;
  r = gamepadInput(pad, 2);
  assert.equal(r.enabled, true);
  assert.equal(r.active, true);
});
