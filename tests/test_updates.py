# SPDX-License-Identifier: AGPL-3.0-or-later
"""Run real configuration code against temporary files, never the personal config."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch
import zipfile

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'tools'))
import portable_mcp
from update_manifest import UPDATE_URL, make_update_manifest

manifest = json.loads((root / 'plugin/manifest.json').read_text(encoding='utf-8'))
version = manifest['version']
feed = make_update_manifest(manifest, f'paperbridge-{version}.xpi', 'a' * 64)
entry = feed['addons'][manifest['applications']['zotero']['id']]['updates'][0]
assert entry['version'] == version and entry['update_hash'] == 'sha256:' + 'a' * 64
assert entry['applications']['zotero']['strict_max_version'] == manifest['applications']['zotero']['strict_max_version']
for filename, digest in [('wrong.xpi', 'a' * 64), (f'paperbridge-{version}.xpi', 'bad')]:
    try:
        make_update_manifest(manifest, filename, digest)
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid update feed accepted')

with tempfile.TemporaryDirectory() as folder:
    temporary = Path(folder)
    codex = temporary / 'codex'
    codex.mkdir()
    config = codex / 'config.toml'
    bridge_config = temporary / 'profile' / 'codex-pdf-bridge' / 'bridge-config.json'
    executable = bridge_config.parent / version / 'codex-zotero-mcp.exe'
    previous = bridge_config.parent / '1.0.1' / 'codex-zotero-mcp.exe'
    import tomlkit
    def document(command=previous, arguments=None, enabled=True):
        doc = tomlkit.parse('# Preserve this comment\nmodel = "example"\n[mcp_servers.other]\ncommand = "other.exe"\n')
        server = tomlkit.table()
        server.update(command=str(command), args=arguments or ['--config', str(bridge_config)], enabled=enabled,
                      startup_timeout_sec=45, env={'KEEP': 'original'})
        doc['mcp_servers']['zotero_local'] = server
        return tomlkit.dumps(doc).encode()
    request = dict(token='a' * 64, port=23119)
    def run():
        with patch.dict(os.environ, {'CODEX_HOME': str(codex)}), patch.object(sys, 'frozen', True, create=True), \
             patch.object(sys, 'executable', str(executable)), patch.object(sys, 'stdin', io.TextIOWrapper(io.BytesIO(json.dumps(request).encode()))), \
             patch.object(portable_mcp, 'secure_file'):
            return portable_mcp.configure(bridge_config, upgrade_existing=True)
    original = document()
    config.write_bytes(original)
    result = run()
    assert result['ok'] and result['version'] == version
    updated = tomlkit.parse(config.read_text(encoding='utf-8'))
    assert updated['mcp_servers']['zotero_local']['command'] == str(executable.resolve())
    assert updated['mcp_servers']['zotero_local']['env']['KEEP'] == 'original'
    assert updated['mcp_servers']['zotero_local']['startup_timeout_sec'] == 45
    assert updated['mcp_servers']['other']['command'] == 'other.exe'
    assert '# Preserve this comment' in config.read_text(encoding='utf-8')
    assert Path(result['backup_path']).read_bytes() == original
    assert json.loads(bridge_config.read_text(encoding='utf-8')) == request
    after = config.read_bytes()
    assert run()['backup_path'] is None and config.read_bytes() == after
    for contents, reason in [(b'[mcp_servers.other]\ncommand="other.exe"\n', 'removed'),
                             (document(enabled=False), 'disabled'),
                             (document(command=temporary / 'custom.exe'), 'customized'),
                             (document(arguments=['--config', str(bridge_config), '--custom']), 'customized')]:
        config.write_bytes(contents)
        bridge_config.unlink(missing_ok=True)
        skipped = run()
        assert skipped['skipped'] and skipped['reason'] == reason
        assert config.read_bytes() == contents and not bridge_config.exists()
    # A concurrent edit must win over the automatic upgrade.
    config.write_bytes(original)
    actual_write = portable_mcp.write_atomic
    def conflicting_write(path, data, original=None, private=False):
        if path == config:
            config.write_bytes(b'# User edited during upgrade\n')
        return actual_write(path, data, original=original, private=private)
    with patch.object(portable_mcp, 'write_atomic', side_effect=conflicting_write):
        try:
            run()
        except ValueError as error:
            assert 'changed during setup' in str(error)
        else:
            raise AssertionError('Concurrent edit overwritten')
    assert config.read_bytes() == b'# User edited during upgrade\n'

parser = argparse.ArgumentParser()
parser.add_argument('--artifacts', action='store_true')
if parser.parse_args().artifacts:
    xpi = root / 'dist' / f'paperbridge-{version}.xpi'
    source = root / 'dist' / f'paperbridge-{version}-source.zip'
    online = json.loads((root / 'dist/updates.json').read_text(encoding='utf-8'))
    expected = make_update_manifest(manifest, xpi.name, hashlib.sha256(xpi.read_bytes()).hexdigest())
    assert online == expected
    with zipfile.ZipFile(xpi) as archive:
        assert archive.testzip() is None
        assert json.loads(archive.read('manifest.json')) == manifest
        assert 'updates.json' not in archive.namelist()
    with zipfile.ZipFile(source) as archive:
        assert archive.testzip() is None
        assert archive.read(f'paperbridge-{version}/tools/update_manifest.py') == (root / 'tools/update_manifest.py').read_bytes()
    for line in (root / 'dist/SHA256SUMS.txt').read_text().splitlines():
        digest, filename = line.split('  ')
        assert hashlib.sha256((root / 'dist' / filename).read_bytes()).hexdigest() == digest
print(json.dumps(dict(version=version, update_feed=True, existing_config_only=True, preserved_settings=True,
                     disabled_removed_customized_skipped=True, concurrent_edit_preserved=True, personal_config_access=False)))
