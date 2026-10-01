# SPDX-License-Identifier: AGPL-3.0-or-later
"""Install every bundled skill, preserving user edits and tracking owned files."""
import hashlib, json, os, re, tempfile
from pathlib import Path

def install_skills(source, codex_home, language='zh'):
    source, home = Path(source), Path(codex_home)
    state_path = home / 'paperbridge-skills.json'
    previous = json.loads(state_path.read_text(encoding='utf-8')) if state_path.exists() else {}
    if not isinstance(previous, dict): raise ValueError('Invalid PaperBridge skill inventory')
    state, results = dict(previous), []
    for folder in sorted(source.iterdir()):
        if not folder.is_dir() or not (folder / 'SKILL.md').is_file(): continue
        name = folder.name
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name): raise ValueError('Invalid bundled skill name')
        target = home / 'skills' / name
        if target.is_symlink() or (home / 'skills').is_symlink(): raise ValueError('Skill destination must not be a symbolic link')
        files = {p.relative_to(folder).as_posix(): p.read_bytes() for p in folder.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc'}
        if language == 'en':
            if 'SKILL.en.md' in files: files['SKILL.md'] = files['SKILL.en.md']
            if 'agents/openai.en.yaml' in files: files['agents/openai.yaml'] = files['agents/openai.en.yaml']
        hashes = {key: hashlib.sha256(data).hexdigest() for key, data in files.items()}
        tracked = previous.get(name, {})
        existing = {p.relative_to(target).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in target.rglob('*') if p.is_file()} if target.exists() else {}
        if target.exists() and existing != hashes and (not tracked or existing != tracked):
            results.append(dict(name=name, state='preserved', reason='existing skill differs from the last managed version')); continue
        if any(key not in hashes for key in tracked):
            results.append(dict(name=name, state='preserved', reason='bundle removed files; manual review required')); continue
        if existing == hashes:
            state[name] = hashes; results.append(dict(name=name, state='current')); continue
        if any(p.is_symlink() for p in target.rglob('*')): raise ValueError('Skill files must not be symbolic links')
        for relative, data in files.items():
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            fd, temporary = tempfile.mkstemp(dir=destination.parent, prefix='.paperbridge-')
            try:
                with os.fdopen(fd, 'wb') as stream: stream.write(data)
                os.replace(temporary, destination)
            finally:
                Path(temporary).unlink(missing_ok=True)
        state[name] = hashes; results.append(dict(name=name, state='updated' if existing else 'installed'))
    home.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=home, prefix='.paperbridge-skills-')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream: json.dump(state, stream, ensure_ascii=False, indent=2)
        os.replace(temporary, state_path)
    finally: Path(temporary).unlink(missing_ok=True)
    return results
