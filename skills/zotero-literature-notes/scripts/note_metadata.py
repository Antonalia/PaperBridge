"""Hide Bridge comments in sidecar metadata; restore them before safe sync."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time

META = re.compile(r'(?m)(?:^|(?<=\ufeff))[ \t]*\\?<!-- ((?:codex-zotero-note:u-[A-Z0-9]{8}|codex-zotero-annotation:u-[A-Z0-9]{8}:u-[A-Z0-9]{8}:(?:begin|end)|literature-notes:expanded:(?:start|end))) -->[ \t]*(?:\r?\n|$)')
BLOCK = re.compile(r'(?m)^[ \t]*\\?<!-- codex-zotero-annotation:(u-[A-Z0-9]{8}):(u-[A-Z0-9]{8}):begin -->[ \t]*\r?\n')

def sha(data):
    return hashlib.sha256(data).hexdigest()

def strip_metadata(text):
    return META.sub('', text)

def confined(vault, target):
    target = target.resolve()
    try:
        relative = target.relative_to(vault)
    except ValueError:
        raise ValueError('Path must remain inside the chosen vault') from None
    if not relative.parts or '.obsidian' in relative.parts:
        raise ValueError('Do not write the vault root or Obsidian configuration')
    return target

def atomic(vault, target, data, expected):
    target = confined(vault, target)
    target.parent.mkdir(parents=True, exist_ok=True)
    confined(vault, target)
    current = target.read_bytes() if target.exists() else None
    if current != expected:
        raise ValueError('File changed during preparation; retry without overwriting edits')
    fd, name = tempfile.mkstemp(prefix='.note-metadata-', suffix='.tmp', dir=target.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        if (target.read_bytes() if target.exists() else None) != expected:
            raise ValueError('File changed before writing')
        for attempt in range(6):
            if (target.read_bytes() if target.exists() else None) != expected:
                raise ValueError('File changed before writing')
            try:
                os.replace(temporary, target)
                break
            except PermissionError:
                if attempt==5:
                    raise
                # Windows file watchers may briefly open a freshly changed note.
                time.sleep(0.05 * (2 ** attempt))
    finally:
        temporary.unlink(missing_ok=True)

def locations(text, value):
    if not value:
        return []
    return [m.start() for m in re.finditer(re.escape(value), text)]

def managed_blocks(text):
    entries = []
    for start in BLOCK.finditer(text):
        attachment, annotation = start.groups()
        end_pattern = re.compile(r'(?m)^[ \t]*\\?<!-- codex-zotero-annotation:' + re.escape(attachment + ':' + annotation) + r':end -->[ \t]*(?:\r?\n|$)')
        ends = list(end_pattern.finditer(text, start.end()))
        if len(ends) != 1:
            raise ValueError('Annotation boundary is missing or duplicated')
        end = ends[0]
        body = text[start.end():end.start()]
        if META.search(body) or not body.strip():
            raise ValueError('Nested/empty annotation blocks cannot be cleaned safely')
        entries.append(dict(attachment_id=attachment, annotation_id=annotation, body=body,
            start=f'<!-- codex-zotero-annotation:{attachment}:{annotation}:begin -->\n',
            end=f'<!-- codex-zotero-annotation:{attachment}:{annotation}:end -->\n'))
    identities = {(e['attachment_id'], e['annotation_id']) for e in entries}
    if len(identities) != len(entries):
        raise ValueError('Duplicate annotation IDs in note')
    return entries

def sync_metadata(vault_path, note_path, operation):
    vault = Path(vault_path).resolve()
    if not vault.is_dir() or not (vault / '.obsidian').is_dir():
        raise ValueError('Choose an existing Obsidian vault')
    note = confined(vault, Path(note_path))
    if note.suffix.lower() != '.md' or not note.is_file() or note.stat().st_size > 10 * 1024 * 1024:
        raise ValueError('Choose an existing UTF-8 Markdown note under 10 MB')
    raw = note.read_bytes(); text = raw.decode('utf-8')
    relative = note.relative_to(vault).as_posix()
    sidecar = confined(vault, vault / '.codex-zotero-sync' / (sha(relative.encode()) + '.json'))
    previous = sidecar.read_bytes() if sidecar.exists() else None
    if operation == 'clean':
        comments = list(META.finditer(text))
        if not comments:
            return dict(operation='clean', reused=True, tracked=previous is not None)
        clean = strip_metadata(text)
        blocks = managed_blocks(text)
        for entry in blocks:
            if len(locations(clean, entry['body'])) != 1:
                raise ValueError('Annotation text is not unique; keep metadata until resolved')
        offsets, removed = [], 0
        for comment in comments:
            offsets.append(dict(offset=comment.start() - removed, value=comment.group(0)))
            removed += len(comment.group(0))
        metadata = dict(version=1, note_relative_path=relative, clean_sha256=sha(clean.encode()),
            original_sha256=sha(raw), markers=offsets, blocks=blocks,
            identities=[m.group(1) for m in comments if m.group(1).startswith('codex-zotero-note:')])
        expanded_start = next((m for m in comments if m.group(1)=='literature-notes:expanded:start'), None)
        expanded_end = next((m for m in comments if m.group(1)=='literature-notes:expanded:end'), None)
        if bool(expanded_start) != bool(expanded_end):
            raise ValueError('Expanded section has an incomplete boundary')
        if expanded_start:
            if expanded_start.start() >= expanded_end.start():
                raise ValueError('Expanded section boundaries are reversed')
            metadata['expanded_body'] = strip_metadata(text[expanded_start.end():expanded_end.start()])
        # Sidecar first: interruption never leaves a clean note without its tracking map.
        atomic(vault, sidecar, (json.dumps(metadata, ensure_ascii=False, indent=2)+'\n').encode(), previous)
        backup = confined(vault, vault / '.codex-zotero-sync/backups' / (sha(raw) + '.md'))
        if not backup.exists():
            atomic(vault, backup, raw, None)
        atomic(vault, note, clean.encode(), raw)
        return dict(operation='clean', markers_removed=len(comments), annotation_blocks=len(blocks), sidecar_path=str(sidecar), backup_path=str(backup))
    if previous is None:
        return dict(operation='restore', reused=True, tracked=False)
    state = json.loads(previous)
    if state.get('version') != 1 or state.get('note_relative_path') != relative:
        raise ValueError('Sidecar does not belong to this note')
    if META.search(text):
        current = {(x['attachment_id'],x['annotation_id']) for x in managed_blocks(text)}
        expected = {(x['attachment_id'],x['annotation_id']) for x in state['blocks']}
        if current == expected:
            return dict(operation='restore', reused=True, tracked=True)
        raise ValueError('Partial restored metadata found; inspect before syncing')
    edits = []
    if sha(raw) == state['clean_sha256']:
        edits = [(m['offset'], m['value'], index) for index,m in enumerate(state['markers'])]
    else:
        # Manual edits outside imported blocks are preserved; edited/duplicated quotes
        # require deliberate reconciliation rather than guessing a match.
        for index, entry in enumerate(state['blocks']):
            found = locations(text, entry['body'])
            if len(found) != 1:
                raise ValueError('An annotation quote was edited or duplicated; reconcile it before importing')
            offset = found[0]
            edits.extend([(offset, entry['start'], index*2), (offset+len(entry['body']), entry['end'], index*2+1)])
        identity = ''.join('<!-- ' + value + ' -->\n' for value in state['identities'])
        if identity:
            edits.append((1 if text.startswith('\ufeff') else 0, identity, -1))
        expanded = state.get('expanded_body')
        found = locations(text, expanded) if expanded else []
        if len(found)==1:
            edits.extend([(found[0],'<!-- literature-notes:expanded:start -->\n',-2),
                (found[0]+len(expanded),'<!-- literature-notes:expanded:end -->\n',1000000)])
    for offset, value, order in sorted(edits, key=lambda e:(e[0],e[2]), reverse=True):
        text = text[:offset] + value + text[offset:]
    atomic(vault, note, text.encode(), raw)
    return dict(operation='restore', tracked=True, restored_blocks=len(state['blocks']), exact_roundtrip=sha(raw)==state['clean_sha256'])

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('clean','restore'))
    parser.add_argument('--vault', required=True)
    parser.add_argument('--note', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(sync_metadata(args.vault,args.note,args.operation),ensure_ascii=True))
    except Exception as error:
        print(json.dumps(dict(error=str(error)),ensure_ascii=True))
        raise SystemExit(1)
