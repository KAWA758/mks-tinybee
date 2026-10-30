"""Keep PlatformIO upload arguments, substituting only the esptool launcher."""
from pathlib import Path

Import('env')

original_uploader = env.subst('$UPLOADER')
if Path(original_uploader).name == 'esptool.py':
    project = Path(env.subst('$PROJECT_DIR')).resolve()
    launcher = next(path / 'tools' / 'tinybee_esptool.py' for path in (project, *project.parents)
                    if (path / 'tools' / 'tinybee_esptool.py').is_file())
    env.Prepend(UPLOADERFLAGS=['--esptool', '"{}"'.format(original_uploader)])
    env.Replace(UPLOADER=str(launcher))
