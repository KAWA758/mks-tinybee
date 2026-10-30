"""Fetch, flash and configure the pinned FluidNC release for the TinyBee arm.

Flashing reuses PlatformIO's esptool 3.0 through tinybee_esptool.py, so the
Windows CH340 simultaneous reset stays in effect. Run with a Python that has
pyserial, e.g. PlatformIO's penv; upload-config also needs the xmodem package.
"""
import argparse
import hashlib
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = 'v4.1.1'
ARCHIVE = 'fluidnc-{}-posix.zip'.format(VERSION)
URL = 'https://github.com/bdring/FluidNC/releases/download/{}/{}'.format(VERSION, ARCHIVE)
SHA256 = '9012318d5c9f46319a92648b68ad7c2da4d11645280e9d5c4b290740111a31b0'
CACHE = ROOT / '.fluidnc' / VERSION

# Offsets from the release install scripts and its wifi/partitions.bin.
IMAGES = [
    ('0x1000', 'wifi/bootloader.bin'),
    ('0x8000', 'wifi/partitions.bin'),
    ('0xe000', 'common/boot_app0.bin'),
    ('0x10000', 'wifi/firmware.bin'),
]
LITTLEFS = ('0x3d0000', 'wifi/littlefs.bin')
DEFAULT_ESPTOOL = Path.home() / '.platformio' / 'packages' / 'tool-esptoolpy' / 'esptool.py'


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 16), b''):
            digest.update(block)
    return digest.hexdigest()


def fetch():
    """Download and verify the release once; return the extracted directory."""
    needed = [name for _, name in IMAGES + [LITTLEFS]]
    if all((CACHE / name).is_file() for name in needed):
        return CACHE
    CACHE.mkdir(parents=True, exist_ok=True)
    archive = CACHE / ARCHIVE
    if not archive.is_file() or sha256(archive) != SHA256:
        print('Downloading', URL)
        partial = archive.with_suffix('.part')
        with urllib.request.urlopen(URL) as response, open(partial, 'wb') as f:
            shutil.copyfileobj(response, f)
        if sha256(partial) != SHA256:
            partial.unlink()
            raise SystemExit('SHA-256 mismatch for {}; nothing was flashed'.format(ARCHIVE))
        partial.replace(archive)
    prefix = 'fluidnc-{}-posix/'.format(VERSION)
    with zipfile.ZipFile(archive) as z:
        for name in needed:
            target = CACHE / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(prefix + name))
    return CACHE


def flash_args(port, release, erase=False, fs=False, baud=115200):
    args = ['--chip', 'esp32', '--port', port, '--baud', str(baud),
            '--before', 'default_reset', '--after', 'hard_reset',
            'write_flash', '-z', '--flash_mode', 'dio', '--flash_freq', '80m', '--flash_size', 'detect']
    if erase:
        args.append('--erase-all')
    for offset, name in IMAGES + ([LITTLEFS] if fs else []):
        args += [offset, str(release / name)]
    return args


def flash(options):
    esptool = Path(options.esptool)
    if not esptool.is_file():
        raise SystemExit('esptool.py not found: {} (install PlatformIO or pass --esptool)'.format(esptool))
    release = fetch()
    command = [sys.executable, str(ROOT / 'tools' / 'tinybee_esptool.py'), '--esptool', str(esptool)]
    command += flash_args(options.port, release, options.erase, options.fs, options.baud)
    print(' '.join(command))
    return subprocess.call(command)


def open_port(port):
    import serial
    s = serial.Serial()
    s.port, s.baudrate, s.timeout = port, 115200, 0.2
    # Keep EN/GPIO0 released; opening the port must not reset the ESP32.
    s.dtr = s.rts = False
    s.open()
    return s


def read_for(s, seconds):
    end, data = time.time() + seconds, b''
    while time.time() < end:
        data += s.read(4096)
    return data.decode('utf-8', 'replace')


def upload_config(options):
    from xmodem import XMODEM
    config = Path(options.config)
    with open_port(options.port) as s:
        s.write(b'\r\n')
        read_for(s, 1)
        s.write('$Xmodem/Receive={}\n'.format(options.name).encode())
        # FluidNC waits 1 s before polling; drop the echo before XMODEM starts.
        time.sleep(0.5)
        s.reset_input_buffer()
        modem = XMODEM(lambda size, timeout=1: s.read(size) or None,
                       lambda data, timeout=1: s.write(data))
        with open(config, 'rb') as f:
            if not modem.send(f, retry=32):
                raise SystemExit('XMODEM transfer failed; board config unchanged or incomplete')
        print(read_for(s, 2), end='')
        if options.no_restart:
            return 0
        s.write(b'$Bye\n')
        print(read_for(s, 6), end='')
    print('\nCheck the startup log above (or $SS) for config errors before enabling motion.')
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('fetch', help='download and verify FluidNC {}'.format(VERSION))
    p = sub.add_parser('flash', help='write FluidNC to the board')
    p.add_argument('--port', required=True)
    p.add_argument('--erase', action='store_true', help='erase the whole flash first (first install over Marlin)')
    p.add_argument('--fs', action='store_true', help='also write the WebUI filesystem; deletes config.yaml on the board')
    p.add_argument('--baud', type=int, default=115200)
    p.add_argument('--esptool', default=str(DEFAULT_ESPTOOL))
    p = sub.add_parser('upload-config', help='send config.yaml over serial and restart')
    p.add_argument('--port', required=True)
    p.add_argument('--config', default=str(ROOT / 'fluidnc' / 'config.yaml'))
    p.add_argument('--name', default='config.yaml', help='file name on the board')
    p.add_argument('--no-restart', action='store_true')
    options = parser.parse_args()
    if options.command == 'fetch':
        print(fetch())
        return 0
    return flash(options) if options.command == 'flash' else upload_config(options)


if __name__ == '__main__':
    sys.exit(main())
