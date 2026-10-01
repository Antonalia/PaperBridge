# SPDX-License-Identifier: AGPL-3.0-or-later
import sys, time, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from portable_mcp import ZoteroMcp

class ItemTags(unittest.TestCase):
    def test_prepare_apply(self):
        app = ZoteroMcp(Path('unused.json'))
        calls = []
        def bridge(action, **data):
            calls.append((action, data))
            return dict(item_id='u-PAPER001', tags=[dict(tag='robotics', type=0)]) if action == 'item_tags' else data
        app.bridge = bridge
        args = dict(item_id='u-PDF00001', tags=[' robotics ', 'world model', 'world model', 'e\u0301', 'é'])
        plan = app.call('zotero_prepare_item_tags', args)
        self.assertEqual(plan['additions'], ['world model', 'é'])
        self.assertEqual(len(calls), 1)
        result = app.call('zotero_apply_item_tags', dict(plan_id=plan['plan_id']))
        self.assertEqual(result['item_id'], 'u-PAPER001')
        self.assertEqual(result['expected_tags'], [dict(tag='robotics', type=0)])
        self.assertNotIn('created', result)
        app.tag_plans[plan['plan_id']]['created'] = time.time() - 3601
        with self.assertRaisesRegex(ValueError, 'expired'):
            app.call('zotero_apply_item_tags', dict(plan_id=plan['plan_id']))
        for tags in ([' '], ['a\n'], [], ['a'] * 51, ['a' * 201]):
            with self.assertRaises(ValueError): app.call('zotero_prepare_item_tags', dict(item_id='u-PAPER001', tags=tags))

if __name__ == '__main__': unittest.main()
