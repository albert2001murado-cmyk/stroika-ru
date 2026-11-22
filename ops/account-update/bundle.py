#!/usr/bin/env python3
"""Guarded source overlay and rollback; no settings, secrets or user data."""
import hashlib,json,shutil,sys
from pathlib import Path,PurePosixPath

def safe(root,name):
 rel=PurePosixPath(name)
 if not rel.parts or rel.is_absolute() or '..' in rel.parts:raise ValueError('Invalid bundle path')
 target=root.joinpath(*rel.parts)
 for current in [target,*target.parents]:
  if current==root.parent:break
  if current.is_symlink():raise ValueError('Symlink in source path: '+name)
 return target

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None

def main():
 mode,source_value,target_value,*extra=sys.argv[1:]
 source,target=Path(source_value).resolve(),Path(target_value).resolve()
 manifest=json.loads((source/'account-update-manifest.json').read_text())
 if mode=='check':
  conflicts=[]
  for entry in manifest['files']:
   if digest(safe(source,entry['path']))!=entry['after']:raise ValueError('Damaged bundle file: '+entry['path'])
   if digest(safe(target,entry['path'])) not in [entry['before'],entry['after']]:conflicts.append(entry['path'])
  if conflicts:raise ValueError('Есть изменения в рабочем проекте, которые нужно сохранить. Установка остановлена до замены файлов:\n'+'\n'.join(conflicts))
 elif mode=='apply':
  for entry in manifest['files']:
   src,dst=safe(source,entry['path']),safe(target,entry['path'])
   if digest(src)!=entry['after']:raise ValueError('Damaged bundle file: '+entry['path'])
   dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
 elif mode=='backup':
  backup=Path(extra[0]).resolve();backup.mkdir(parents=True,exist_ok=True);saved=[]
  for entry in manifest['files']:
   src=safe(target,entry['path']);saved.append({**entry,'existed':src.exists()})
   if src.exists():
    dst=safe(backup/'source',entry['path']);dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
  (backup/'account-update-manifest.json').write_text(json.dumps({'files':saved}))
 elif mode=='restore':
  for entry in manifest['files']:
   dst=safe(target,entry['path'])
   if entry['existed']:
    dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(safe(source/'source',entry['path']),dst)
   else:dst.unlink(missing_ok=True)
 else:raise ValueError('Invalid operation')
if __name__=='__main__':main()
