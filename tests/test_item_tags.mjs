// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ZoteroMcp, tools } from '../server.mjs';

let enabled = true, writable = true, saves = 0, fail = false;
const paper = { id: 1, key: 'PAPER001', libraryID: 1, deleted: false,
    tags: [{ tag: 'robotics', type: 0 }], persisted: [{ tag: 'robotics', type: 0 }],
    isRegularItem: () => true, isPDFAttachment: () => false,
    async loadDataType() {}, getField: () => 'Test paper', getTags() { return structuredClone(this.tags); },
    addTag(tag, type) { this.tags.push({ tag, type }); },
    async save() { if (fail) throw Error('save failed'); saves++; this.persisted = structuredClone(this.tags); },
    async reload() { this.tags = structuredClone(this.persisted); }
};
const pdf = { key: 'PDF00001', libraryID: 1, parentID: 1, isPDFAttachment: () => true };
const standalone = { ...pdf, key: 'PDF00002', parentID: null, isRegularItem: () => false };
const note = { ...standalone, key: 'NOTE0001', isPDFAttachment: () => false };
const Zotero = { Libraries: { userLibraryID: 1, get: () => ({ editable: writable }) },
    Items: { async getByLibraryAndKeyAsync(_, key) { return [paper, pdf, standalone, note].find(x => x.key === key); }, async getAsync() { return paper; } },
    DB: { async executeTransaction(fn) { await fn(); } }
};
const context = vm.createContext({ Zotero, TextEncoder, Set, JSON });
vm.runInContext(fs.readFileSync(new URL('../plugin/content/bridge.js', import.meta.url), 'utf8'), context);
const bridge = context.CodexZoteroBridge;
bridge.assertEnabled = write => { if (write && !enabled) throw Error('disabled'); };
const app = new ZoteroMcp();
app.bridge = async (action, data) => action === 'item_tags' ? bridge.itemTags(data.item_id) : bridge.applyItemTags(data);
const call = (name, args) => app.call(`zotero_${name}`, args);
let snapshot = await call('get_item_tags', { item_id: 'u-PDF00001' });
assert.equal(snapshot.item_id, 'u-PAPER001');
const prepare = tags => call('prepare_item_tags', { item_id: 'u-PDF00001', tags });
const apply = plan => call('apply_item_tags', { plan_id: plan.plan_id });
let plan = await prepare([' robotics ', 'world model', 'world model', 'e\u0301', 'é']);
assert.deepEqual(plan.additions, ['world model', 'é']);
assert.equal(saves, 0);
let result = await apply(plan);
assert.equal(result.added.length, 2);
assert.equal(paper.tags.find(x => x.tag === 'robotics').type, 0);
assert.equal(paper.tags.find(x => x.tag === 'world model').type, 1);
await apply(plan); assert.equal(saves, 1);
plan = await prepare(['new']);
paper.tags.push({ tag: 'hand edited', type: 0 }); paper.persisted = structuredClone(paper.tags);
await assert.rejects(apply(plan), /changed/);
assert.ok(!paper.tags.some(x => x.tag === 'new'));
plan = await prepare(['new']); enabled = false;
await assert.rejects(apply(plan), /disabled/); enabled = true;
writable = false; await assert.rejects(apply(plan), /read-only/); writable = true;
fail = true; await assert.rejects(apply(plan), /save failed/); fail = false;
assert.ok(!paper.tags.some(x => x.tag === 'new')); await apply(plan);
for (const item_id of ['u-PDF00002', 'u-NOTE0001', 'u-UNKNOWN1', 'g-PAPER001']) await assert.rejects(call('get_item_tags', { item_id }));
paper.deleted = true; await assert.rejects(call('get_item_tags', { item_id: 'u-PDF00001' })); paper.deleted = false;
for (const tags of [[' '], ['a\n'], [], Array(51).fill('a'), ['a'.repeat(201)]]) await assert.rejects(prepare(tags));
app.tagPlans.get(plan.plan_id).created = Date.now() - 3600001;
await assert.rejects(apply(plan), /expired/);
assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../tools/mcp-tools.json', import.meta.url))), tools);
console.log('Item tags: parent resolution, normalization, preservation, automatic type, retries, stale plans, gating, rollback, validation, expiry and schema parity passed.');
