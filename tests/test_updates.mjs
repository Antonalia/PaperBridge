// SPDX-License-Identifier: AGPL-3.0-or-later
// Execute lifecycle and installer code with isolated preferences and processes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = name => fs.readFileSync(path.join(root, 'plugin', name), 'utf8');
const manifest = JSON.parse(source('manifest.json'));
let passed = 0;
async function test(name, action) { await action(); passed++; console.log('PASS ' + name); }
function harness(configured, outcome = { ok: true, version: manifest.version }) {
    const prefix = 'extensions.zotero.codexPdfBridge.';
    const prefs = new Map([[prefix + 'configuredVersion', configured], [prefix + 'token', 'a'.repeat(64)]]);
    const calls = [], errors = [];
    const Zotero = { initializationPromise: Promise.resolve(), Prefs: { get: key => prefs.get(key), set: (key, value) => prefs.set(key, value) },
        logError: error => errors.push(error), isWin: true };
    let written = false;
    const process = { stdin: { async write(value) { written = true; assert.deepEqual(JSON.parse(value), { token: 'a'.repeat(64), port: 23119 }); }, close() {} },
        stdout: { async readString() { assert.ok(written); if (this.done) return ''; this.done = true; return JSON.stringify(outcome); } },
        stderr: { async readString() { return ''; } }, async wait() { return { exitCode: outcome.ok ? 0 : 1 }; } };
    const context = vm.createContext({ Zotero, PathUtils: path.posix, TextEncoder, atob, Blob, Components: {}, IOUtils: {},
        ChromeUtils: { importESModule(url) { assert.match(url, /Subprocess/); return { Subprocess: { async call(options) { calls.push(options); return process; } } }; } },
        Services: { scriptloader: { loadSubScript(url, scope) {
            if (url.endsWith('installer.js')) {
                vm.runInContext(source('content/installer.js'), scope);
                scope.CodexBridgeInstaller.deploy = async () => ({ executable: '/profile/1.0.2/codex-zotero-mcp.exe', config: '/profile/bridge-config.json' });
            } else if (url.endsWith('bridge.js')) scope.CodexZoteroBridge = { async start() { calls.push('bridge-started'); }, async stop() {} };
        } } } });
    // bootstrap's subscript scope is an object in Zotero, a VM context in this harness.
    context.Services.scriptloader.loadSubScript = (url, scope) => {
        if (!vm.isContext(scope)) vm.createContext(scope);
        if (url.endsWith('installer.js')) {
            vm.runInContext(source('content/installer.js'), scope);
            scope.CodexBridgeInstaller.deploy = async () => ({ executable: '/profile/1.0.2/codex-zotero-mcp.exe', config: '/profile/bridge-config.json' });
        } else if (url.endsWith('bridge.js')) scope.CodexZoteroBridge = { async start() { calls.push('bridge-started'); }, async stop() {} };
    };
    vm.runInContext(source('bootstrap.js'), context);
    return { context, prefs, calls, errors, prefix, async start() { await context.startup({ id: manifest.applications.zotero.id, rootURI: 'jar:file:///fixture.xpi!/', version: manifest.version }); } };
}
await test('first-time and already-current users do not configure automatically', async () => {
    for (const version of [undefined, manifest.version]) { const h = harness(version); await h.start(); assert.deepEqual(h.calls, ['bridge-started']); }
});
await test('lifecycle honors all update preferences without touching AddonManager', async () => {
    for (const preference of [0, 1, 2]) {
        const h = harness(); h.prefs.set('background-updates', preference); await h.start();
        assert.equal(h.prefs.get('background-updates'), preference); assert.deepEqual(h.calls, ['bridge-started']);
    }
    assert.doesNotMatch(source('bootstrap.js'), /applyBackgroundUpdates\s*=/);
});
await test('existing users upgrade only after bridge startup and send secrets over stdin', async () => {
    const h = harness('1.0.1'); await h.start(); assert.equal(h.calls[0], 'bridge-started');
    assert.equal(h.calls[1].arguments[0], '--upgrade-existing'); assert.ok(!JSON.stringify(h.calls).includes('a'.repeat(64)));
    assert.equal(h.prefs.get(h.prefix + 'configuredVersion'), manifest.version);
    const status = JSON.parse(h.prefs.get(h.prefix + 'upgradeStatus')); assert.equal(status.state, 'updated'); assert.equal(status.automatic, true);
});
await test('removed or disabled configuration is not marked as successfully upgraded', async () => {
    const h = harness('1.0.1', { ok: true, version: manifest.version, skipped: true, reason: 'disabled' }); await h.start();
    assert.equal(h.prefs.get(h.prefix + 'configuredVersion'), '1.0.1'); assert.equal(JSON.parse(h.prefs.get(h.prefix + 'upgradeStatus')).state, 'skipped');
});
await test('companion failures leave the bridge running and the previous version retryable', async () => {
    const h = harness('1.0.1', { ok: false, error: 'Synthetic configuration conflict' }); await h.start();
    assert.equal(h.prefs.get(h.prefix + 'configuredVersion'), '1.0.1'); assert.equal(h.errors.length, 1);
    assert.equal(JSON.parse(h.prefs.get(h.prefix + 'upgradeStatus')).state, 'failed'); assert.equal(h.calls[0], 'bridge-started');
});
console.log(JSON.stringify({ passed, personal_config_access: false }));
