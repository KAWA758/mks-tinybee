// Fake FluidNC on a fake Web Serial port, for trying the page without the board.
// Loaded by app.js when the URL has ?sim. Models only what the page uses:
// boot Alarm, $X, $MD, $Bye, $/axes queries, $J jogs with soft limits, ?, !, ~, 0x85, Ctrl-X.

import { AXES } from './grbl.js';

const PROFILE = { max_rate_mm_per_min: '120.000', max_travel_mm: '10.000', soft_limits: 'true',
  'homing/mpos_mm': '-5.000', 'homing/positive_direction': 'false' };
const MIN = -5, MAX = 5, ACCEL = 10;
// Like the real board: 256-byte receive buffer, lines handled one at a time.
// Overflow wedges input, as seen on the TinyBee, and is reported as an error.
const RX_SIZE = 256, LINE_MS = 5;

class FakeFluidNC {
  constructor(emit) {
    this.emit = emit;
    this.boot();
    setInterval(() => this.step(0.02), 20);
    setInterval(() => this.nextLine(), LINE_MS);
  }

  boot() {
    this.pos = [0, 0, 0];
    this.queue = [];      // {target, feed}
    this.speed = 0;
    this.state = 'Alarm';
    this.rx = [];
    this.wedged = false;
    this.emit("\r\nGrbl 4.1 [FluidNC v4.1.1 (sim) '$' for help]\r\n[MSG:INFO: ALARM: Unhomed]\r\nALARM:14\r\n");
  }

  receive(bytes) {
    for (const b of bytes) {
      if (b === 0x3f) this.status();
      else if (b === 0x85 || (b === 0x21 && this.state === 'Jog')) this.cancel();
      else if (b === 0x21) this.state = this.state === 'Idle' ? 'Hold' : this.state;
      else if (b === 0x7e && this.state === 'Hold') this.state = 'Idle';
      else if (b === 0x18) this.reset();
      else if (this.rx.length >= RX_SIZE) {
        if (!this.wedged) console.error('sim: board receive buffer overflow; board stops answering');
        this.wedged = true;
      } else this.rx.push(b);
    }
  }

  nextLine() {
    if (this.wedged) return;
    const end = this.rx.indexOf(0x0a);
    if (end < 0) return;
    const line = String.fromCharCode(...this.rx.splice(0, end + 1)).trim();
    this.command(line);
  }

  status() {
    this.emit('<' + this.state + '|MPos:' + this.pos.map(p => p.toFixed(3)).join(',') + '|FS:' +
      Math.round(this.speed * 60) + ',0>\r\n');
  }

  reply(text) { this.emit(text + '\r\n'); }

  command(line) {
    if (!line) return this.reply('ok');
    let m;
    if (line === '$X') {
      if (this.state === 'Alarm') { this.state = 'Idle'; this.reply('[MSG:Caution: Unlocked]'); }
      return this.reply('ok');
    }
    if (line === '$MD') return this.reply('ok');
    if (line === '$Bye') { this.reply('ok'); return setTimeout(() => this.boot(), 300); }
    if ((m = /^\$\/axes\/([xyz])\/([\w/]+)$/i.exec(line))) {
      this.reply('$/axes/' + m[1] + '/' + m[2] + '=' + PROFILE[m[2].toLowerCase()]);
      return this.reply('ok');
    }
    if (line.startsWith('$J=')) {
      if (!['Idle', 'Jog'].includes(this.state)) return this.reply('error:9');
      const words = Object.fromEntries([...line.slice(3).matchAll(/([A-Z])(-?[\d.]+)/g)].map(w => [w[1], Number(w[2])]));
      const relative = /G91/.test(line);
      const from = this.queue.length ? this.queue[this.queue.length - 1].target : this.pos;
      const target = AXES.map((a, i) => {
        const t = a in words ? (relative ? from[i] + words[a] : words[a]) : from[i];
        return Math.min(MAX, Math.max(MIN, t));  // FluidNC clips jogs to soft limits
      });
      this.queue.push({ target, feed: (words.F ?? 60) / 60 });
      this.state = 'Jog';
      return this.reply('ok');
    }
    return this.reply('ok');
  }

  cancel() {
    // Real FluidNC decelerates; dropping the queue is close enough here.
    this.queue = [];
    this.speed = 0;
    if (this.state === 'Jog') this.state = 'Idle';
  }

  reset() {
    const moving = this.state === 'Jog';
    this.queue = [];
    this.speed = 0;
    if (moving) { this.state = 'Alarm'; this.reply('ALARM:3'); }
  }

  step(dt) {
    const seg = this.queue[0];
    if (!seg) { if (this.state === 'Jog') this.state = 'Idle'; this.speed = 0; return; }
    const delta = seg.target.map((t, i) => t - this.pos[i]);
    const dist = Math.hypot(...delta);
    this.speed = Math.min(seg.feed, this.speed + ACCEL * dt);
    const d = this.speed * dt;
    if (dist <= d) { this.pos = seg.target.slice(); this.queue.shift(); return; }
    this.pos = this.pos.map((p, i) => p + delta[i] * d / dist);
  }
}

class FakePort extends EventTarget {
  async open() {
    let controller;
    this.readable = new ReadableStream({ start: c => { controller = c; } });
    const enc = new TextEncoder();
    this.board = new FakeFluidNC(text => { try { controller.enqueue(enc.encode(text)); } catch {} });
    this.writable = new WritableStream({ write: chunk => this.board.receive(chunk) });
    this.controller = controller;
  }
  async setSignals() {}
  async close() { try { this.controller.close(); } catch {} }
  getInfo() { return { usbVendorId: 0x1a86, usbProductId: 0x7523 }; }
}

const fake = new EventTarget();
fake.requestPort = async () => new FakePort();
fake.getPorts = async () => [];
Object.defineProperty(navigator, 'serial', { value: fake, configurable: true });
