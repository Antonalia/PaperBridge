# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 PaperBridge contributors.
"""Standalone Windows MCP host and local Codex configurator (no system Python/Node)."""
import argparse
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, ProxyHandler, HTTPRedirectHandler, build_opener

from annotation_rules import rules_from_status, rules_instructions, tools_with_rules

VERSION = '1.0.1'
ASSETS = Path(__file__).resolve().parent
HOME = Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else ASSETS.parent
DEFAULTS = dict(annotation='yellow', important='red', image='purple', chart='blue')
TOOLS = json.loads((ASSETS / 'mcp-tools.json').read_text(encoding='utf-8'))


def encode(value):
    return json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(',', ':'))


def validate(value, schema, name='arguments'):
    kind = schema.get('type')
    if kind == 'object':
        if not isinstance(value, dict):
            raise ValueError(f'{name} must be an object')
        for key in schema.get('required', []):
            if key not in value:
                raise ValueError(f'{name}.{key} is required')
        for key, child in value.items():
            if key not in schema['properties']:
                raise ValueError(f'Unknown {name}.{key}')
            validate(child, schema['properties'][key], f'{name}.{key}')
    elif kind == 'array':
        if not isinstance(value, list) or not schema.get('minItems', 0) <= len(value) <= schema.get('maxItems', math.inf):
            raise ValueError(f'Invalid {name} array length')
        for index, child in enumerate(value):
            validate(child, schema['items'], f'{name}[{index}]')
    elif kind == 'string':
        if not isinstance(value, str) or not schema.get('minLength', 0) <= len(value) <= schema.get('maxLength', math.inf):
            raise ValueError(f'Invalid {name} string')
    elif kind == 'boolean' and type(value) is not bool:
        raise ValueError(f'Invalid {name} boolean')
    elif kind in ('integer', 'number'):
        if type(value) not in ((int,) if kind == 'integer' else (int, float)) or not math.isfinite(value) or not schema.get('minimum', -math.inf) <= value <= schema.get('maximum', math.inf):
            raise ValueError(f'Invalid {name} number')
    if 'enum' in schema and value not in schema['enum']:
        raise ValueError(f'Invalid {name} value')


class LocalOnlyRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise ValueError('The local bridge must not redirect requests')


