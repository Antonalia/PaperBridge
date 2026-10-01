# SPDX-License-Identifier: AGPL-3.0-or-later
import hashlib
import io
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch
import zipfile
import complete_release_source as worker

dependency = b'isolated dependency source'
manifest = {'version': '1.0.2', 'applications': {'zotero': {'id': 'fixture'}}}
buffer = io.BytesIO()
with zipfile.ZipFile(buffer, 'w') as z:
    z.writestr('manifest.json', json.dumps(manifest))
    z.writestr('source/plugin/manifest.json', json.dumps(manifest))
    z.writestr('source/README.md', 'Packaged project source')
    z.writestr('source/third_party/source-manifest.json', json.dumps([{
        'filename': 'fixture.tar.gz', 'url': 'https://sources.example/fixture.tar.gz',
        'sha256': hashlib.sha256(dependency).hexdigest()}]))
xpi = buffer.getvalue()
feed = json.dumps({'addons': {'fixture': {'updates': [{'version': '1.0.2',
    'update_hash': 'sha256:' + hashlib.sha256(xpi).hexdigest(),
    'update_link': 'https://github.com/fixture/project/releases/download/v1.0.2/paperbridge-1.0.2.xpi'}]}}}).encode()
assets = [{'name': name, 'url': f'https://api.github.com/assets/{name}', 'id': i}
          for i, name in enumerate(['paperbridge-1.0.2.xpi', 'updates.json', 'SHA256SUMS.txt'], 1)]
release = dict(draft=True, tag_name='v1.0.2', name='PaperBridge 1.0.2', assets=assets,
               upload_url='https://uploads.github.com/fixture/assets{?name}')

class Response(io.BytesIO):
    def __init__(self, data, status=200): super().__init__(data); self.status = status

for scenario in ['success', 'published', 'bad-feed', 'bad-dependency']:
    calls, uploaded = [], {}
    def request(url, **options):
        calls.append((url, options.get('method', 'GET')))
        if '/releases?per_page=' in url:
            row = {**release, 'draft': scenario != 'published'}
            return Response(json.dumps([row]).encode())
        if url.endswith('/paperbridge-1.0.2.xpi'): return Response(xpi)
        if url.endswith('/updates.json'): return Response(feed if scenario != 'bad-feed' else feed.replace(b'sha256:', b'bad:'))
        if url.startswith('https://sources.example/'):
            assert options.get('token') is None
            return Response(dependency if scenario != 'bad-dependency' else b'incorrect')
        if options.get('method') == 'DELETE':
            assert 'paperbridge-1.0.2-source.zip' in uploaded
            assert url.endswith('/releases/assets/3')
            return Response(b'', 204)
        if options.get('method') == 'POST':
            name = url.split('?name=')[1]
            uploaded[name] = options['data']
            return Response(json.dumps({'state': 'uploaded'}).encode())
        raise AssertionError('Unexpected request: ' + url)
    with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {
            'GH_TOKEN': 'isolated-test-token', 'GITHUB_REPOSITORY': 'fixture/project',
            'RELEASE_TAG': 'v1.0.2', 'GITHUB_STEP_SUMMARY': str(Path(temp) / 'summary.md')}), patch.object(worker, 'request', request):
        try: worker.main()
        except ValueError:
            assert scenario.startswith('bad-')
        else: assert not scenario.startswith('bad-')
    if scenario == 'success':
        source = uploaded['paperbridge-1.0.2-source.zip']
        with zipfile.ZipFile(io.BytesIO(source)) as z:
            assert z.read('paperbridge-1.0.2/README.md') == b'Packaged project source'
            assert z.read('paperbridge-1.0.2/third_party/sources/fixture.tar.gz') == dependency
        assert hashlib.sha256(source).hexdigest().encode() in uploaded['SHA256SUMS.txt']
    else:
        assert not uploaded and not any(method == 'DELETE' for _, method in calls)
print('PASS source bytes, dependency hashes, checksum ordering, published and invalid data protection')
