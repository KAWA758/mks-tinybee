import contextlib
import io
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import serial_check


class FakeBoard:
    """FluidNC-like port: 256-byte receive buffer, one line handled per read."""

    def __init__(self):
        self.rx, self.tx, self.wedged = b'', b'', False

    def write(self, data):
        if data == b'?':
            self.tx += b'<Alarm|MPos:0.000,0.000,0.000|FS:0,0>\r\n'
        elif len(self.rx) + len(data) > 256:
            self.wedged = True
        else:
            self.rx += data

    @property
    def in_waiting(self):
        return len(self.tx)

    def read(self, n):
        if not self.wedged and b'\n' in self.rx:
            line, self.rx = self.rx.split(b'\n', 1)
            m = re.match(rb'\$/axes/(\w)/(.+)', line)
            self.tx += b'$/axes/' + m.group(1) + b'/' + m.group(2) + b'=1\r\nok\r\n'
        data, self.tx = self.tx[:n], self.tx[n:]
        return data


class SerialCheckTest(unittest.TestCase):
    def run_check(self, burst):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = serial_check.run(FakeBoard(), burst=burst, timeout=0.5)
        return code, out.getvalue()

    def test_paced_queries_all_answered(self):
        code, out = self.run_check(burst=False)
        self.assertEqual(code, 0, out)
        self.assertIn('15 of 15 answered', out)
        self.assertIn('<Alarm|MPos', out)

    def test_burst_overflows_like_the_old_page(self):
        code, out = self.run_check(burst=True)
        self.assertEqual(code, 1, out)
        self.assertIn('FAIL', out)


if __name__ == '__main__':
    unittest.main()
