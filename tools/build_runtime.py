# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 PaperBridge contributors.
"""Rebuild Windows x64 runtime in the pinned Python environment."""
from pathlib import Path
import argparse, hashlib, importlib.metadata, json, os, platform, shutil, subprocess, sys
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--build-work',type=Path,default=root/'.build')
work=parser.parse_args().build_work.resolve()
assert sys.platform=='win32' and platform.machine().lower() in {'amd64','x86_64'}
assert sys.version_info[:3]==(3,12,14), 'Use CPython 3.12.14 for this release'
runtime=root/'plugin/runtime';runtime.mkdir(parents=True,exist_ok=True)
licenses=runtime/'licenses';licenses.mkdir(exist_ok=True)
project_licenses=root/'LICENSES';project_licenses.mkdir(exist_ok=True)
python_license=Path(sys.executable).parent/'LICENSE.txt'
if not python_license.is_file():python_license=Path(sys.base_prefix)/'LICENSE.txt'
assert python_license.is_file()
for target in [licenses,project_licenses]:shutil.copyfile(python_license,target/'Python-LICENSE.txt')
requirements={}
for filename in ['requirements.txt','requirements-build.txt']:
    for line in (root/filename).read_text().splitlines():
        if line.strip() and not line.startswith('#'):
            name,version=line.split('==');requirements[name]=version
for name,version in requirements.items():
    dist=importlib.metadata.distribution(name)
    assert dist.version==version, f'Install pinned {name}=={version}'
    copied=0
    for file in dist.files or []:
        if not any(part.endswith('.dist-info') for part in file.parts):continue
        if not any(word in str(file).lower() for word in ['license','copying','notice']):continue
        actual=Path(dist.locate_file(file))
        if not actual.is_file():continue
        destination=project_licenses/(name+'-'+actual.name)
        shutil.copyfile(actual,destination);copied+=1
        if name.lower() in {'pymupdf','tomlkit','pyinstaller'}:shutil.copyfile(actual,licenses/destination.name)
    assert copied, 'Missing original license for '+name
for path in project_licenses.iterdir():
    if path.is_file():shutil.copyfile(path,licenses/path.name)
import pymupdf
assert pymupdf.version[:2]==('1.28.2','1.28.2')
env=dict(os.environ);env['PYTHONPATH']=os.pathsep.join([str(root/'tools'),env.get('PYTHONPATH','')])
# Avoid collecting unrelated copies of Windows DLLs from other applications' PATH.
windows=Path(os.environ['SystemRoot'])
env['PATH']=os.pathsep.join([str(Path(sys.executable).parent),str(Path(sys.executable).parent/'DLLs'),str(windows/'System32'),str(windows)])
args=[sys.executable,'-m','PyInstaller','--noconfirm','--clean','--onefile','--noupx','--name','codex-zotero-mcp',
      '--distpath',str(runtime),'--workpath',str(work/'pyinstaller'),'--specpath',str(work),'--paths',str(root/'tools'),
      '--add-data',str(root/'tools/mcp-tools.json')+os.pathsep+'.','--add-data',str(licenses)+os.pathsep+'licenses','--collect-binaries','pymupdf']
for module in ['numpy','pandas','matplotlib','PIL','cv2','scipy','torch','IPython','openpyxl','pytesseract','wx','tkinter','pytest','sympy','setuptools']:
    args+=['--exclude-module',module]
args.append(str(root/'tools/portable_mcp.py'))
subprocess.run(args,env=env,check=True)
# Microsoft runtime DLLs are an OS prerequisite, not redistributed by this project.
spec=work/'codex-zotero-mcp.spec'
content=spec.read_text(encoding='utf-8')
anchor='pyz = PYZ(a.pure)'
assert content.count(anchor)==1
content=content.replace(anchor,"a.binaries = [entry for entry in a.binaries if entry[0].replace('\\\\', '/').rsplit('/', 1)[-1].lower() not in {'vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll'}]\n"+anchor)
spec.write_bytes(content.encode())
subprocess.run([sys.executable,'-m','PyInstaller','--noconfirm','--clean','--distpath',str(runtime),'--workpath',str(work/'pyinstaller'),str(spec)],env=env,check=True)
executable=runtime/'codex-zotero-mcp.exe'
version=json.loads((root/'plugin/manifest.json').read_text(encoding='utf-8'))['version']
metadata=dict(version=version,platform='windows-x64',filename=executable.name,size_bytes=executable.stat().st_size,
              sha256=hashlib.sha256(executable.read_bytes()).hexdigest(),python_version=platform.python_version(),
              pymupdf_version=pymupdf.version[0],mupdf_version=pymupdf.version[1],dependencies=requirements,
              msvc_runtime='system prerequisite; not bundled')
(runtime/'manifest.json').write_bytes((json.dumps(metadata,indent=2)+'\n').encode())
print(json.dumps(metadata))
