"""Version checked overlay, backups and recovery. Never overwrite an unknown local edit."""
import hashlib
import json
import shutil
import sys
from pathlib import Path, PurePosixPath


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def safe(root, name):
    relative = PurePosixPath(name)
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('Unsafe manifest path')
    path = root / name
    if any(p.is_symlink() for p in [path, *path.parents] if p != root.parent):
        raise ValueError('Refusing symlink destination: ' + name)
    return path


def main():
    mode, source_value, target_value, *extra = sys.argv[1:]
    source, target = Path(source_value).resolve(), Path(target_value).resolve()
    manifest = json.loads((source / 'restore-manifest.json').read_text())
    if mode == 'check':
        conflicts = []
        for entry in manifest['files']:
            path = safe(target, entry['path'])
            if digest(path) not in [entry['before'], entry['after']]:
                conflicts.append(entry['path'])
        if conflicts:
            raise SystemExit('Есть более новые/локальные изменения. Установка не начата:\n' + '\n'.join(conflicts))
    elif mode == 'apply':
        for entry in manifest['files']:
            src, dst = safe(source, entry['path']), safe(target, entry['path'])
            if digest(src) != entry['after']:
                raise ValueError('Damaged bundle: ' + entry['path'])
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
    elif mode == 'backup':
        backup = Path(extra[0]).resolve()
        saved = []
        for entry in manifest['files']:
            path = safe(target, entry['path'])
            saved.append({**entry, 'existed': path.exists()})
            if path.exists():
                out = safe(backup / 'source', entry['path'])
                out.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, out)
        (backup / 'restore-manifest.json').write_text(json.dumps({'files': saved}))
    elif mode == 'restore':
        for entry in manifest['files']:
            dst = safe(target, entry['path'])
            if entry['existed']:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(safe(source / 'source', entry['path']), dst)
            else:
                dst.unlink(missing_ok=True)
    else:
        raise ValueError('Unknown operation')


if __name__ == '__main__':
    main()