class ZoteroMcp:
    def __init__(self, config_path):
        self.config_path = config_path
        self.locators, self.plans, self.renders = {}, {}, {}
        self.obsidian_plans = {}
        self.http = build_opener(ProxyHandler({}), LocalOnlyRedirects())

    def settings(self):
        try:
            value = json.loads(self.config_path.read_text(encoding='utf-8'))
        except FileNotFoundError:
            value = {}
        token = os.environ.get('ZOTERO_BRIDGE_TOKEN') or value.get('token')
        port = int(os.environ.get('ZOTERO_BRIDGE_PORT') or value.get('port', 23119))
        if not token:
            raise ValueError('Install the XPI and click Configure Codex in Zotero settings.')
        if not 1 <= port <= 65535:
            raise ValueError('Invalid Zotero port')
        return token, port

    def bridge(self, action, timeout=120, **data):
        token, port = self.settings()
        request = Request(f'http://127.0.0.1:{port}/codex-zotero/v1', data=encode(dict(action=action, **data)).encode(), headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}', 'Zotero-Allowed-Request': '1'}, method='POST')
        try:
            with self.http.open(request, timeout=timeout) as response:
                result = json.loads(response.read(16 * 1024 * 1024))
        except HTTPError as error:
            if error.code in (401, 403):
                raise ValueError('Connection rejected. Click Configure Codex again and check the plugin is enabled.') from None
            try:
                message = json.loads(error.read(8192)).get('error', f'Zotero HTTP {error.code}')
            except Exception:
                message = f'Zotero HTTP {error.code}'
            raise ValueError(message) from None
        except (URLError, TimeoutError):
            raise ValueError('Cannot reach Zotero. Keep Zotero open and enable 文献桥 · PaperBridge.') from None
        if not result.get('ok'):
            raise ValueError(result.get('error', 'Invalid Zotero response'))
        return result['result']

    def defaults(self):
        value = self.bridge('status').get('default_colors', {})
        return {key: value.get(key) if value.get(key) in ('yellow', 'red', 'green', 'blue', 'purple', 'magenta', 'orange', 'gray') else fallback for key, fallback in DEFAULTS.items()}

    def annotation_rules(self, timeout=120):
        return rules_from_status(self.bridge('status', timeout=timeout))

    def metadata_rules(self):
        try: return self.annotation_rules(timeout=2)
        except Exception: return rules_from_status()

    def cleanup(self):
        for store, limit in ((self.locators, 12000), (self.plans, 100), (self.renders, 50), (self.obsidian_plans, 50)):
            for key in list(store):
                if store[key]['created'] < time.time() - 3600:
                    del store[key]
            while len(store) > limit:
                del store[next(iter(store))]

    def worker(self, kind, request):
        command = [sys.executable, '--worker', kind] if getattr(sys, 'frozen', False) else [sys.executable, str(Path(__file__).resolve()), '--worker', kind]
        child = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            output, stderr = child.communicate(encode(request).encode(), timeout=120)
        except subprocess.TimeoutExpired:
            child.kill()
            child.communicate()
            raise ValueError('PDF processing exceeded 120 seconds') from None
        if len(output) > 16 * 1024 * 1024:
            raise ValueError('PDF output too large; request fewer pages or a smaller image')
        try:
            value = json.loads(output)
        except Exception:
            raise ValueError('PDF worker failed to return valid data') from None
        if child.returncode or 'error' in value:
            raise ValueError(value.get('error', 'PDF processing failed'))
        return value

    def extract(self, args, query=None):
        info = self.bridge('attachment', attachment_id=args['attachment_id'])
        request = dict(path=info['file_path'], start_page=args.get('start_page', 1), end_page=args.get('end_page', args.get('start_page', 1) + 9))
        if query is not None:
            request['query'] = query
        output = self.worker('extract', request)
        pages = []
        for page in output['pages']:
            passages = []
            for passage in page['passages']:
                locator = secrets.token_hex(16)
                self.locators[locator] = dict(passage, attachment_id=args['attachment_id'], file_sha256=output['file_sha256'], page_count=output['page_count'], page_index=page['page_index'], page_label=page['page_label'], view_box=page['view_box'], created=time.time())
                passages.append(dict(locator_id=locator, text=passage['text']))
            pages.append(dict(page=page['page'], page_label=page['page_label'], needs_ocr=page['needs_ocr'], passages=passages))
        return dict(attachment_id=args['attachment_id'], page_count=output['page_count'], annotation_geometry=output.get('annotation_geometry'), pages=pages, **self.annotation_rules())

    def obsidian_snapshot(self, attachment_id):
        snapshot = self.bridge('obsidian_snapshot', attachment_id=attachment_id)
        snapshot['source_pdf_path'] = self.bridge('attachment', attachment_id=attachment_id)['file_path']
        return snapshot

    def call(self, name, args):
        tool = next((tool for tool in TOOLS if tool['name'] == name), None)
        if tool is None:
            raise ValueError(f'Unknown tool: {name}')
        validate(args, tool['inputSchema'])
        self.cleanup()
        if name == 'zotero_prepare_obsidian_import':
            from obsidian_import import prepare
            snapshot = self.obsidian_snapshot(args['attachment_id'])
            preview = prepare(snapshot, args)
            plan = preview.pop('_obsidian_plan', None)
            if plan is not None:
                plan_id = secrets.token_hex(16)
                self.obsidian_plans[plan_id] = plan
                preview['plan_id'] = plan_id
            return preview
        if name == 'zotero_apply_obsidian_import':
            from obsidian_import import apply
            plan = self.obsidian_plans.get(args['plan_id'])
            if plan is None:
                raise ValueError('Unknown/expired Obsidian plan; prepare again')
            return apply(plan, self.obsidian_snapshot(plan['attachment_id']))
        if name == 'zotero_get_obsidian_link':
            return self.bridge('obsidian_link', **args)
        if name in ('zotero_status', 'zotero_search', 'zotero_selected_items', 'zotero_list_annotations'):
            return self.bridge({'zotero_status': 'status', 'zotero_search': 'search', 'zotero_selected_items': 'selected', 'zotero_list_annotations': 'annotations'}[name], **args)
        if name in ('zotero_read_pdf', 'zotero_find_pdf_text'):
            return self.extract(args, args.get('text'))
        if name == 'zotero_render_pdf_page':
            info = self.bridge('attachment', attachment_id=args['attachment_id'])
            result = self.worker('region', dict(path=info['file_path'], page=args['page']))
            image = result.pop('png_base64')
            render_id = secrets.token_hex(16)
            self.renders[render_id] = dict(result, attachment_id=args['attachment_id'], path=info['file_path'], page=args['page'], created=time.time())
            return dict(render_id=render_id, page=args['page'], width=result['width'], height=result['height'], coordinate_space='unrotated render pixels; origin top-left', _mcp_image=image)
        if name == 'zotero_prepare_image_annotation':
            render = self.renders.get(args['render_id'])
            if not render:
                raise ValueError('Unknown/expired render; render the page again')
            defaults = self.defaults()
            kind = args.get('region_kind', 'image')
            role = 'image' if kind == 'image' else 'chart'
            result = self.worker('region', dict(path=render['path'], page=render['page'], file_sha256=render['file_sha256'], crop_pixels=args['crop_pixels']))
            plan_id = secrets.token_hex(16)
            annotation = dict(type='image', page_index=result['page_index'], page_label=result['page_label'], view_box=result['view_box'], offset=0, rects=[result['rect']], image_base64=result['png_base64'], color=args.get('color', defaults[role]), color_role=role, comment=args.get('comment', ''), tags=args.get('tags', []))
            self.plans[plan_id] = dict(request_id=plan_id, attachment_id=render['attachment_id'], file_sha256=result['file_sha256'], page_count=result['page_count'], annotations=[annotation], created=time.time())
            return dict(plan_id=plan_id, attachment_id=render['attachment_id'], page=render['page'], type='image', region_kind=kind, color=annotation['color'], color_role=role, comment=annotation['comment'], width=result['width'], height=result['height'], expires_in_minutes=60, _mcp_image=result['png_base64'])
        if name == 'zotero_prepare_annotations':
            from extract_pdf import disjoint_rect_union, ANNOTATION_GEOMETRY
            rules = self.annotation_rules()
            defaults = self.defaults()
            annotations, identity = [], None
            for value in args['annotations']:
                if len(set(value['locator_ids'])) != len(value['locator_ids']):
                    raise ValueError('Duplicate locator in annotation')
                anchors = []
                for key in value['locator_ids']:
                    anchor = self.locators.get(key)
                    if not anchor or anchor['attachment_id'] != args['attachment_id']:
                        raise ValueError('Unknown/expired locator or wrong attachment; read the PDF again')
                    identity = identity or anchor
                    if anchor['file_sha256'] != identity['file_sha256']:
                        raise ValueError('Locators refer to different versions of the PDF')
                    anchors.append(anchor)
                if any(anchor['page_index'] != anchors[0]['page_index'] for anchor in anchors):
                    raise ValueError('Split annotations spanning multiple pages into separate annotations')
                anchors.sort(key=lambda anchor: anchor['offset'])
                comment = value.get('comment', '')
                if value['type'] == 'note' and not comment.strip():
                    raise ValueError('Sticky notes require a comment')
                first = anchors[0]
                rects = disjoint_rect_union([rect for anchor in anchors for rect in anchor['rects']])
                if len(rects) > 400:
                    raise ValueError('Too many rectangles; split the annotation')
                left, bottom, right, top = first['view_box']
                size = min(18, right - left, top - bottom)
                x, y = max(left, right - size - 12), min(top - size, max(bottom, first['rects'][0][3] - size))
                role = 'important' if value.get('emphasis') == 'important' else 'annotation'
                annotations.append(dict(type=value['type'], page_index=first['page_index'], page_label=first['page_label'], view_box=first['view_box'], offset=first['offset'], rects=[[x, y, x + size, y + size]] if value['type'] == 'note' else rects, text='\n'.join(anchor['text'] for anchor in anchors), color=value.get('color', defaults[role]), color_role=role, comment=comment, tags=value.get('tags', [])))
            plan_id = secrets.token_hex(16)
            self.plans[plan_id] = dict(request_id=plan_id, attachment_id=args['attachment_id'], file_sha256=identity['file_sha256'], page_count=identity['page_count'], annotations=annotations, annotation_rules_revision=rules['annotation_rules_revision'], created=time.time())
            preview = [dict(type=value['type'], page=value['page_index'] + 1, page_label=value['page_label'], text=value['text'], comment=value['comment'], color=value['color'], color_role=value['color_role'], tags=value['tags']) for value in annotations]
            return dict(plan_id=plan_id, expires_in_minutes=60, attachment_id=args['attachment_id'], count=len(annotations), annotation_geometry=ANNOTATION_GEOMETRY, annotations=preview, **rules)
        if name == 'zotero_apply_annotations':
            plan = self.plans.get(args['plan_id'])
            if not plan:
                raise ValueError('Unknown/expired plan. Read and prepare annotations again.')
            if plan.get('annotation_rules_revision') and plan['annotation_rules_revision'] != self.annotation_rules()['annotation_rules_revision']:
                raise ValueError('Annotation rules changed; prepare the annotation plan again.')
            return self.bridge('apply_annotations', **{key: value for key, value in plan.items() if key not in ('created', 'annotation_rules_revision')})


