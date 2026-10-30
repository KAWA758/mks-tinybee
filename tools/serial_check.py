"""Replay the web page's connect sequence over serial, without a browser.

Sends a status request and the page's 15 setting queries, paced with the same
Grbl character counting (127 bytes unacknowledged), then reports the replies.
--burst sends the queries all at once like the old page did; on the TinyBee
that overflows FluidNC's 256-byte receive buffer, so press RESET afterwards.
Run with a Python that has pyserial, e.g. PlatformIO's penv.
"""
import argparse
import sys
import time

AXES = 'xyz'
KEYS = ['max_rate_mm_per_min', 'max_travel_mm', 'soft_limits', 'homing/mpos_mm', 'homing/positive_direction']
RX_BUDGET = 127


class Board:
    def __init__(self, port):
        self.port = port
        self.buffer = b''

    def lines(self, seconds):
        """Yield complete reply lines arriving within the given time."""
        end = time.time() + seconds
        while time.time() < end:
            self.buffer += self.port.read(self.port.in_waiting or 1)
            while b'\n' in self.buffer:
                line, self.buffer = self.buffer.split(b'\n', 1)
                line = line.decode('utf-8', 'replace').strip()
                if line:
                    yield line


def queries():
    return ['$/axes/{}/{}'.format(axis, key) for axis in AXES for key in KEYS]


def run(port, burst=False, timeout=5.0):
    board = Board(port)
    print('--- status request (?)')
    port.write(b'?')
    status = next((l for l in board.lines(2) if l.startswith('<')), None)
    print(status or 'no status reply')

    print('--- 15 setting queries, ' + ('all at once' if burst else 'paced to {} bytes'.format(RX_BUDGET)))
    outbox = [(q, (q + '\n').encode()) for q in queries()]
    pending, answered, last_reply = [], 0, time.time()
    if burst:
        for _, data in outbox:
            port.write(data)
        pending, outbox = outbox, []
    while pending or outbox:
        while outbox and (not pending or sum(len(d) for _, d in pending) + len(outbox[0][1]) <= RX_BUDGET):
            pending.append(outbox.pop(0))
            port.write(pending[-1][1])
        for line in board.lines(0.1):
            if line == 'ok' or line.startswith('error:'):
                query, _ = pending.pop(0)
                answered += line == 'ok'
                last_reply = time.time()
                if line != 'ok':
                    print('{} -> {}'.format(query, line))
            elif not line.startswith('<'):
                print(line)
        if time.time() - last_reply > timeout:
            print('no reply for {:.0f} s; {} queries unanswered'.format(timeout, len(pending) + len(outbox)))
            break
    print('--- {} of 15 answered'.format(answered))
    if answered == 15:
        print('PASS: the board handles the page\'s connect sequence')
        return 0
    print('FAIL: the board stopped answering. Press RESET on the TinyBee before the next try.')
    return 1


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--port', required=True)
    parser.add_argument('--burst', action='store_true', help='send all queries at once (old page behaviour)')
    options = parser.parse_args()
    import serial
    # pyserial asserts DTR and RTS together on open, like pio device monitor: no reset.
    with serial.Serial(options.port, 115200, timeout=0.05) as port:
        time.sleep(0.2)
        port.reset_input_buffer()
        return run(port, options.burst)


if __name__ == '__main__':
    sys.exit(main())
