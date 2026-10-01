# SPDX-License-Identifier: AGPL-3.0-or-later
"""Package a local development XPI without publishing or creating an update feed."""
import argparse, hashlib, json, zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
output = parser.parse_args().output.resolve()
output.mkdir(parents=True, exist_ok=True)
manifest = json.loads((root / 'plugin/manifest.json').read_text(encoding='utf-8'))
runtime = json.loads((root / 'plugin/runtime/manifest.json').read_text(encoding='utf-8'))
assert runtime['version'] == manifest['version']
assert hashlib.sha256((root / 'plugin/runtime' / runtime['filename']).read_bytes()).hexdigest() == runtime['sha256']
target = output / f"paperbridge-{manifest['version']}-local-item-tags.xpi"
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted((root / 'plugin').rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts:
            archive.write(path, path.relative_to(root / 'plugin').as_posix())
    for folder in ['plugin', 'tools', 'tests', 'skills', 'LICENSES']:
        for path in sorted((root / folder).rglob('*')):
            if path.is_file() and 'runtime' not in path.parts and '__pycache__' not in path.parts:
                archive.write(path, 'source/' + path.relative_to(root).as_posix())
    for name in ['server.mjs', 'package.json', 'LICENSE', 'README.md', 'BUILD.md', 'THIRD-PARTY-NOTICES.md', 'SOURCE-CODE.md', 'requirements.txt', 'requirements-build.txt']:
        archive.write(root / name, 'source/' + name)
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
print(json.dumps(dict(xpi=str(target), bytes=target.stat().st_size, sha256=hashlib.sha256(target.read_bytes()).hexdigest(), update_feed_created=False)))
