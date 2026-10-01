# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 PaperBridge contributors.
"""Package matching binaries and complete corresponding source."""
from pathlib import Path
import argparse, hashlib, json, zipfile
from update_manifest import make_update_manifest
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=root/'dist')
output=parser.parse_args().output.resolve();output.mkdir(parents=True,exist_ok=True)
manifest=json.loads((root/'plugin/manifest.json').read_text(encoding='utf-8'))
version=manifest['version']
runtime=json.loads((root/'plugin/runtime/manifest.json').read_text(encoding='utf-8'))
assert runtime['version']==version
assert hashlib.sha256((root/'plugin/runtime'/runtime['filename']).read_bytes()).hexdigest()==runtime['sha256']
for entry in json.loads((root/'third_party/source-manifest.json').read_text(encoding='utf-8')):
    assert hashlib.sha256((root/'third_party/sources'/entry['filename']).read_bytes()).hexdigest()==entry['sha256']
files=[]
for folder in ['plugin','tools','tests','skills','third_party','LICENSES']:
    for path in sorted((root/folder).rglob('*')):
        if not path.is_file() or '__pycache__' in path.parts or path.suffix in {'.pyc','.partial'}:continue
        if folder=='plugin' and 'runtime' in path.relative_to(root/folder).parts:continue
        files.append(path)
for name in ['LICENSE','THIRD-PARTY-NOTICES.md','README.md','BUILD.md','SOURCE-CODE.md','PRIVACY.md','CHANGELOG.md','requirements.txt','requirements-build.txt','package.json','server.mjs','setup-codex.ps1']:
    files.append(root/name)
assert all(p.is_file() for p in files)
xpi=output/f'paperbridge-{version}.xpi'
with zipfile.ZipFile(xpi,'w',zipfile.ZIP_DEFLATED) as z:
    for path in sorted((root/'plugin').rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts:z.write(path,path.relative_to(root/'plugin').as_posix())
    for path in files:
        relative=path.relative_to(root)
        if relative.parts[:2]!=('third_party','sources'):z.write(path,'source/'+relative.as_posix())
    for name in ['README.md','SOURCE-CODE.md','PRIVACY.md','CHANGELOG.md']:z.write(root/name,name)
source_zip=output/f'paperbridge-{version}-source.zip'
with zipfile.ZipFile(source_zip,'w',zipfile.ZIP_DEFLATED) as z:
    for path in files:z.write(path,f'paperbridge-{version}/'+path.relative_to(root).as_posix())
feed=output/'updates.json'
feed.write_bytes((json.dumps(make_update_manifest(manifest,xpi.name,hashlib.sha256(xpi.read_bytes()).hexdigest()),indent=2)+'\n').encode())
checksums=[]
for artifact in [xpi,source_zip]:
    with zipfile.ZipFile(artifact) as z:assert z.testzip() is None
    checksums.append(hashlib.sha256(artifact.read_bytes()).hexdigest()+'  '+artifact.name)
checksums.append(hashlib.sha256(feed.read_bytes()).hexdigest()+'  '+feed.name)
(output/'SHA256SUMS.txt').write_bytes(('\n'.join(checksums)+'\n').encode())
print(json.dumps({'version':version,'xpi_bytes':xpi.stat().st_size,'source_bytes':source_zip.stat().st_size}))
