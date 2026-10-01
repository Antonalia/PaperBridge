// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PaperBridge contributors.
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { disjointRectUnion, ANNOTATION_GEOMETRY } from './tools/annotation_geometry.mjs';
import { rulesFromStatus, rulesInstructions, toolsWithRules } from './tools/annotation_rules.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const colors = ['yellow', 'red', 'green', 'blue', 'purple', 'magenta', 'orange', 'gray'];
const fallbackColors = { annotation: 'yellow', important: 'red', image: 'purple', chart: 'blue' };
const readHints = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = { type: 'string', minLength: 1 };
const attachment = { ...str, description: 'Personal-library PDF attachment ID returned by search or selected_items, e.g. u-ABCD2345.' };
const pageProperties = { attachment_id: attachment, start_page: { type: 'integer', minimum: 1, default: 1 }, end_page: { type: 'integer', minimum: 1, description: 'Read at most 20 physical pages per call; defaults to start_page + 9.' } };
export const tools = [
    { name: 'zotero_prepare_obsidian_import', description: 'Prepare an Obsidian Markdown import of native Zotero annotations, comments and cached images using the vault, top folder, collection hierarchy and per-kind link settings in Zotero. Does not write files. Select collection_id if the paper has multiple collections, or target_note for an existing vault-relative Markdown file. Omit annotation_ids to import all annotations. Older image annotations may need content_kinds overrides to distinguish charts. Returns a reviewable path and plan ID; requires plugin 0.1.10+. Exports each annotation as a Page callout with a continuous source paragraph and a separate comment paragraph. PDF line-wrap hyphens are resolved conservatively against the paper vocabulary; Zotero source annotations remain unchanged.', inputSchema: obj({ attachment_id: attachment, collection_id: str, target_note: { ...str, description: 'Optional vault-relative .md path; imported blocks update while manual content remains.' }, annotation_ids: { type: 'array', minItems: 1, maxItems: 500, items: str }, include_comments: { type: 'boolean' }, omit_comments_for: { type: 'array', maxItems: 500, items: str }, content_kinds: { type: 'array', maxItems: 500, items: obj({ annotation_id: str, kind: { type: 'string', enum: ['image', 'chart'] } }, ['annotation_id', 'kind']) } }, ['attachment_id']) },
    { name: 'zotero_apply_obsidian_import', description: 'Apply a prepared Obsidian import after the user authorizes the export. Writes only the configured vault, checks for changed notes/settings, backs up existing notes, preserves manual content and avoids duplicate annotation blocks. Reapplying the same plan is idempotent. Does not edit Zotero annotations.', inputSchema: obj({ plan_id: str }, ['plan_id']), annotations: { ...readHints, readOnlyHint: false } },
    { name: 'zotero_render_pdf_page', description: 'Render a canonical unrotated PDF page for visual inspection before selecting an image region. Returns PNG and an opaque render ID; crop coordinates are in this image pixel space.', inputSchema: obj({ attachment_id: attachment, page: { type: 'integer', minimum: 1 } }, ['attachment_id', 'page']) },
    { name: 'zotero_prepare_image_annotation', description: 'After visually inspecting render_pdf_page, prepare a native image annotation from a pixel rectangle [left,top,right,bottom] on that render. Returns cropped PNG and a plan ID for apply_annotations. Omit color unless the user explicitly chooses one. Select region_kind to use the configured image or chart color. Native images require plugin 0.1.4+; custom color defaults require 0.1.5+.', inputSchema: obj({ render_id: str, region_kind: { type: 'string', enum: ['image', 'figure', 'table', 'chart'], description: 'image for photos or general images; figure, table and chart use the configured chart color.' }, crop_pixels: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number', minimum: 0 } }, comment: { type: 'string', maxLength: 20000 }, color: { type: 'string', enum: colors }, tags: { type: 'array', maxItems: 50, items: { ...str, maxLength: 200 } } }, ['render_id', 'crop_pixels']) },
    { name: 'zotero_status', description: 'Check the local Zotero bridge and whether native annotation writes are enabled. Requires Zotero running with the small 文献桥 · PaperBridge plugin.', inputSchema: obj({}) },
    { name: 'zotero_get_obsidian_link', description: 'Get a verified Zotero annotation deep link using the master and per-kind Obsidian link settings. Call before adding each link to an Obsidian export; omit the link when enabled=false and url=null. Use annotation for text highlights/notes, image for photos, and chart for figures, charts and tables. Requires plugin 0.1.10+. Does not write Obsidian files.', inputSchema: obj({ attachment_id: attachment, annotation_id: { ...str, description: 'Annotation ID returned by list_annotations or apply_annotations (u-XXXXXXXX).' }, content_kind: { type: 'string', enum: ['annotation', 'image', 'chart'] } }, ['attachment_id', 'annotation_id', 'content_kind']) },
    { name: 'zotero_search', description: 'Search titles, creators and years in the local personal Zotero library. Returns PDF attachment IDs. Empty query browses the library.', inputSchema: obj({ query: { type: 'string', maxLength: 500 }, limit: { type: 'integer', minimum: 1, maximum: 50 }, offset: { type: 'integer', minimum: 0 } }) },
    { name: 'zotero_selected_items', description: 'Read the currently selected items and their PDF attachment IDs from the Zotero library window.', inputSchema: obj({}) },
    { name: 'zotero_read_pdf', description: 'Read exact text passages and opaque annotation locator IDs from a local PDF. Page numbers are physical and one-based. Returned locators are the only accepted annotation anchors. Scanned pages without text require OCR first.', inputSchema: obj(pageProperties, ['attachment_id']) },
    { name: 'zotero_find_pdf_text', description: 'Locate exact, case-sensitive source text in a PDF page range. Whitespace is normalized. Returns a separate locator per occurrence; choose the intended occurrence explicitly.', inputSchema: obj({ ...pageProperties, text: { ...str, maxLength: 10000 } }, ['attachment_id', 'text']) },
    { name: 'zotero_list_annotations', description: 'Read existing native PDF annotations before proposing additions.', inputSchema: obj({ attachment_id: attachment }, ['attachment_id']) },
    { name: 'zotero_prepare_annotations', description: 'Prepare a reviewable batch of native highlights, underlines, or sticky notes without writing to Zotero. Use only locator IDs returned by read_pdf/find_pdf_text. Each annotation can combine consecutive locators on one page. Highlight text comes from the source, not a paraphrase. Set emphasis=important for key highlights. Omit color unless the user explicitly chooses one, so plugin color preferences are applied. Returns a plan ID and previews with resolved colors.', inputSchema: obj({ attachment_id: attachment, annotations: { type: 'array', minItems: 1, maxItems: 50, items: obj({ type: { type: 'string', enum: ['highlight', 'underline', 'note'] }, locator_ids: { type: 'array', minItems: 1, maxItems: 100, items: str }, emphasis: { type: 'string', enum: ['normal', 'important'], description: 'Use important for user-requested key points; otherwise normal. Omit color to use Zotero plugin preferences.' }, color: { type: 'string', enum: colors }, comment: { type: 'string', maxLength: 20000 }, tags: { type: 'array', maxItems: 50, items: { ...str, maxLength: 200 } } }, ['type', 'locator_ids']) } }, ['attachment_id', 'annotations']) },
    { name: 'zotero_apply_annotations', description: 'Write a prepared batch as editable Zotero-native annotations. Call after the user has authorized the proposed annotation batch. Enable annotation writes in the Zotero plugin settings. Reapplying the same plan is idempotent. Only annotations are added; PDFs and existing annotations are not altered.', inputSchema: obj({ plan_id: str }, ['plan_id']), annotations: { ...readHints, readOnlyHint: false } },
].map(tool => ({ ...tool, annotations: tool.annotations || readHints }));

function validate(value, schema, name = 'arguments') {
    if (schema.type === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
        for (const key of schema.required || []) if (!(key in value)) throw new Error(`${name}.${key} is required`);
        for (const [key, child] of Object.entries(value)) {
            if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) throw new Error(`Unknown ${name}.${key}`);
            validate(child, schema.properties[key], `${name}.${key}`);
        }
    } else if (schema.type === 'array') {
        if (!Array.isArray(value) || value.length < (schema.minItems || 0) || value.length > (schema.maxItems || Infinity)) throw new Error(`Invalid ${name} array length`);
        value.forEach((child, index) => validate(child, schema.items, `${name}[${index}]`));
    } else if (schema.type === 'string') {
        if (typeof value !== 'string' || value.length < (schema.minLength || 0) || value.length > (schema.maxLength || Infinity)) throw new Error(`Invalid ${name} string`);
    } else if (schema.type === 'integer') {
        if (!Number.isInteger(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) throw new Error(`Invalid ${name} integer`);
    } else if (schema.type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) throw new Error(`Invalid ${name} number`);
    } else if (schema.type === 'boolean' && typeof value !== 'boolean') {
        throw new Error(`Invalid ${name} boolean`);
    }
    if (schema.enum && !schema.enum.includes(value)) throw new Error(`Invalid ${name} value`);
}

export class ZoteroMcp {
    constructor(config = {}) {
        this.config = config;
        this.locators = new Map();
        this.plans = new Map();
        this.renders = new Map();
        this.obsidianPlans = new Map();
        this.expiresAfter = 60 * 60 * 1000;
    }
    async settings() {
        if (this.config.token) return this.config;
        let file = {};
        try { file = JSON.parse(await readFile(path.join(root, 'bridge-config.json'), 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw new Error('Invalid bridge-config.json'); }
        return { token: process.env.ZOTERO_BRIDGE_TOKEN || file.token, port: Number(process.env.ZOTERO_BRIDGE_PORT || file.port || 23119), python: process.env.ZOTERO_MCP_PYTHON || file.python || 'python' };
    }
    async bridge(action, data = {}, timeout = 120000) {
        const config = await this.settings();
        if (!config.token) throw new Error('Local bridge token is not configured. Install the XPI, copy its token, then run setup-codex.ps1.');
        if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('Invalid Zotero port');
        let response;
        try {
            response = await fetch(`http://127.0.0.1:${config.port}/codex-zotero/v1`, {
                method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}`, 'Zotero-Allowed-Request': '1' },
                body: JSON.stringify({ action, ...data }), signal: AbortSignal.timeout(timeout)
            });
        } catch (_) { throw new Error('Cannot reach Zotero. Keep Zotero open, install/enable 文献桥 · PaperBridge, and check the configured port.'); }
        if (response.status === 401) throw new Error('Local bridge token is invalid. Copy the token from Zotero settings and run setup-codex.ps1 again.');
        let json;
        try { json = await response.json(); } catch (_) { throw new Error('The local Zotero bridge endpoint is unavailable. Install/enable the XPI.'); }
        if (!response.ok || !json.ok) throw new Error(json.error || `Zotero bridge returned HTTP ${response.status}`);
        return json.result;
    }
    async obsidianSnapshot(attachmentID) {
        const snapshot = await this.bridge('obsidian_snapshot', { attachment_id: attachmentID });
        snapshot.source_pdf_path = (await this.bridge('attachment', { attachment_id: attachmentID })).file_path;
        return snapshot;
    }
    async annotationRules(timeout) { return rulesFromStatus(await this.bridge('status', {}, timeout)); }
    async metadataRules() { try { return await this.annotationRules(2000); } catch (_) { return rulesFromStatus(); } }
    async colorDefaults() {
        const status = await this.bridge('status');
        return Object.fromEntries(Object.entries(fallbackColors).map(([role, fallback]) => [role, colors.includes(status.default_colors?.[role]) ? status.default_colors[role] : fallback]));
    }
    cleanup() {
        const cutoff = Date.now() - this.expiresAfter;
        for (const map of [this.locators, this.plans, this.renders, this.obsidianPlans]) for (const [key, value] of map) if (value.created < cutoff) map.delete(key);
        while (this.locators.size > 12000) this.locators.delete(this.locators.keys().next().value);
        while (this.plans.size > 100) this.plans.delete(this.plans.keys().next().value);
        while (this.renders.size > 50) this.renders.delete(this.renders.keys().next().value);
        while (this.obsidianPlans.size > 50) this.obsidianPlans.delete(this.obsidianPlans.keys().next().value);
    }
    async region(request, worker = 'pdf_region.py') {
        const config = await this.settings();
        return new Promise((resolve, reject) => {
            const child = spawn(config.python || 'python', [path.join(root, 'tools', worker)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONPATH: [path.join(root, 'python-libs'), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter), PYTHONUTF8: '1' } });
            let output = '', stderr = '';
            const timer = setTimeout(() => { child.kill(); reject(new Error('PDF rendering timed out')); }, 120000);
            child.on('error', error => { clearTimeout(timer); reject(error); });
            child.stdin.on('error', () => {});
            child.stdout.on('data', data => { output += data; if (output.length > 16 * 1024 * 1024) { child.kill(); reject(new Error('Rendered output too large')); } });
            child.stderr.on('data', data => { stderr = (stderr + data).slice(-2000); });
            child.on('close', code => {
                clearTimeout(timer);
                try { const result = JSON.parse(output); if (code !== 0 || result.error) throw new Error(result.error || stderr || 'Rendering failed'); resolve(result); }
                catch (error) { reject(error); }
            });
            child.stdin.end(JSON.stringify(request));
        });
    }
    async extract(args, query) {
        const info = await this.bridge('attachment', { attachment_id: args.attachment_id });
        const config = await this.settings();
        const request = { path: info.file_path, start_page: args.start_page || 1, end_page: args.end_page || (args.start_page || 1) + 9, ...(query === undefined ? {} : { query }) };
        const workerPath = path.join(root, 'tools', 'extract_pdf.py');
        const pythonPath = [path.join(root, 'python-libs'), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
        const output = await new Promise((resolve, reject) => {
            const child = spawn(config.python || 'python', [workerPath], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONPATH: pythonPath, PYTHONUTF8: '1' } });
            let stdout = '', stderr = '', settled = false;
            const fail = error => { if (!settled) { settled = true; reject(error); } };
            const timer = setTimeout(() => { child.kill(); fail(new Error('PDF extraction exceeded 120 seconds')); }, 120000);
            child.on('error', () => { clearTimeout(timer); fail(new Error('Python cannot start. Configure ZOTERO_MCP_PYTHON or run setup-codex.ps1.')); });
            child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 16 * 1024 * 1024) { child.kill(); fail(new Error('PDF output is too large; request fewer pages')); } });
            child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
            child.stdin.on('error', () => {});
            child.on('close', code => {
                clearTimeout(timer);
                if (settled) return;
                try {
                    const value = JSON.parse(stdout);
                    if (code !== 0 || value.error) throw new Error(value.error || 'PDF extraction failed');
                    settled = true; resolve(value);
                } catch (error) { fail(new Error(stderr.includes('ModuleNotFoundError') ? 'PyMuPDF is missing. Install requirements.txt with the configured Python.' : error.message)); }
            });
            child.stdin.end(JSON.stringify(request));
        });
        this.cleanup();
        return {
            attachment_id: args.attachment_id, page_count: output.page_count, annotation_geometry: output.annotation_geometry, ...await this.annotationRules(),
            pages: output.pages.map(page => ({
                page: page.page, page_label: page.page_label, needs_ocr: page.needs_ocr,
                passages: page.passages.map(passage => {
                    const locator = randomBytes(16).toString('hex');
                    this.locators.set(locator, { ...passage, attachment_id: args.attachment_id, file_sha256: output.file_sha256, page_count: output.page_count, page_index: page.page_index, page_label: page.page_label, view_box: page.view_box, created: Date.now() });
                    return { locator_id: locator, text: passage.text };
                })
            }))
        };
    }
    async call(name, args) {
        const tool = tools.find(tool => tool.name === name);
        if (!tool) throw new Error(`Unknown tool: ${name}`);
        validate(args, tool.inputSchema);
        this.cleanup();
        if (name === 'zotero_prepare_obsidian_import') {
            const snapshot = await this.obsidianSnapshot(args.attachment_id);
            const { _obsidian_plan, ...preview } = await this.region({ operation: 'prepare', snapshot, args }, 'obsidian_import.py');
            if (!_obsidian_plan) return preview;
            const planID = randomBytes(16).toString('hex');
            this.obsidianPlans.set(planID, { plan: _obsidian_plan, created: Date.now() });
            return { ...preview, plan_id: planID };
        }
        if (name === 'zotero_apply_obsidian_import') {
            const stored = this.obsidianPlans.get(args.plan_id);
            if (!stored) throw new Error('Unknown/expired Obsidian plan; prepare again.');
            const snapshot = await this.obsidianSnapshot(stored.plan.attachment_id);
            return this.region({ operation: 'apply', snapshot, plan: stored.plan }, 'obsidian_import.py');
        }
        if (name === 'zotero_render_pdf_page') {
            const info = await this.bridge('attachment', { attachment_id: args.attachment_id });
            const result = await this.region({ path: info.file_path, page: args.page });
            const { png_base64, ...metadata } = result;
            const renderID = randomBytes(16).toString('hex');
            this.renders.set(renderID, { ...metadata, attachment_id: args.attachment_id, path: info.file_path, page: args.page, created: Date.now() });
            return { render_id: renderID, page: args.page, width: result.width, height: result.height, coordinate_space: 'unrotated render pixels; origin top-left', _mcp_image: png_base64 };
        }
        if (name === 'zotero_prepare_image_annotation') {
            const render = this.renders.get(args.render_id);
            if (!render) throw new Error('Unknown/expired render; render the page again');
            const defaults = await this.colorDefaults();
            const kind = args.region_kind || 'image';
            const role = kind === 'image' ? 'image' : 'chart';
            const result = await this.region({ path: render.path, page: render.page, file_sha256: render.file_sha256, crop_pixels: args.crop_pixels });
            const planID = randomBytes(16).toString('hex');
            const annotation = { type: 'image', page_index: result.page_index, page_label: result.page_label, view_box: result.view_box, offset: 0, rects: [result.rect], image_base64: result.png_base64, color: args.color || defaults[role], color_role: role, comment: args.comment || '', tags: args.tags || [] };
            this.plans.set(planID, { request_id: planID, attachment_id: render.attachment_id, file_sha256: result.file_sha256, page_count: result.page_count, annotations: [annotation], created: Date.now() });
            return { plan_id: planID, attachment_id: render.attachment_id, page: render.page, type: 'image', region_kind: kind, color: annotation.color, color_role: role, comment: annotation.comment, width: result.width, height: result.height, expires_in_minutes: 60, _mcp_image: result.png_base64 };
        }
        if (name === 'zotero_status') return this.bridge('status');
        if (name === 'zotero_get_obsidian_link') return this.bridge('obsidian_link', args);
        if (name === 'zotero_search') return this.bridge('search', args);
        if (name === 'zotero_selected_items') return this.bridge('selected');
        if (name === 'zotero_list_annotations') return this.bridge('annotations', args);
        if (name === 'zotero_read_pdf') return this.extract(args);
        if (name === 'zotero_find_pdf_text') return this.extract(args, args.text);
        if (name === 'zotero_prepare_annotations') {
            const rules = await this.annotationRules();
            const defaults = await this.colorDefaults();
            let identity;
            const annotations = args.annotations.map(value => {
                if (new Set(value.locator_ids).size !== value.locator_ids.length) throw new Error('Duplicate locator in annotation');
                const anchors = value.locator_ids.map(key => {
                    const anchor = this.locators.get(key);
                    if (!anchor || anchor.attachment_id !== args.attachment_id) throw new Error('Unknown/expired locator or wrong attachment; read the PDF again');
                    identity ||= anchor;
                    if (anchor.file_sha256 !== identity.file_sha256) throw new Error('Locators refer to different versions of the PDF');
                    return anchor;
                });
                if (anchors.some(anchor => anchor.page_index !== anchors[0].page_index)) throw new Error('Split annotations spanning multiple pages into separate annotations');
                anchors.sort((a, b) => a.offset - b.offset);
                const comment = value.comment || '';
                if (value.type === 'note' && !comment.trim()) throw new Error('Sticky notes require a comment');
                const first = anchors[0];
                const rects = disjointRectUnion(anchors.flatMap(anchor => anchor.rects));
                if (rects.length > 400) throw new Error('Too many rectangles; split the annotation');
                const noteRect = (() => {
                    const [left, bottom, right, top] = first.view_box;
                    const size = Math.min(18, right - left, top - bottom);
                    const x = Math.max(left, right - size - 12);
                    const y = Math.min(top - size, Math.max(bottom, first.rects[0][3] - size));
                    return [x, y, x + size, y + size];
                })();
                const role = value.emphasis === 'important' ? 'important' : 'annotation';
                return { type: value.type, page_index: first.page_index, page_label: first.page_label, view_box: first.view_box, offset: first.offset, rects: value.type === 'note' ? [noteRect] : rects, text: anchors.map(anchor => anchor.text).join('\n'), color: value.color || defaults[role], color_role: role, comment, tags: value.tags || [] };
            });
            const planID = randomBytes(16).toString('hex');
            const plan = { request_id: planID, attachment_id: args.attachment_id, file_sha256: identity.file_sha256, page_count: identity.page_count, annotations, annotation_rules_revision: rules.annotation_rules_revision, created: Date.now() };
            this.plans.set(planID, plan);
            return { plan_id: planID, expires_in_minutes: 60, attachment_id: args.attachment_id, count: annotations.length, annotation_geometry: ANNOTATION_GEOMETRY, ...rules, annotations: annotations.map(value => ({ type: value.type, page: value.page_index + 1, page_label: value.page_label, text: value.text, comment: value.comment, color: value.color, color_role: value.color_role, tags: value.tags })) };
        }
        if (name === 'zotero_apply_annotations') {
            const plan = this.plans.get(args.plan_id);
            if (!plan) throw new Error('Unknown/expired plan. Read and prepare annotations again.');
            if (plan.annotation_rules_revision && plan.annotation_rules_revision !== (await this.annotationRules()).annotation_rules_revision) throw new Error('Annotation rules changed; prepare the annotation plan again.');
            const { created, annotation_rules_revision, ...payload } = plan;
            return this.bridge('apply_annotations', payload);
        }
    }
}

export async function serve() {
    const app = new ZoteroMcp();
    const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
    let inflight = 0;
    let ended = false;
    const send = message => process.stdout.write(JSON.stringify(message) + '\n');
    lines.on('line', line => {
        if (!line.trim()) return;
        if (line.length > 1024 * 1024) { send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }); return; }
        let request;
        try { request = JSON.parse(line); } catch (_) { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
        if (!request || Array.isArray(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string') { send({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32600, message: 'Invalid Request' } }); return; }
        if (request.id === undefined) return;
        inflight++;
        (async () => {
            try {
                let result;
                if (request.method === 'initialize') result = { protocolVersion: ['2024-11-05', '2025-03-26', '2025-06-18'].includes(request.params?.protocolVersion) ? request.params.protocolVersion : '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'codex-zotero-local', version: '1.0.1' }, instructions: 'Use only returned attachment IDs and locator IDs. Read source passages before annotating. Prepare annotations for review, then apply when authorized by the user. Never guess PDF coordinates. Keep Zotero open. For Obsidian imports use zotero_prepare_obsidian_import and zotero_apply_obsidian_import to honor vault, collection and link settings and preserve manual content. Apply after user authorization. For manual exports use zotero_get_obsidian_link; never bypass disabled link settings.' + '\n' + rulesInstructions(await app.metadataRules()) };
                else if (request.method === 'ping') result = {};
                else if (request.method === 'tools/list') result = { tools: toolsWithRules(tools, await app.metadataRules()) };
                else if (request.method === 'tools/call') {
                    try {
                        const output = await app.call(request.params?.name, request.params?.arguments || {});
                        const { _mcp_image, ...metadata } = output;
                        result = { content: [{ type: 'text', text: JSON.stringify(metadata) }] };
                        if (_mcp_image) result.content.push({ type: 'image', data: _mcp_image, mimeType: 'image/png' });
                    }
                    catch (error) { result = { isError: true, content: [{ type: 'text', text: error.message }] }; }
                } else { send({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } }); return; }
                send({ jsonrpc: '2.0', id: request.id, result });
            } catch (error) { send({ jsonrpc: '2.0', id: request.id, error: { code: -32603, message: error.message } }); }
            finally { inflight--; if (ended && inflight === 0) process.exitCode = 0; }
        })();
    });
    lines.on('close', () => { ended = true; });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await serve();
