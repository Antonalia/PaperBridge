# SPDX-License-Identifier: AGPL-3.0-or-later
"""Complete a draft's source asset from its verified XPI; never publish it."""
import copy
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile
from urllib.parse import quote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
import zipfile


class SafeRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected and urlparse(newurl).hostname != urlparse(req.full_url).hostname:
            redirected.remove_header('Authorization')
        return redirected


http = build_opener(SafeRedirects())


def request(url, *, token=None, method='GET', data=None, accept='application/vnd.github+json', content_type=None):
    if urlparse(url).scheme != 'https':
        raise ValueError('HTTPS required')
    headers = {'User-Agent': 'PaperBridge-release-source', 'Accept': accept}
    if token:
        if urlparse(url).hostname not in ('api.github.com', 'uploads.github.com'):
            raise ValueError('Credentials may only be sent to GitHub APIs')
        headers['Authorization'] = 'Bearer ' + token
    if content_type:
        headers['Content-Type'] = content_type
    return http.open(Request(url, data=data, headers=headers, method=method), timeout=180)


def main():
    repo, tag, token = os.environ['GITHUB_REPOSITORY'], os.environ['RELEASE_TAG'], os.environ['GH_TOKEN']
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo) or not re.fullmatch(r'v\d+\.\d+\.\d+', tag):
        raise ValueError('Invalid repository or release tag')
    version, api_root = tag[1:], f'https://api.github.com/repos/{repo}'
    def api(path, method='GET', payload=None):
        data = json.dumps(payload).encode() if payload is not None else None
        with request(api_root + path, token=token, method=method, data=data, content_type='application/json') as response:
            return json.load(response) if response.status != 204 else None
    releases = api('/releases?per_page=100')
    if any(r['tag_name'] == tag and not r['draft'] for r in releases):
        print('Release already published; no assets changed.')
        return
    xpi_name, source_name = f'paperbridge-{version}.xpi', f'paperbridge-{version}-source.zip'
    candidates = [r for r in releases if r['draft'] and
                  (r['tag_name'] == tag or (r['name'] or '').startswith(f'PaperBridge {version}')) and
                  any(a['name'] == xpi_name for a in r['assets'])]
    if len(candidates) != 1:
        raise ValueError('Expected exactly one matching draft with an uploaded XPI')
    release = candidates[0]
    assets = {a['name']: a for a in release['assets']}
    def asset_bytes(name):
        with request(assets[name]['url'], token=token, accept='application/octet-stream') as response:
            return response.read()
    feed_bytes, xpi_bytes = asset_bytes('updates.json'), asset_bytes(xpi_name)
    feed, xpi_hash = json.loads(feed_bytes), hashlib.sha256(xpi_bytes).hexdigest()
    with tempfile.TemporaryDirectory() as folder:
        work = Path(folder)
        xpi = work / xpi_name
        xpi.write_bytes(xpi_bytes)
        with zipfile.ZipFile(xpi) as archive:
            if archive.testzip() is not None:
                raise ValueError('Invalid XPI')
            manifest = json.loads(archive.read('manifest.json'))
            entries = feed['addons'][manifest['applications']['zotero']['id']]['updates']
            entry = next(e for e in entries if e['version'] == version)
            if (manifest['version'] != version or entry['update_hash'] != 'sha256:' + xpi_hash or
                    entry['update_link'] != f'https://github.com/{repo}/releases/download/{tag}/{xpi_name}'):
                raise ValueError('Draft update feed does not match XPI')
            dependencies = json.loads(archive.read('source/third_party/source-manifest.json'))
            source = work / source_name
            if source_name in assets:
                source.write_bytes(asset_bytes(source_name))
            else:
                with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED) as complete:
                    for info in archive.infolist():
                        if not info.filename.startswith('source/') or info.is_dir():
                            continue
                        relative = PurePosixPath(info.filename[7:])
                        if relative.is_absolute() or '..' in relative.parts:
                            raise ValueError('Unsafe source member')
                        target = copy.copy(info)
                        target.filename = f'paperbridge-{version}/' + str(relative)
                        complete.writestr(target, archive.read(info))
                    for dependency in dependencies:
                        name = dependency['filename']
                        if Path(name).name != name:
                            raise ValueError('Unsafe dependency filename')
                        print('Downloading verified dependency:', name, flush=True)
                        with request(dependency['url'], accept='application/octet-stream') as response:
                            data = response.read()
                        if hashlib.sha256(data).hexdigest() != dependency['sha256']:
                            raise ValueError('Dependency hash mismatch: ' + name)
                        complete.writestr(f'paperbridge-{version}/third_party/sources/{name}', data)
            with zipfile.ZipFile(source) as complete:
                if complete.testzip() is not None:
                    raise ValueError('Invalid source ZIP')
                for info in archive.infolist():
                    if info.filename.startswith('source/') and not info.is_dir():
                        if complete.read(f'paperbridge-{version}/' + info.filename[7:]) != archive.read(info):
                            raise ValueError('Source differs from packaged XPI')
                for dependency in dependencies:
                    data = complete.read(f'paperbridge-{version}/third_party/sources/{dependency["filename"]}')
                    if hashlib.sha256(data).hexdigest() != dependency['sha256']:
                        raise ValueError('Source archive dependency hash mismatch')
        upload_base = release['upload_url'].split('{')[0]
        def upload(name, data):
            with request(upload_base + '?name=' + quote(name), token=token, method='POST', data=data,
                         content_type='application/octet-stream') as response:
                result = json.load(response)
            if result['state'] != 'uploaded':
                raise ValueError('Asset upload incomplete')
            return result
        if source_name not in assets:
            upload(source_name, source.read_bytes())
        checksums = (f'{xpi_hash}  {xpi_name}\n' +
                     f'{hashlib.sha256(source.read_bytes()).hexdigest()}  {source_name}\n' +
                     f'{hashlib.sha256(feed_bytes).hexdigest()}  updates.json\n').encode()
        # Replace only this generated draft asset, after the source is verified/uploaded.
        if 'SHA256SUMS.txt' in assets:
            api('/releases/assets/' + str(assets['SHA256SUMS.txt']['id']), method='DELETE')
        upload('SHA256SUMS.txt', checksums)
        print('Draft source and checksums complete; release remains unpublished.')
        summary = os.environ.get('GITHUB_STEP_SUMMARY')
        if summary:
            Path(summary).write_text('Verified every project source member against the XPI and every dependency against its locked SHA-256.\n\n```\n' + checksums.decode() + '```\n')


if __name__ == '__main__':
    main()
