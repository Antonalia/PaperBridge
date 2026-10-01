# SPDX-License-Identifier: AGPL-3.0-or-later
"""Generate the public Zotero update feed from the actual packaged XPI."""
import re

UPDATE_URL = 'https://github.com/Antonalia/PaperBridge/releases/latest/download/updates.json'
RELEASES = 'https://github.com/Antonalia/PaperBridge/releases'


def make_update_manifest(manifest, filename, digest):
    version = manifest['version']
    application = manifest['applications']['zotero']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid release version')
    if application['update_url'] != UPDATE_URL:
        raise ValueError('Unexpected update feed URL')
    if filename != f'paperbridge-{version}.xpi' or not re.fullmatch(r'[a-f0-9]{64}', digest):
        raise ValueError('Update entry must match the packaged XPI')
    return {'addons': {application['id']: {'updates': [{
        'version': version,
        'update_link': f'{RELEASES}/download/v{version}/{filename}',
        'update_hash': 'sha256:' + digest,
        'update_info_url': f'{RELEASES}/tag/v{version}',
        'applications': {'zotero': {key: application[key]
                                  for key in ('strict_min_version', 'strict_max_version')}}
    }]}}}
