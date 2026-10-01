// SPDX-License-Identifier: AGPL-3.0-or-later
// Exercise the actual plugin with an isolated Zotero/IOUtils model. No personal data.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = name => fs.readFileSync(path.join(root, 'plugin/content', name), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const fields = ['libraryID', 'key', 'parentID', 'annotationType', 'annotationText', 'annotationComment', 'annotationColor', 'annotationPageLabel', 'annotationSortIndex', 'annotationPosition', 'annotationAuthorName'];
const id = number => number.toString(16).padStart(32, '0');
function harness() {
    const files = new Map(), persisted = new Map(), cache = new Map(), events = [], prefs = new Map();
    let serial = 1, nextID = 2, saveCount = 0, writeCount = 0;
    const faults = { write: null, save: null, cache: null };
    class Item {
        constructor(type = 'annotation') { this.values = { type, tags: [], relations: {}, deleted: false }; this.primaryLoaded = false; }
        get id() { return this.values.id; }
        get deleted() { return this.values.deleted; }
        set deleted(value) { this.values.deleted = value; }
        isAnnotation() { return this.values.type === 'annotation'; }
        async loadPrimaryData() { this.primaryLoaded = true; }
        async loadDataType() {}
        addTag(tag) { this.values.tags.push(tag); }
        addRelation() { throw new Error('Plugin must not write synced relations'); }
        getRelations() { return clone(this.values.relations); }
        getRelationsByPredicate(predicate) { return [...(this.values.relations[predicate] || [])]; }
        removeRelation(predicate, uri) {
            events.push({ event: 'remove', key: this.key, uri });
            this.values.relations[predicate] = (this.values.relations[predicate] || []).filter(value => value !== uri);
            if (!this.values.relations[predicate].length) delete this.values.relations[predicate];
        }
        async save(options = {}) {
            saveCount++;
            events.push({ event: 'save', key: this.key, options });
            if (faults.save?.(saveCount, this)) throw new Error('injected database failure');
            if (!this.values.id) this.values.id = nextID++;
            persisted.set(this.id, clone(this.values)); cache.set(this.id, this);
        }
        async reload() {
            events.push({ event: 'reload', key: this.key });
            this.values = clone(persisted.get(this.id));
        }
    }
    for (const name of fields) Object.defineProperty(Item.prototype, name, {
        get() { return this.values[name]; },
        set(value) {
            if (name === 'key' && !this.values.libraryID) throw new Error('Set libraryID before key');
            if (!['key', 'libraryID'].includes(name) && this.values.key && !this.primaryLoaded) throw new Error('UnloadedDataException');
            this.values[name] = value;
        }
    });
    const attachment = new Item('attachment');
    attachment.values = { id: 1, type: 'attachment', libraryID: 1, key: 'ABCDEFGH', deleted: false, relations: {}, tags: [] };
    attachment.primaryLoaded = true; persisted.set(1, clone(attachment.values)); cache.set(1, attachment);
    const get = itemID => {
        if (!persisted.has(itemID)) return null;
        if (!cache.has(itemID)) { const item = new Item(); item.values = clone(persisted.get(itemID)); item.primaryLoaded = true; cache.set(itemID, item); }
        return cache.get(itemID);
    };
    const Zotero = {
        DataDirectory: { dir: '/isolated-zotero' },
        Libraries: { userLibraryID: 1, get: libraryID => ({ editable: libraryID !== 99 }) },
        DataObjectUtilities: { generateKey: () => (serial++).toString(36).toUpperCase().padStart(8, '0') },
        Item,
        Items: {
            async getByLibraryAndKeyAsync(libraryID, key) {
                const row = [...persisted.values()].find(item => item.libraryID === libraryID && item.key === key);
                return row ? get(row.id) : null;
            },
            async getAsync(ids) { return Array.isArray(ids) ? ids.map(get) : get(ids); }
        },
        DB: {
            async columnQueryAsync(sql, parameters) {
                assert.match(sql, /itemRelations JOIN relationPredicates/);
                assert.equal(parameters[0], 'dc:relation');
                return [...persisted.values()].filter(item => (item.relations['dc:relation'] || []).some(uri => /^urn:codex-(pdf-bridge:|zotero:content-kind:)/.test(uri))).map(item => item.id);
            },
            async executeTransaction(callback) {
                const before = new Map([...persisted].map(([key, value]) => [key, clone(value)]));
                try { return await callback(); }
                catch (error) {
                    persisted.clear(); for (const [key, value] of before) persisted.set(key, value);
                    for (const key of cache.keys()) if (!before.has(key)) cache.delete(key);
                    throw error;
                }
            }
        },
        Annotations: {
            async saveCacheImage(item, blob) {
                events.push({ event: 'cache', key: item.key });
                if (faults.cache?.(item)) throw new Error('injected cache failure');
                assert.equal(blob.type, 'image/png');
            }
        },
        logError(error) { events.push({ event: 'error', message: error.message }); }
    };
    const IOUtils = {
        async makeDirectory() {},
        async exists(file) { return files.has(file); },
        async readJSON(file) { return clone(files.get(file)); },
        async writeJSON(file, value, options) {
            writeCount++;
            assert.equal(options.tmpPath, file + '.tmp'); assert.equal(options.flush, true);
            if (faults.write?.(file, value, writeCount)) throw new Error('injected metadata failure');
            files.set(file, clone(value)); events.push({ event: 'write', file, value: clone(value) });
        }
    };
    function load() {
        const context = vm.createContext({ Zotero, IOUtils, PathUtils: path.posix, TextEncoder, atob, Blob });
        vm.runInContext(source('metadata.js'), context); vm.runInContext(source('bridge.js'), context);
        const bridge = context.CodexZoteroBridge, metadata = context.PaperBridgeMetadata;
        bridge.get = key => prefs.get(key);
        bridge.assertEnabled = () => {};
        bridge.attachment = async () => ({ item: attachment, filePath: '/fixture.pdf' });
        bridge.digest = async () => 'f'.repeat(64);
        bridge.digestText = sha;
        return { bridge, metadata };
    }
    function seed(key, options = {}) {
        const item = new Item();
        item.values = { id: nextID++, type: 'annotation', libraryID: 1, key, parentID: 1, annotationType: 'highlight', annotationText: 'Original sentence.',
            annotationComment: 'Original comment', annotationColor: '#ffd400', annotationPageLabel: '1', annotationSortIndex: '00000|000001|00001',
            annotationPosition: '{"pageIndex":0,"rects":[[1,1,20,10]]}', annotationAuthorName: 'Codex', tags: ['keep'], relations: {}, deleted: false, ...options };
        item.primaryLoaded = true; persisted.set(item.id, clone(item.values)); cache.set(item.id, item); return item;
    }
    return { files, persisted, events, prefs, faults, attachment, load, seed, get, get saveCount() { return saveCount; } };
}
const png = Buffer.alloc(24); Buffer.from('\x89PNG\r\n\x1a\n', 'latin1').copy(png); png.writeUInt32BE(1,16); png.writeUInt32BE(1,20);
function input(type = 'highlight') {
    return { type, page_index: 0, rects: [[1,1,20,10]], view_box: [0,0,100,100], text: 'One complete sentence.',
        comment: 'Explanation', offset: 1, page_label: '1', tags: [], ...(type === 'image' ? { image_base64: png.toString('base64'), color_role: 'chart' } : {}) };
}
const request = (number = 1, annotations = [input()]) => ({ request_id: id(number), attachment_id: 'u-ABCDEFGH', page_count: 1, file_sha256: 'f'.repeat(64), annotations });
async function ready(h = harness()) { const loaded = h.load(); await loaded.metadata.initialize(loaded.bridge); return { h, ...loaded }; }
let passed = 0;
async function test(name, action) { await action(); passed++; console.log('PASS ' + name); }