def secure_file(path):
    if os.name != 'nt':
        path.chmod(0o600)
        return
    system = Path(os.environ['SystemRoot']) / 'System32'
    flags = subprocess.CREATE_NO_WINDOW
    result = subprocess.run([str(system / 'whoami.exe'), '/user', '/fo', 'csv', '/nh'], capture_output=True, check=True, creationflags=flags)
    sid = next(csv.reader([result.stdout.decode(errors='replace').strip()]))[-1]
    if not re.fullmatch(r'S-1-[0-9-]+', sid):
        raise ValueError('Cannot determine the Windows user for private file permissions')
    subprocess.run([str(system / 'icacls.exe'), str(path), '/inheritance:r', '/grant:r', f'*{sid}:(F)'], capture_output=True, check=True, creationflags=flags)


def write_atomic(path, data, original=None, private=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=path.name + '.', suffix='.tmp', dir=path.parent)
    temp = Path(temporary)
    try:
        os.close(fd)
        if private:
            secure_file(temp)
        temp.write_bytes(data)
        if original is not None and (path.read_bytes() if path.exists() else b'') != original:
            raise ValueError('Codex configuration changed during setup; click Configure Codex again')
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def configure(config_path):
    import tomlkit
    if os.name != 'nt' or not getattr(sys, 'frozen', False):
        raise ValueError('The one-click installer requires the packaged Windows executable')
    request = json.loads(sys.stdin.buffer.read(8193))
    token, port = request.get('token'), request.get('port', 23119)
    if not isinstance(token, str) or not re.fullmatch(r'[a-f0-9]{64}', token) or type(port) is not int or not 1 <= port <= 65535:
        raise ValueError('Invalid local bridge configuration')
    codex_home = Path(os.environ.get('CODEX_HOME') or Path.home() / '.codex').expanduser().resolve()
    config = codex_home / 'config.toml'
    original = config.read_bytes() if config.exists() else b''
    document = tomlkit.parse(original.decode('utf-8-sig'))
    servers = document.get('mcp_servers')
    if servers is None:
        document['mcp_servers'] = tomlkit.table()
        servers = document['mcp_servers']
    if not isinstance(servers, dict):
        raise ValueError('Invalid mcp_servers configuration; configuration was not replaced')
    old = servers.get('zotero_local')
    if old is not None:
        command = str(old.get('command', '')).replace('\\', '/').lower()
        args = [str(value).replace('\\', '/').lower() for value in old.get('args', [])]
        owned = command.endswith('/codex-zotero-mcp.exe') or command == 'codex-zotero-mcp.exe' or any(value.endswith('/zotero-codex-bridge/server.mjs') for value in args)
        if not owned:
            raise ValueError('A different MCP already uses the name zotero_local; rename it before setup')
    table = tomlkit.table()
    table['command'] = str(Path(sys.executable).resolve())
    table['args'] = ['--config', str(config_path.resolve())]
    servers['zotero_local'] = table
    updated = tomlkit.dumps(document).encode('utf-8')
    # Parse the generated configuration before saving it; no CLI dependency.
    tomlkit.parse(updated.decode())
    backup = None
    if original and updated != original:
        backup = codex_home / ('config.toml.codex-zotero-' + time.strftime('%Y%m%d-%H%M%S') + '-' + secrets.token_hex(3) + '.bak')
        write_atomic(backup, original, private=True)
    write_atomic(config_path, encode(dict(token=token, port=port)).encode(), private=True)
    if updated != original:
        write_atomic(config, updated, original=original, private=True)
    return dict(ok=True, version=VERSION, config_path=str(config), backup_path=str(backup) if backup else None, message='Codex configured. Restart Codex and keep Zotero open.')


