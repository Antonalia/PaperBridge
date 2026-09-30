# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 PaperBridge contributors.
"""Prepare and apply confined Markdown imports with native image attachments."""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sys
import tempfile
import time
from urllib.parse import quote


def digest(data):
    return hashlib.sha256(data).hexdigest()


def signature(snapshot):
    # UI selection may change without changing the prepared destination.
    value = {key: value for key, value in snapshot.items() if key != 'selected_collection_id'}
    return digest(json.dumps(value, sort_keys=True, ensure_ascii=True, allow_nan=False).encode())


def legacy_source_path(snapshot):
    """Compatibility for a still-running Node host that predates PDF-aware imports."""
    if snapshot.get('source_pdf_path'):
        return
    from urllib.request import Request, ProxyHandler, HTTPRedirectHandler, build_opener
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            raise ValueError('The local Bridge must not redirect requests')
    config_path = Path(__file__).resolve().parent.parent / 'bridge-config.json'
    config = json.loads(config_path.read_text(encoding='utf-8-sig')) if config_path.is_file() else {}
    token = os.environ.get('ZOTERO_BRIDGE_TOKEN') or config.get('token')
    port = int(os.environ.get('ZOTERO_BRIDGE_PORT') or config.get('port', 23119))
    if not token or not 1 <= port <= 65535:
        raise ValueError('Configure Codex in the Bridge settings before importing')
    request = Request(f'http://127.0.0.1:{port}/codex-zotero/v1',
        data=json.dumps(dict(action='attachment',attachment_id=snapshot['attachment_id'])).encode(),
        headers={'Content-Type':'application/json','Authorization':'Bearer '+token,'Zotero-Allowed-Request':'1'},method='POST')
    with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=30) as response:
        result = json.loads(response.read(1024 * 1024))
    if not result.get('ok'):
        raise ValueError('Could not resolve the source PDF through Bridge')
    snapshot['source_pdf_path'] = result['result']['file_path']


