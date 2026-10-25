"""esptool 3.0 launcher with a simultaneous Windows CH340 reset.

The normal esptool reset remains unchanged on other adapters/platforms.
Only UART modem-control lines are changed; flash arguments stay intact.
"""
import argparse
import ctypes
import importlib.util
import os
import sys
import time


class UnsupportedModemControl(Exception):
    pass


class WindowsModemControl:
    def __init__(self, port):
        from ctypes import wintypes
        from serial import win32
        self.port = port
        self.w = wintypes
        self.win32 = win32
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.kernel.DeviceIoControl.argtypes = [
            wintypes.HANDLE, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD,
            wintypes.LPVOID, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), wintypes.LPVOID,
        ]
        self.kernel.DeviceIoControl.restype = wintypes.BOOL
        self.kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        self.kernel.WaitForSingleObject.restype = wintypes.DWORD

    def _ioctl(self, function, value=None):
        out, count = self.w.DWORD(), self.w.DWORD()
        inp = self.w.DWORD(value) if value is not None else None
        ov = self.win32.OVERLAPPED()
        ov.hEvent = self.win32.CreateEvent(None, True, False, None)
        try:
            ok = self.kernel.DeviceIoControl(
                self.port._port_handle, (0x1B << 16) | (function << 2),
                ctypes.byref(inp) if inp is not None else None,
                ctypes.sizeof(inp) if inp is not None else 0,
                ctypes.byref(out) if inp is None else None,
                ctypes.sizeof(out) if inp is None else 0,
                ctypes.byref(count), ctypes.byref(ov),
            )
            if not ok:
                error = ctypes.get_last_error()
                if error != 997:  # ERROR_IO_PENDING
                    raise UnsupportedModemControl('Win32 error {}'.format(error))
                if self.kernel.WaitForSingleObject(ov.hEvent, 2000) != 0:
                    self.win32.CancelIoEx(self.port._port_handle, ctypes.byref(ov))
                    self.win32.GetOverlappedResult(self.port._port_handle, ctypes.byref(ov), ctypes.byref(count), True)
                    raise UnsupportedModemControl('modem control timed out')
                if not self.win32.GetOverlappedResult(self.port._port_handle, ctypes.byref(ov), ctypes.byref(count), True):
                    raise UnsupportedModemControl('modem control failed')
            if inp is None and count.value != ctypes.sizeof(out):
                raise UnsupportedModemControl('unexpected modem-control response')
            return out.value
        finally:
            self.win32.CloseHandle(ov.hEvent)

    def read(self):
        return self._ioctl(37)  # IOCTL_SERIAL_GET_MODEM_CONTROL, ntddser.h

    def write(self, value):
        self._ioctl(38, value)  # IOCTL_SERIAL_SET_MODEM_CONTROL, ntddser.h


def simultaneous_reset(port, control=None, sleep=time.sleep):
    control = control if control is not None else WindowsModemControl(port)
    # MCR layout is driver-specific. Do not write unknown layouts or other bits.
    initial = control.read()
    expected = int(port.dtr) | (int(port.rts) << 1)
    if initial != expected:
        raise UnsupportedModemControl('unexpected MCR layout/state')

    def lines(value):
        control.write(value)
        # Keep pyserial's cache aligned, so later baud changes do not reset us.
        port._dtr_state = bool(value & 1)
        port._rts_state = bool(value & 2)

    try:
        lines(2)  # DTR=0, RTS=1: EN low (reset)
        sleep(0.2)
        lines(1)  # DTR=1, RTS=0: EN high, GPIO0 low, in one driver request
        sleep(0.3)
    finally:
        lines(0)  # release both lines, including on an interrupted delay


def is_windows_ch340(port):
    if os.name != 'nt' or not hasattr(port, '_port_handle'):
        return False
    from serial.tools import list_ports
    name = str(port.port).upper()
    return any(p.device.upper() == name and (p.vid, p.pid) == (0x1A86, 0x7523)
               for p in list_ports.comports())


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--esptool', required=True)
    options, args = parser.parse_known_args()
    spec = importlib.util.spec_from_file_location('tinybee_original_esptool', options.esptool)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    original = module.ESPLoader._connect_attempt

    def connect_attempt(loader, mode='default_reset', esp32r0_delay=False):
        if mode == 'default_reset' and is_windows_ch340(loader._port):
            try:
                simultaneous_reset(loader._port)
            except UnsupportedModemControl as error:
                print('TinyBee: simultaneous reset unavailable ({}); using standard reset'.format(error))
            else:
                print('TinyBee: simultaneous Windows CH340 DTR/RTS reset')
                return original(loader, mode='no_reset', esp32r0_delay=False)
        return original(loader, mode=mode, esp32r0_delay=esp32r0_delay)

    module.ESPLoader._connect_attempt = connect_attempt
    try:
        module.main(args)
    except module.FatalError as error:
        print('A fatal error occurred: {}'.format(error), file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
