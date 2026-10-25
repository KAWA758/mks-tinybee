"""Keep PlatformIO upload arguments, substituting only the esptool launcher."""
from pathlib import Path

Import('env')

original_uploader = env.subst('$UPLOADER')
if Path(original_uploader).name == 'esptool.py':
    project = Path(env.subst('$PROJECT_DIR')).resolve()
    root = next(path for path in (project, *project.parents)
                if (path / 'Marlin' / 'Configuration.h').is_file())
    env.Prepend(UPLOADERFLAGS=['--esptool', '"{}"'.format(original_uploader)])
    env.Replace(UPLOADER=str(root / 'tools' / 'tinybee_esptool.py'))
