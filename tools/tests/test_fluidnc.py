import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fluidnc


def images(args):
    start = args.index('detect') + 1
    rest = [a for a in args[start:] if a != '--erase-all']
    return dict(zip(rest[::2], [Path(p).as_posix() for p in rest[1::2]]))


class FlashArgsTest(unittest.TestCase):
    def test_default_writes_app_images_without_filesystem(self):
        args = fluidnc.flash_args('COM14', Path('r'))
        self.assertEqual(images(args), {
            '0x1000': 'r/wifi/bootloader.bin',
            '0x8000': 'r/wifi/partitions.bin',
            '0xe000': 'r/common/boot_app0.bin',
            '0x10000': 'r/wifi/firmware.bin',
        })
        self.assertNotIn('--erase-all', args)
        self.assertEqual(args[args.index('--port') + 1], 'COM14')
        self.assertEqual(args[args.index('--baud') + 1], '115200')

    def test_first_install_erases_and_writes_filesystem(self):
        args = fluidnc.flash_args('COM14', Path('r'), erase=True, fs=True)
        self.assertIn('--erase-all', args)
        self.assertEqual(images(args)['0x3d0000'], 'r/wifi/littlefs.bin')

    def test_uses_esptool_3_option_names(self):
        args = fluidnc.flash_args('COM14', Path('r'))
        for option in ('default_reset', 'hard_reset', 'write_flash', '--flash_mode', '--flash_freq', '--flash_size'):
            self.assertIn(option, args)


if __name__ == '__main__':
    unittest.main()