def serve(config_path):
    app = ZoteroMcp(config_path)
    def send(value):
        sys.stdout.buffer.write((encode(value) + '\n').encode())
        sys.stdout.buffer.flush()
    while True:
        line = sys.stdin.buffer.readline(1024 * 1024 + 2)
        if not line:
            break
        if len(line) > 1024 * 1024:
            while line and not line.endswith(b'\n'):
                line = sys.stdin.buffer.readline(1024 * 1024 + 2)
            send(dict(jsonrpc='2.0', id=None, error=dict(code=-32600, message='Request too large')))
            continue
        if not line.strip():
            continue
        try:
            request = json.loads(line)
        except Exception:
            send(dict(jsonrpc='2.0', id=None, error=dict(code=-32700, message='Parse error')))
            continue
        if not isinstance(request, dict) or request.get('jsonrpc') != '2.0' or not isinstance(request.get('method'), str):
            send(dict(jsonrpc='2.0', id=None, error=dict(code=-32600, message='Invalid Request')))
            continue
        if 'id' not in request:
            continue
        try:
            method = request['method']
            if method == 'initialize':
                protocol = (request.get('params') or {}).get('protocolVersion')
                result = dict(protocolVersion=protocol if protocol in ('2024-11-05', '2025-03-26', '2025-06-18') else '2024-11-05', capabilities=dict(tools={}), serverInfo=dict(name='codex-zotero-local', version=VERSION), instructions='Read source before annotating. Use returned IDs and prepare plans before writing. Keep Zotero open. For Obsidian imports use zotero_prepare_obsidian_import and zotero_apply_obsidian_import, which honor folder and link settings and preserve manual content. Apply after user authorization. For manual exports use zotero_get_obsidian_link and never bypass disabled settings.' + '\n' + rules_instructions(app.metadata_rules()))
            elif method == 'ping':
                result = {}
            elif method == 'tools/list':
                result = dict(tools=tools_with_rules(TOOLS, app.metadata_rules()))
            elif method == 'tools/call':
                try:
                    params = request.get('params') or {}
                    output = app.call(params.get('name'), params.get('arguments', {}))
                    image = output.pop('_mcp_image', None)
                    result = dict(content=[dict(type='text', text=encode(output))])
                    if image:
                        result['content'].append(dict(type='image', data=image, mimeType='image/png'))
                except Exception as error:
                    result = dict(isError=True, content=[dict(type='text', text=str(error))])
            else:
                send(dict(jsonrpc='2.0', id=request['id'], error=dict(code=-32601, message='Method not found')))
                continue
            send(dict(jsonrpc='2.0', id=request['id'], result=result))
        except Exception as error:
            send(dict(jsonrpc='2.0', id=request['id'], error=dict(code=-32603, message=str(error))))


def main():
    parser = argparse.ArgumentParser(description='Codex Zotero standalone MCP')
    parser.add_argument('--config', type=Path, default=HOME / 'bridge-config.json')
    parser.add_argument('--configure', action='store_true')
    parser.add_argument('--worker', choices=('extract', 'region'))
    args = parser.parse_args()
    if args.worker:
        try:
            request = json.load(sys.stdin.buffer)
            if args.worker == 'extract':
                from extract_pdf import extract
                output = extract(request)
            else:
                from pdf_region import process
                output = process(request)
            sys.stdout.buffer.write(encode(output).encode())
        except Exception as error:
            sys.stdout.buffer.write(encode(dict(error=str(error))).encode())
            return 1
    elif args.configure:
        try:
            output = configure(args.config)
        except Exception as error:
            output = dict(ok=False, error=str(error))
        sys.stdout.buffer.write(encode(output).encode())
        return 0 if output['ok'] else 1
    else:
        serve(args.config)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