await test('native creation and restart retry use local journal; image kind survives', async () => {
    const { h, bridge, metadata } = await ready(); const data = request(1, [input(), input('image')]);
    const first = await bridge.apply(data); assert.equal(first.created.length, 2); assert.equal(first.already_applied, false);
    for (const item of [...h.persisted.values()].filter(item => item.type === 'annotation')) assert.deepEqual(item.relations, {});
    const item = h.get([...h.persisted.values()].find(item => item.annotationType === 'image').id);
    assert.equal(metadata.kind(item), 'chart');
    const reboot = h.load(); await reboot.metadata.initialize(reboot.bridge);
    const retry = await reboot.bridge.apply(data); assert.equal(retry.already_applied, true);
    assert.deepEqual(clone(retry.created), clone(first.created)); assert.equal(h.saveCount, 2);
    assert.equal(reboot.metadata.kind(item), 'chart');
});
await test('journal retains requests beyond the old 100-request limit', async () => {
    const { h, bridge } = await ready(); const original = await bridge.apply(request());
    for (let number = 2; number <= 103; number++) await bridge.apply(request(number));
    const reboot = h.load(); await reboot.metadata.initialize(reboot.bridge);
    const retry = await reboot.bridge.apply(request()); assert.equal(retry.already_applied, true);
    assert.deepEqual(clone(retry.created), clone(original.created)); assert.equal(h.saveCount, 103);
});
await test('changed payload is rejected without creating another annotation', async () => {
    const { h, bridge } = await ready(); await bridge.apply(request());
    const data = request(); data.annotations[0].comment = 'Changed';
    await assert.rejects(bridge.apply(data), /different annotations/); assert.equal(h.saveCount, 1);
});
await test('a journal write failure before the transaction creates nothing', async () => {
    const { h, bridge } = await ready(); h.faults.write = () => true;
    await assert.rejects(bridge.apply(request()), /metadata failure/); assert.equal(h.saveCount, 0);
    h.faults.write = null; await bridge.apply(request()); assert.equal(h.saveCount, 1);
});
await test('database rollback reuses reserved keys after restart', async () => {
    const { h, bridge, metadata } = await ready(); const data = request(1, [input(), input()]);
    h.faults.save = count => count === 2; await assert.rejects(bridge.apply(data), /database failure/);
    assert.equal(h.persisted.size, 1); const reserved = clone(metadata.state.requests[id(1)].entries);
    h.faults.save = null; const reboot = h.load(); await reboot.metadata.initialize(reboot.bridge);
    const retry = await reboot.bridge.apply(data);
    assert.equal(retry.created[0].annotation_id, 'u-' + reserved[0].key); assert.equal(h.persisted.size, 3);
});
await test('metadata failure after database commit recovers without duplicates', async () => {
    const { h, bridge } = await ready(); let writes = 0;
    h.faults.write = () => ++writes === 2;
    await assert.rejects(bridge.apply(request()), /metadata failure/); assert.equal(h.saveCount, 1);
    h.faults.write = null; const reboot = h.load(); await reboot.metadata.initialize(reboot.bridge);
    assert.equal((await reboot.bridge.apply(request())).already_applied, true); assert.equal(h.saveCount, 1);
});
await test('image cache failure retries the cache on the same annotation', async () => {
    const { h, bridge } = await ready(); const data = request(1, [input('image')]);
    h.faults.cache = () => true; await assert.rejects(bridge.apply(data), /cache failure/);
    h.faults.cache = null; const reboot = h.load(); await reboot.metadata.initialize(reboot.bridge);
    assert.equal((await reboot.bridge.apply(data)).already_applied, true); assert.equal(h.saveCount, 1);
    assert.equal(h.events.filter(event => event.event === 'cache').length, 2);
});
await test('retry refuses to recreate an annotation that the user deleted', async () => {
    const { h, bridge } = await ready(); const saved = await bridge.apply(request());
    const item = [...h.persisted.values()].find(row => row.key === saved.created[0].annotation_id.slice(2));
    h.persisted.delete(item.id);
    await assert.rejects(bridge.apply(request()), /no longer exists/); assert.equal(h.saveCount, 1);
});
await test('migration backs up first, preserves valid relations and every annotation field', async () => {
    const h = harness(); const valid = 'http://zotero.org/users/1/items/ZXCVBNMA', other = 'urn:another-plugin:keep';
    const legacy = 'urn:codex-pdf-bridge:' + id(5) + ':0:' + 'a'.repeat(64);
    const item = h.seed('HIGHLGHT', { relations: { 'dc:relation': [legacy, valid, other], 'owl:sameAs': [valid] } });
    const chart = h.seed('CHARTKEY', { annotationType: 'image', relations: { 'dc:relation': ['urn:codex-zotero:content-kind:chart'] } });
    const before = clone(item.values); const { metadata } = await ready(h);
    const result = await metadata.migrate(); assert.equal(result.repaired_annotations, 2); assert.equal(result.removed_relations, 2);
    const backup = h.files.get(result.backup_path); assert.equal(backup.annotations.length, 2);
    assert.deepEqual(backup.annotations[0].relations, before.relations);
    assert.deepEqual(item.getRelationsByPredicate('dc:relation'), [valid, other]);
    const after = clone(item.values); delete before.relations; delete after.relations; assert.deepEqual(after, before);
    assert.equal(metadata.kind(chart), 'chart');
    assert.equal(metadata.state.requests[id(5)].entries[0].key, item.key);
    const backupIndex = h.events.findIndex(event => event.event === 'write' && event.file === result.backup_path);
    assert.ok(backupIndex < h.events.findIndex(event => event.event === 'remove'));
    assert.equal((await metadata.migrate()).repaired_annotations, 0);
});
await test('backup or metadata failure leaves all old relations untouched', async () => {
    for (const failBackup of [true, false]) {
        const h = harness(); const item = h.seed('OLDRLATE', { relations: { 'dc:relation': ['urn:codex-zotero:content-kind:chart'] } });
        const { metadata } = await ready(h); const original = item.getRelations();
        h.faults.write = file => failBackup ? file.includes('legacy-relations-') : file === metadata.path;
        await assert.rejects(metadata.migrate(), /metadata failure/); assert.deepEqual(item.getRelations(), original);
        assert.equal(h.saveCount, 0); h.faults.write = null; assert.equal((await metadata.migrate()).repaired_annotations, 1);
    }
});
await test('failed migration reloads cached relations after rollback and is retryable', async () => {
    const h = harness(); const item = h.seed('ROLLBACK', { relations: { 'dc:relation': ['urn:codex-zotero:content-kind:image'] } });
    const { metadata } = await ready(h); const original = item.getRelations();
    h.faults.save = () => true; await assert.rejects(metadata.migrate(), /database failure/);
    assert.deepEqual(item.getRelations(), original); assert.ok(h.events.some(event => event.event === 'reload'));
    h.faults.save = null; assert.equal((await metadata.migrate()).repaired_annotations, 1);
});
await test('legacy preference receipts are retained even for deleted annotations', async () => {
    const h = harness(); h.prefs.set('receipts', JSON.stringify({ [id(8)]: { payload: 'b'.repeat(64), result: { attachment_id: 'u-ABCDEFGH', created: [{ annotation_id: 'u-DELETEDK' }] } } }));
    const { metadata } = await ready(h);
    assert.equal(metadata.state.requests[id(8)].entries[0].committed, true);
    assert.equal(metadata.state.requests[id(8)].complete, true);
});
await test('conflicting legacy receipts are cleaned but blocked from reuse', async () => {
    const h = harness(); const uri = 'urn:codex-pdf-bridge:' + id(9) + ':0:' + 'c'.repeat(64);
    h.seed('CONFLCT1', { relations: { 'dc:relation': [uri] } }); h.seed('CONFLCT2', { relations: { 'dc:relation': [uri] } });
    const { metadata } = await ready(h); assert.equal((await metadata.migrate()).removed_relations, 2);
    assert.equal(metadata.state.requests[id(9)].conflict, true);
    await assert.rejects(metadata.reserve(id(9), 'c'.repeat(64), h.attachment, [input()]), /conflicting receipts/);
});
await test('invalid nested metadata blocks initialization', async () => {
    const { h, metadata, bridge } = await ready();
    const state = clone(metadata.state); state.requests[id(2)] = { payload: 'd'.repeat(64), libraryID: 1, attachmentKey: 'ABCDEFGH', entries: { 0: { key: 'BAD', committed: true } }, complete: true };
    h.files.set(metadata.path, state); await assert.rejects(metadata.initialize(bridge), /metadata is invalid/); assert.equal(metadata.state, null);
});
await test('one-click installer reads jar manifest with local resource API', async () => {
    for (const asyncReader of [true, false]) {
        const resources = [], hash = 'e'.repeat(64);
        const manifest = JSON.stringify({ platform: 'windows-x64', version: '1.0.1', filename: 'codex-zotero-mcp.exe', sha256: hash });
        const File = { getContentsFromURLAsync() { throw new Error('HTTP must not read jar resources'); },
            getResource(url) { resources.push(url); return manifest; } };
        if (asyncReader) File.getResourceAsync = async url => { resources.push(url); return manifest; };
        const context = vm.createContext({ Zotero: { isWin: true, File, Profile: { dir: '/profile' } }, PathUtils: path.posix,
            IOUtils: { async makeDirectory() {}, async exists() { return true; } } });
        vm.runInContext(source('installer.js'), context);
        context.CodexBridgeInstaller.initialize('jar:file:///plugin@local.xpi!/');
        context.CodexBridgeInstaller.digest = async () => hash;
        const paths = await context.CodexBridgeInstaller.deploy();
        assert.equal(resources[0], 'jar:file:///plugin@local.xpi!/runtime/manifest.json');
        assert.equal(paths.executable, '/profile/codex-pdf-bridge/1.0.1/codex-zotero-mcp.exe');
    }
});
console.log(JSON.stringify({ passed, synced_relation_writes: 0, personal_library_access: false }));
