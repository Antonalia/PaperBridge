# SPDX-License-Identifier: AGPL-3.0-or-later
import json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from skill_install import install_skills

class Skills(unittest.TestCase):
    def test_install_update_future_conflicts_and_language(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); source = root/'bundle'; home = root/'codex'
            skill = source/'paper-reader'; skill.mkdir(parents=True)
            (skill/'SKILL.md').write_text('Chinese v1', encoding='utf-8')
            (skill/'SKILL.en.md').write_text('English v1', encoding='utf-8')
            result = install_skills(source, home)
            self.assertEqual(result[0]['state'], 'installed')
            self.assertEqual(install_skills(source, home)[0]['state'], 'current')
            (skill/'SKILL.md').write_text('Chinese v2', encoding='utf-8')
            self.assertEqual(install_skills(source, home)[0]['state'], 'updated')
            installed = home/'skills/paper-reader/SKILL.md'
            self.assertEqual(installed.read_text(encoding='utf-8'), 'Chinese v2')
            self.assertEqual(install_skills(source, home, 'en')[0]['state'], 'updated')
            self.assertEqual(installed.read_text(encoding='utf-8'), 'English v1')
            installed.write_text('my edits', encoding='utf-8')
            future = source/'future-skill'; future.mkdir(); (future/'SKILL.md').write_text('new', encoding='utf-8')
            result = {x['name']: x['state'] for x in install_skills(source, home)}
            self.assertEqual(result, {'future-skill':'installed', 'paper-reader':'preserved'})
            self.assertEqual(installed.read_text(encoding='utf-8'), 'my edits')
            external = home/'skills/future-skill'; (external/'extra.md').write_text('mine')
            self.assertEqual(install_skills(source, home)[0]['state'], 'preserved')
            self.assertEqual(json.loads((home/'paperbridge-skills.json').read_text())['future-skill'].keys(), {'SKILL.md'})

    def test_independent_identical_or_conflicting_skill(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary); source=root/'bundle'; home=root/'codex'
            bundle=source/'reader'; bundle.mkdir(parents=True); (bundle/'SKILL.md').write_text('bundled')
            target=home/'skills/reader'; target.mkdir(parents=True); (target/'SKILL.md').write_text('mine')
            self.assertEqual(install_skills(source,home)[0]['state'],'preserved')
            (target/'SKILL.md').write_text('bundled')
            self.assertEqual(install_skills(source,home)[0]['state'],'current')
            (bundle/'SKILL.md').write_text('new bundled')
            self.assertEqual(install_skills(source,home)[0]['state'],'updated')

if __name__ == '__main__': unittest.main()
