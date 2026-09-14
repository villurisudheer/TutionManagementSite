#!/usr/bin/env python3
"""Package the full sibling project, excluding runtime data and secrets."""
from pathlib import Path
import hashlib,json,sys,zipfile
root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root.parent/'aacharya-student-intake-render-v7.zip'
excluded={'node_modules','data','.git','__pycache__'}
files=[]
for p in sorted(root.rglob('*')):
 if not p.is_file():continue
 rel=p.relative_to(root)
 if any(part in excluded for part in rel.parts):continue
 if p.name.startswith('.env') and p.name!='.env.example':continue
 if p.suffix in {'.log','.partial','.zip','.pyc'}:continue
 if p.suffix in {'.sqlite','.xlsx'} and not str(rel).startswith('scripts/fixtures/v61/'):continue
 if p.name=='V7_RELEASE_MANIFEST.json':continue
 if p.is_symlink():raise SystemExit('Refuse to package symlink '+str(rel))
 files.append(p)
manifest={'version':'7.0.0','files':[{'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
m=root/'V7_RELEASE_MANIFEST.json';m.write_text(json.dumps(manifest,indent=2)+'\n');files.append(m)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in files:z.write(p,root.name+'/'+str(p.relative_to(root)))
with zipfile.ZipFile(out) as z:assert z.testzip() is None
print(json.dumps({'zip':str(out),'files':len(files),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()},indent=2))
