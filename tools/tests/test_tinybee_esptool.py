import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import tinybee_esptool as uploader


class Port:
    _dtr_state = True
    _rts_state = True

    @property
    def dtr(self):
        return self._dtr_state

    @property
    def rts(self):
        return self._rts_state


class Control:
    def __init__(self, initial=3):
        self.initial = initial
        self.writes = []

    def read(self):
        return self.initial

    def write(self, value):
        self.writes.append(value)


class ResetTest(unittest.TestCase):
    def test_boot_transition_is_single_request_and_cache_matches_idle(self):
        port, control, waits = Port(), Control(), []
        uploader.simultaneous_reset(port, control, waits.append)
        self.assertEqual(control.writes, [2, 1, 0])
        self.assertEqual(waits, [0.2, 0.3])
        self.assertFalse(port.dtr)
        self.assertFalse(port.rts)

    def test_unknown_register_layout_is_never_written(self):
        control = Control(initial=0x13)
        with self.assertRaises(uploader.UnsupportedModemControl):
            uploader.simultaneous_reset(Port(), control, lambda _: None)
        self.assertEqual(control.writes, [])

    def test_interrupt_releases_reset_lines(self):
        port, control = Port(), Control()
        def interrupt(_):
            raise KeyboardInterrupt
        with self.assertRaises(KeyboardInterrupt):
            uploader.simultaneous_reset(port, control, interrupt)
        self.assertEqual(control.writes, [2, 0])
        self.assertFalse(port.dtr)
        self.assertFalse(port.rts)

    def test_non_windows_never_selects_windows_control(self):
        with patch.object(uploader.os, 'name', 'posix'):
            self.assertFalse(uploader.is_windows_ch340(Port()))


if __name__ == '__main__':
    unittest.main()