def parts(relative):
    if not isinstance(relative, str) or '\x00' in relative:
        raise ValueError('Invalid relative path')
    relative = relative.replace('\\', '/')
    if relative.startswith('/') or re.match(r'^[A-Za-z]:', relative):
        raise ValueError('Use a path relative to the Obsidian vault')
    result = [value for value in relative.split('/') if value]
    if any(value in ('.', '..') or re.search(r'[<>:"|?*\x00-\x1f]', value) or value.endswith((' ', '.')) or re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', value, re.I) for value in result):
        raise ValueError('Relative path contains an unsupported folder or filename')
    return result


def confined(vault, relative):
    segments = parts(relative)
    if any(value.casefold() == '.obsidian' for value in segments):
        raise ValueError('Imports cannot write the Obsidian configuration directory')
    target = vault.joinpath(*segments).resolve()
    try:
        resolved = target.relative_to(vault)
    except ValueError:
        raise ValueError('The target path leaves the configured vault') from None
    if any(value.casefold() == '.obsidian' for value in resolved.parts):
        raise ValueError('Imports cannot write the Obsidian configuration directory')
    if target == vault:
        raise ValueError('Expected a file or subfolder, not the vault root')
    return target


def filename(value, limit=100):
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f\[\]#%]', '_', str(value)).strip(' .')[:limit].rstrip(' .') or '未命名'
    if re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', value, re.I):
        value = '_' + value
    return value


def plain(value):
    return re.sub(r'([\\`*_{}\[\]()<>!|])', r'\\\1', str(value).replace('\r\n', '\n').replace('\r', '\n'))


def quoted(value):
    return '\n'.join('> ' + plain(line) for line in str(value).splitlines())


def source_vocabulary(snapshot):
    """Use this paper's unbroken words to distinguish wrapping from compounds."""
    path = snapshot.get('source_pdf_path')
    words = set()
    if path:
        import pymupdf
        with pymupdf.open(path) as document:
            for page in document:
                words.update(word.casefold() for word in re.findall(
                    r'[A-Za-z]+(?:[-–][A-Za-z]+)*', page.get_text()))
    # A small, reviewed technical lexicon covers words only printed across lines.
    words.update(('tensor', 'tensors', 'framework', 'attention', 'encoding',
                  'representations', 'hierarchy', 'fusion', 'selectively'))
    return words


def natural_quote(value, vocabulary=()):
    """Reflow physical PDF lines, preserve paragraph breaks and real hyphens."""
    value = str(value).replace('\r\n', '\n').replace('\r', '\n')
    value = re.sub(r'\u00ad\s*', '', value)
    paragraphs = re.split(r'\n[ \t]*\n+', value.strip())
    def unwrap(match):
        left, hyphen, right = match.groups()
        compound = left + hyphen + right
        joined = left + right
        if hyphen == '-' and compound.casefold() not in vocabulary and joined.casefold() in vocabulary:
            return joined
        return compound
    result = []
    for paragraph in paragraphs:
        paragraph = re.sub(r'([A-Za-z]+)([-–])\s+([A-Za-z]+)', unwrap, paragraph)
        result.append(re.sub(r'\s+', ' ', paragraph).strip())
    return '\n\n'.join(result)


def callout(page, sections, kind='annotation'):
    suffix = ' · 图表' if kind == 'chart' else ' · 图片' if kind == 'image' else ''
    header = '> [!note] Page ' + plain(page).replace('\n', ' ') + suffix
    # Every line, including image/link and blank lines, belongs to the callout.
    lines = '\n\n'.join(sections).splitlines()
    return header + '\n>\n' + '\n'.join('> ' + line if line else '>' for line in lines)


def read_note(path):
    if not path.exists():
        return None
    if not path.is_file() or path.stat().st_size > 10 * 1024 * 1024:
        raise ValueError('Target note is not a file or exceeds 10 MB')
    data = path.read_bytes()
    data.decode('utf-8')  # Preserve a UTF-8 BOM if one exists.
    return data


def choose_collection(snapshot, args):
    options = snapshot['collections']
    selected = args.get('collection_id') or snapshot.get('selected_collection_id')
    if selected:
        match = next((value for value in options if value['collection_id'] == selected), None)
        if not match:
            raise ValueError('The chosen collection does not contain this paper')
        return match
    if len(options) == 1:
        return options[0]
    if not options:
        return None
    return False


def prepare(snapshot, args):
    settings = snapshot['settings']
    raw_vault = settings['vault_path']
    if not raw_vault or not Path(raw_vault).is_absolute():
        raise ValueError('Set an absolute Obsidian vault path in Zotero settings first')
    vault = Path(raw_vault).resolve()
    if not vault.is_dir() or not (vault / '.obsidian').is_dir():
        raise ValueError('The configured directory is not an existing Obsidian vault')
    top = parts(settings['top_folder'])
    collection = None
    if settings['folder_layout'] == 'collections' and not args.get('target_note'):
        collection = choose_collection(snapshot, args)
        if collection is False:
            return dict(needs_collection=True, attachment_id=snapshot['attachment_id'], collections=snapshot['collections'], message='Specify collection_id or select one of these collections in Zotero')
    elif settings['folder_layout'] not in ('collections', 'flat'):
        raise ValueError('Invalid configured folder layout')
    folders = top + ([filename(value) for value in collection['path']] if collection else [])
    relative = args.get('target_note') or '/'.join(folders + [filename(snapshot['title']) + ' [' + snapshot['attachment_id'][2:] + '].md'])
    note = confined(vault, relative)
    if note.suffix.lower() != '.md' or '.obsidian' in note.relative_to(vault).parts:
        raise ValueError('Choose a Markdown note outside the .obsidian configuration directory')
    original = read_note(note)
    identity = '<!-- codex-zotero-note:' + snapshot['attachment_id'] + ' -->'
    if original is not None and not args.get('target_note') and identity not in original.decode('utf-8'):
        raise ValueError('The default filename belongs to another note; provide target_note explicitly to append imports')
    title = plain(snapshot['title']).replace('\n', ' ')
    text = original.decode('utf-8') if original is not None else f'{identity}\n# {title}\n\n'
    known = {value['annotation_id']: value for value in snapshot['annotations']}
    selected = args.get('annotation_ids', list(known))
    if len(set(selected)) != len(selected) or any(key not in known for key in selected):
        raise ValueError('Annotation IDs must be unique and belong to this attachment')
    if not selected:
        raise ValueError('There are no annotations to import')
    selected_set = set(selected)
    annotations = [value for value in snapshot['annotations'] if value['annotation_id'] in selected_set]
    if len(annotations) > 500:
        raise ValueError('Import at most 500 annotations at a time using annotation_ids')
    overrides = {}
    for override in args.get('content_kinds', []):
        key = override['annotation_id']
        if key not in selected_set or key in overrides or known[key]['type'] != 'image':
            raise ValueError('Image kind overrides must identify distinct selected image annotations')
        overrides[key] = override['kind']
    omitted = set(args.get('omit_comments_for', []))
    if not omitted <= selected_set:
        raise ValueError('omit_comments_for must refer to selected annotations')
    assets, preview = [], []
    vocabulary = source_vocabulary(snapshot)
    attachment_folder = 'images'
    app_json = vault / '.obsidian/app.json'
    if app_json.is_file() and app_json.stat().st_size < 65536:
        try:
            attachment_folder = json.loads(app_json.read_text(encoding='utf-8')).get('attachmentFolderPath') or 'images'
        except (ValueError, UnicodeError):
            pass
    for annotation in annotations:
        key = annotation['annotation_id']
        kind = overrides.get(key, annotation['content_kind'])
        start = f'<!-- codex-zotero-annotation:{snapshot["attachment_id"]}:{key}:begin -->'
        end = f'<!-- codex-zotero-annotation:{snapshot["attachment_id"]}:{key}:end -->'
        body = []
        if annotation['type'] == 'image':
            source = Path(annotation['image_path']) if annotation['image_path'] else None
            if source is None or not source.is_file() or source.stat().st_size > 6 * 1024 * 1024:
                raise ValueError(f'Image cache missing for {key}; open the PDF in Zotero to generate its annotation images')
            data = source.read_bytes()
            if not data.startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('Native image cache is not a PNG')
            sha = digest(data)
            name = filename(snapshot['title'], 45) + '-' + snapshot['attachment_id'][2:] + '-' + key[2:] + '-' + sha[:12] + '.png'
            if attachment_folder == '.':
                asset_relative = (note.parent / name).relative_to(vault).as_posix()
            elif attachment_folder.startswith('./') or attachment_folder.startswith('.\\'):
                parent = note.parent.relative_to(vault).as_posix()
                asset_relative = '/'.join(([parent] if parent != '.' else []) + parts(attachment_folder[2:]) + [name])
            else:
                asset_relative = '/'.join([*parts(attachment_folder), name])
            target = confined(vault, asset_relative)
            if '.obsidian' in target.relative_to(vault).parts:
                raise ValueError('Attachments must be outside the vault configuration directory')
            if target.exists() and (not target.is_file() or digest(target.read_bytes()) != sha):
                raise ValueError('An image with different content already uses the export filename')
            assets.append(dict(source_path=str(source.resolve()), relative_path=asset_relative, sha256=sha))
            embed = os.path.relpath(target, note.parent).replace('\\', '/')
            body.append('![第 ' + plain(annotation['page_label']) + ' 页图片](' + quote(embed, safe='/.-_') + ')')
        elif annotation.get('text'):
            body.append(plain(natural_quote(annotation['text'], vocabulary)))
        elif annotation['type'] not in ('note',):
            raise ValueError(f'Unsupported annotation type for Markdown import: {annotation["type"]}')
        include_comment = args.get('include_comments', True) and key not in omitted
        if include_comment and annotation.get('comment'):
            body.append(plain(annotation['comment']))
        link = settings['links']['effective'][kind]
        if link:
            body.append('[返回 Zotero 标注](zotero://open-pdf/library/items/' + snapshot['attachment_id'][2:] + '?annotation=' + key[2:] + ')')
        block = start + '\n' + callout(annotation['page_label'], body, kind) + '\n' + end
        starts = list(re.finditer(r'^' + re.escape(start) + r'\r?$', text, re.M))
        ends = list(re.finditer(r'^' + re.escape(end) + r'\r?$', text, re.M))
        if starts or ends:
            if len(starts) != 1 or len(ends) != 1 or starts[0].start() >= ends[0].start():
                raise ValueError('Managed annotation markers were edited or duplicated; repair the note before importing')
            text = text[:starts[0].start()] + block + text[ends[0].end():]
        else:
            text = text + ('' if text.endswith('\n\n') else '\n' if text.endswith('\n') else '\n\n') + block + '\n'
        preview.append(dict(annotation_id=key, page_label=annotation['page_label'], content_kind=kind, includes_comment=bool(include_comment and annotation.get('comment')), includes_link=link, display_text=natural_quote(annotation.get('text', ''), vocabulary)))
    content = text.encode('utf-8')
    if len(content) > 10 * 1024 * 1024:
        raise ValueError('Imported note would exceed 10 MB; select fewer annotations')
    source_sha = digest(Path(snapshot['source_pdf_path']).read_bytes()) if snapshot.get('source_pdf_path') else None
    plan = dict(attachment_id=snapshot['attachment_id'], snapshot_sha256=signature(snapshot), source_pdf_sha256=source_sha, vault=str(vault), note_relative_path=note.relative_to(vault).as_posix(), original_sha256=digest(original) if original is not None else None, content=text, content_sha256=digest(content), assets=assets, created=time.time())
    return dict(attachment_id=snapshot['attachment_id'], note_path=str(note), collection=collection, action='update' if original is not None else 'create', annotation_count=len(annotations), annotations=preview, image_paths=[str(confined(vault, value['relative_path'])) for value in assets], markdown_preview=text[:4000], expires_in_minutes=60, _obsidian_plan=plan)


def install_file(target, data, vault, expected=None):
    # Resolve again immediately before writing, including newly created parents.
    relative = target.relative_to(vault).as_posix()
    if confined(vault, relative) != target:
        raise ValueError('Destination changed during import')
    target.parent.mkdir(parents=True, exist_ok=True)
    if confined(vault, relative) != target:
        raise ValueError('Destination changed during directory creation')
    fd, name = tempfile.mkstemp(prefix='.codex-zotero-', suffix='.tmp', dir=target.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, 'wb') as file:
            file.write(data)
            file.flush()
            os.fsync(file.fileno())
        current = target.read_bytes() if target.exists() else None
        if (digest(current) if current is not None else None) != expected:
            if current == data:
                return
            raise ValueError('Destination file changed; prepare a new import')
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def apply(plan, snapshot):
    if plan['created'] < time.time() - 3600:
        raise ValueError('Import plan expired; prepare again')
    if signature(snapshot) != plan['snapshot_sha256']:
        raise ValueError('Zotero annotations or import settings changed; prepare again')
    if plan.get('source_pdf_sha256') and digest(Path(snapshot['source_pdf_path']).read_bytes()) != plan['source_pdf_sha256']:
        raise ValueError('The source PDF changed after preparation; prepare again')
    vault = Path(plan['vault']).resolve()
    if Path(snapshot['settings']['vault_path']).resolve() != vault:
        raise ValueError('The vault path now resolves to a different directory; prepare again')
    if not vault.is_dir() or not (vault / '.obsidian').is_dir():
        raise ValueError('The configured vault is no longer available')
    note = confined(vault, plan['note_relative_path'])
    current = read_note(note)
    sha = digest(current) if current is not None else None
    if sha not in (plan['original_sha256'], plan['content_sha256']):
        raise ValueError('The note changed after preparation; prepare again to preserve your edits')
    # Validate all inputs before the first filesystem write.
    images = []
    for asset in plan['assets']:
        source = Path(asset['source_path'])
        if not source.is_file() or source.stat().st_size > 6 * 1024 * 1024:
            raise ValueError('An image cache disappeared or grew too large; prepare again')
        data = source.read_bytes()
        if digest(data) != asset['sha256']:
            raise ValueError('An image changed after preparation; prepare again')
        target = confined(vault, asset['relative_path'])
        if target.exists() and (not target.is_file() or digest(target.read_bytes()) != asset['sha256']):
            raise ValueError('An attachment filename now contains different content')
        images.append((target, data))
    content = plan['content'].encode('utf-8')
    if digest(content) != plan['content_sha256']:
        raise ValueError('Invalid import plan content')
    backup = None
    if current is not None and sha != plan['content_sha256']:
        backup = confined(vault, '.codex-zotero-backups/' + time.strftime('%Y%m%d-%H%M%S') + '-' + secrets.token_hex(4) + '-' + note.name)
        install_file(backup, current, vault)
    for target, data in images:
        if not target.exists():
            install_file(target, data, vault)
    if sha != plan['content_sha256']:
        install_file(note, content, vault, expected=plan['original_sha256'])
    return dict(note_path=str(note), image_count=len(images), backup_path=str(backup) if backup else None, reused=sha == plan['content_sha256'])


if __name__ == '__main__':
    try:
        request = json.load(sys.stdin)
        legacy_source_path(request['snapshot'])
        output = prepare(request['snapshot'], request['args']) if request['operation'] == 'prepare' else apply(request['plan'], request['snapshot'])
        print(json.dumps(output, ensure_ascii=True, allow_nan=False))
    except Exception as error:
        print(json.dumps(dict(error=str(error)), ensure_ascii=True))
        raise SystemExit(1)
