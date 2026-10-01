// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PaperBridge contributors.
/* global Zotero, Services, IOUtils, Components, PaperBridgeMetadata */
var CodexZoteroBridge = {
    prefix: "extensions.zotero.codexPdfBridge.",
    path: "/codex-zotero/v1",
    active: false,
    pending: Promise.resolve(),
    defaultAnnotationRules: "默认按完整句子选取文字高亮和下划线，从句首开始，到该句结束标点为止；可以连续选择多个完整句子，不包含上一句残段或下一句开头。用户明确要求短语、术语、公式或其他片段时，按其指定边界选择。\n一个句子跨多行时保留为同一条标注；禁止按固定行数截取。先阅读原文并确定完整选段，再通过 find_pdf_text 精确定位；read_pdf 返回的一行 passage 不等于一句。\n首行和末行只覆盖实际选中文字，不能把整行框当成句子边界。匹配使用 PDF 实际提取原文，保留断词、数学字符和空白规则；解释或译文写入批注。\n应用前检查 prepare 预览的开头、结尾及相邻原文，确认没有选入下一句片段。检索失败时回查页面，不猜坐标。修复已有标注时使用原位更新能力，避免新增重复标注。",
    annotationRules() {
        const value = this.get("annotationRules");
        const text = typeof value === "string" ? value : this.defaultAnnotationRules;
        if (text.length > 10000) throw new Error("Annotation rules exceed 10000 characters");
        return { annotation_rules: text, annotation_rules_revision: this.digestText(text) };
    },
    colors: { yellow: "#ffd400", red: "#ff6666", green: "#5fb236", blue: "#2ea8e5", purple: "#a28ae5", magenta: "#e56eee", orange: "#f19837", gray: "#aaaaaa" },
    colorPreferences: { annotation: ["defaultColor", "yellow"], important: ["importantColor", "red"], image: ["imageColor", "purple"], chart: ["chartColor", "blue"] },
    get(name) { return Zotero.Prefs.get(this.prefix + name, true); },
    set(name, value) { Zotero.Prefs.set(this.prefix + name, value, true); },
    obsidianImportSettings() {
        return { vault_path: this.get("obsidianVaultPath") || "", top_folder: this.get("obsidianTopFolder") || "", folder_layout: this.get("obsidianFolderLayout") || "collections", links: this.obsidianLinks() };
    },
    async obsidianSnapshot(attachmentID) {
        const { item: attachment } = await this.attachment(attachmentID);
        const item = attachment.parentID ? await Zotero.Items.getAsync(attachment.parentID) : attachment;
        await item.loadDataType("itemData");
        await item.loadDataType("creators");
        await item.loadDataType("collections");
        const collections = [];
        for (const id of item.getCollections()) {
            let collection = await Zotero.Collections.getAsync(id);
            const leaf = collection, names = [], visited = new Set();
            while (collection && !collection.deleted) {
                if (visited.has(collection.id)) throw new Error("Collection hierarchy contains a cycle");
                visited.add(collection.id);
                names.unshift(collection.name);
                collection = collection.parentID ? await Zotero.Collections.getAsync(collection.parentID) : null;
            }
            if (leaf && !leaf.deleted) collections.push({ collection_id: "u-" + leaf.key, path: names });
        }
        collections.sort((a, b) => a.path.join("/").localeCompare(b.path.join("/")) || a.collection_id.localeCompare(b.collection_id));
        const pane = Zotero.getActiveZoteroPane();
        const selected = pane && pane.getSelectedCollection ? pane.getSelectedCollection() : null;
        await attachment.loadDataType("childItems");
        const annotations = [];
        for (const annotation of attachment.getAnnotations()) {
            await annotation.loadDataType("annotation");
            await annotation.loadDataType("annotationDeferred");
            await annotation.loadDataType("relations");
            const image = annotation.annotationType === "image";
            const relations = annotation.getRelationsByPredicate("dc:relation");
            const kind = image ? PaperBridgeMetadata.kind(annotation, relations) : "annotation";
            const cache = image ? Zotero.Annotations.getCacheImagePath(annotation) : null;
            annotations.push({ annotation_id: this.ref(annotation), type: annotation.annotationType, content_kind: kind, text: annotation.annotationText || "", comment: annotation.annotationComment || "", page_label: annotation.annotationPageLabel || "", position: JSON.parse(annotation.annotationPosition), sort_index: annotation.annotationSortIndex || "", color: annotation.annotationColor, image_path: cache && await IOUtils.exists(cache) ? cache : null });
        }
        annotations.sort((a, b) => a.sort_index.localeCompare(b.sort_index) || a.annotation_id.localeCompare(b.annotation_id));
        return { attachment_id: this.ref(attachment), item_id: this.ref(item), title: item.getField("title") || attachment.attachmentFilename || attachment.key, year: item.getField("date"), collections, selected_collection_id: selected && collections.some(value => value.collection_id === "u-" + selected.key) ? "u-" + selected.key : null, settings: this.obsidianImportSettings(), annotations };
    },
    obsidianLinks() {
        const enabled = !!this.get("obsidianLinksEnabled");
        const annotations = !!this.get("obsidianAnnotationLinks");
        const images = !!this.get("obsidianImageLinks");
        const charts = !!this.get("obsidianChartLinks");
        return { enabled, annotations, images, charts, effective: { annotation: enabled && annotations, image: enabled && images, chart: enabled && charts } };
    },
    colorDefaults() {
        return Object.fromEntries(Object.entries(this.colorPreferences).map(([role, [name, fallback]]) => {
            const value = this.get(name);
            return [role, Object.prototype.hasOwnProperty.call(this.colors, value) ? value : fallback];
        }));
    },
    header(request, name) {
        const headers = request.headers || {};
        if (typeof headers.get === "function") return headers.get(name);
        for (const key of Object.keys(headers)) if (key.toLowerCase() === name) return headers[key];
        return null;
    },
    async start(root) {
        for (const [key, value] of Object.entries({ language: "zh", enabled: true, writeEnabled: false, annotationRules: this.defaultAnnotationRules, receipts: "{}", obsidianLinksEnabled: true, obsidianAnnotationLinks: true, obsidianImageLinks: true, obsidianChartLinks: true, obsidianVaultPath: "", obsidianTopFolder: "文献笔记", obsidianFolderLayout: "collections" })) {
            if (this.get(key) === undefined) this.set(key, value);
        }
        // Discover a single open Obsidian vault locally; no personal path in the release.
        if (!this.get("obsidianVaultPath") && Zotero.isWin) {
            try {
                const appData = Services.dirsvc.get("AppData", Components.interfaces.nsIFile).path;
                const state = await IOUtils.readJSON(PathUtils.join(appData, "obsidian", "obsidian.json"));
                const vaults = Object.values(state.vaults || {});
                const open = vaults.filter(value => value.open);
                const candidates = open.length === 1 ? open : vaults.length === 1 ? vaults : [];
                if (candidates.length === 1 && typeof candidates[0].path === "string"
                    && await IOUtils.exists(PathUtils.join(candidates[0].path, ".obsidian"))) this.set("obsidianVaultPath", candidates[0].path);
            } catch (_) { /* Manual vault entry remains available. */ }
        }
        for (const [name, fallback] of Object.values(this.colorPreferences)) {
            if (!Object.prototype.hasOwnProperty.call(this.colors, this.get(name))) this.set(name, fallback);
        }
        if (!this.get("token")) {
            const generator = Components.classes["@mozilla.org/security/random-generator;1"].getService(Components.interfaces.nsIRandomGenerator);
            this.set("token", Array.from(generator.generateRandomBytes(32), byte => byte.toString(16).padStart(2, "0")).join(""));
        }
        this.metadataError = null;
        try {
            await PaperBridgeMetadata.initialize(this);
            this.relationMigration = await PaperBridgeMetadata.migrate();
        } catch (error) {
            this.metadataError = error.message || String(error);
            Zotero.logError(error);
        }
        this.active = true;
        const owner = this;
        this.Endpoint = function () {};
        this.Endpoint.prototype = {
            supportedMethods: ["POST"], supportedDataTypes: ["application/json"],
            async init(request) { return owner.handle(request); }
        };
        Zotero.Server.Endpoints[this.path] = this.Endpoint;
        this.preferenceID = await Zotero.PreferencePanes.register({
            pluginID: "codex-pdf-bridge@local.personal", id: "codex-pdf-bridge-prefs",
            label: Zotero.PaperBridgeI18n ? Zotero.PaperBridgeI18n.t("文献桥") : "文献桥", image: root + "icons/icon-24.png", src: root + "content/preferences.xhtml", scripts: [root + "content/preferences.js"]
        });
        Zotero.debug("文献桥 · PaperBridge: local endpoint registered");
    },
    async stop() {
        this.active = false;
        if (Zotero.Server.Endpoints[this.path] === this.Endpoint) delete Zotero.Server.Endpoints[this.path];
        await this.pending.catch(() => {});
        if (this.preferenceID && Zotero.PreferencePanes.unregister) Zotero.PreferencePanes.unregister(this.preferenceID);
    },
    assertEnabled(write = false) {
        if (!this.active || !this.get("enabled")) throw new Error("Bridge is disabled. Enable it in Zotero Settings > 文献桥 · PaperBridge.");
        if (write && !this.get("writeEnabled")) throw new Error("Write tools are disabled. Enable annotation and paper tag writes in Zotero Settings > 文献桥 · PaperBridge.");
        if (write && this.metadataError) throw new Error("PaperBridge metadata repair needs attention: " + this.metadataError);
    },
    async handle(request) {
        const respond = (status, value) => [status, "application/json", JSON.stringify(value)];
        try {
            this.assertEnabled();
            if (this.header(request, "origin")) return respond(403, { error: "Browser-origin requests are not allowed" });
            if (this.header(request, "authorization") !== "Bearer " + this.get("token")) return respond(403, { error: "Invalid local bridge token" });
            const data = typeof request.data === "string" ? JSON.parse(request.data) : request.data;
            if (!data || typeof data !== "object" || JSON.stringify(data).length > 12000000) throw new Error("Invalid or oversized request");
            let result;
            if (["apply_annotations", "update_annotations", "apply_item_tags"].includes(data.action)) {
                const job = this.pending.then(() => data.action === "apply_item_tags" ? this.applyItemTags(data) : data.action === "update_annotations" ? this.updateAnnotations(data) : this.apply(data));
                this.pending = job.catch(() => {});
                result = await job;
            } else result = await this.dispatch(data);
            this.assertEnabled();
            return respond(200, { ok: true, result });
        } catch (error) {
            Zotero.logError(error);
            return respond(400, { ok: false, error: error.message || String(error) });
        }
    },
    ref(item) { return "u-" + item.key; },
    async paperItem(ref) {
        if (typeof ref !== "string" || !/^u-[A-Z0-9]{8}$/.test(ref)) throw new Error("Use a returned personal-library item or PDF ID (u-XXXXXXXX)");
        let item = await Zotero.Items.getByLibraryAndKeyAsync(Zotero.Libraries.userLibraryID, ref.slice(2));
        if (!item || item.deleted || item.libraryID !== Zotero.Libraries.userLibraryID) throw new Error("Item does not exist in the personal library");
        if (item.isPDFAttachment() && item.parentID) item = await Zotero.Items.getAsync(item.parentID);
        if (!item || item.deleted || item.libraryID !== Zotero.Libraries.userLibraryID || !item.isRegularItem()) throw new Error("Paper tags require a regular parent item outside trash");
        await item.loadDataType("tags");
        await item.loadDataType("itemData");
        return item;
    },
    tagState(item) {
        return item.getTags().map(value => ({ tag: value.tag, type: value.type || 0 })).sort((a, b) => a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : a.type - b.type);
    },
    normalizeItemTags(tags) {
        if (!Array.isArray(tags) || !tags.length || tags.length > 50 || tags.some(tag => typeof tag !== "string" || !tag.trim() || tag.length > 200 || /[\u0000-\u001f\u007f]/.test(tag))) throw new Error("Use 1–50 nonempty tags, each at most 200 characters without control characters");
        return [...new Set(tags.map(tag => tag.trim().normalize("NFC")))];
    },
    async itemTags(ref) {
        const item = await this.paperItem(ref);
        return { item_id: this.ref(item), title: item.getField("title"), tags: this.tagState(item) };
    },
    async applyItemTags(data) {
        this.assertEnabled(true);
        const item = await this.paperItem(data.item_id);
        if (!Zotero.Libraries.get(item.libraryID).editable) throw new Error("Library is read-only");
        const requested = this.normalizeItemTags(data.tags);
        if (!Array.isArray(data.expected_tags)) throw new Error("Missing prepared tag snapshot");
        let added = [];
        try {
            await Zotero.DB.executeTransaction(async () => {
                this.assertEnabled(true);
                const current = this.tagState(item);
                const names = new Set(current.map(value => value.tag.normalize("NFC")));
                added = requested.filter(tag => !names.has(tag));
                if (!added.length) return; // Safe, idempotent retry; never change manual tag types.
                if (JSON.stringify(current) !== JSON.stringify(data.expected_tags)) throw new Error("Paper tags changed; prepare a new tag plan");
                for (const tag of added) item.addTag(tag, 1);
                await item.save();
            });
        } catch (error) {
            await item.reload(["tags"], true);
            throw error;
        }
        return { item_id: this.ref(item), added, already_present: requested.filter(tag => !added.includes(tag)), tags: this.tagState(item) };
    },
    async attachment(ref) {
        if (typeof ref !== "string" || !/^u-[A-Z0-9]{8}$/.test(ref)) throw new Error("Use a personal-library attachment ID returned by this bridge (u-XXXXXXXX).");
        const item = await Zotero.Items.getByLibraryAndKeyAsync(Zotero.Libraries.userLibraryID, ref.slice(2));
        if (!item || item.deleted || !item.isPDFAttachment()) throw new Error("PDF attachment does not exist in the personal library");
        if (item.parentID && (await Zotero.Items.getAsync(item.parentID)).deleted) throw new Error("PDF parent is in trash");
        const filePath = await item.getFilePathAsync();
        if (!filePath || !await IOUtils.exists(filePath)) throw new Error("PDF is not available locally. Download it in Zotero first.");
        const stat = await IOUtils.stat(filePath);
        if (stat.size > 200 * 1024 * 1024) throw new Error("PDF exceeds the 200 MB limit");
        return { item, filePath, stat };
    },
    async describe(item) {
        if (item.isRegularItem()) await item.loadDataType("childItems");
        await item.loadDataType("itemData");
        const attachments = item.isPDFAttachment() ? [item] : item.isRegularItem() ? await Zotero.Items.getAsync(item.getAttachments()) : [];
        for (const attachment of attachments) await attachment.loadDataType("itemData");
        return {
            item_id: this.ref(item), title: item.getField("title"), item_type: Zotero.ItemTypes.getName(item.itemTypeID),
            year: item.getField("date"), zotero_uri: "zotero://select/library/items/" + item.key,
            pdfs: attachments.filter(att => !att.deleted && att.isPDFAttachment()).map(att => ({ attachment_id: this.ref(att), filename: att.attachmentFilename, title: att.getField("title") }))
        };
    },
    integer(value, minimum, maximum, name) {
        if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error("Invalid " + name);
        return value;
    },
    async dispatch(data) {
        if (data.action === "item_tags") return this.itemTags(data.item_id);
        if (data.action === "obsidian_snapshot") return this.obsidianSnapshot(data.attachment_id);
        if (data.action === "status") return { version: "1.0.3", ...this.annotationRules(), annotation_updates: true, item_tags: true, item_tag_mode: "add-only-automatic", annotation_geometry: "compact-font-disjoint-v1", zotero_version: Zotero.version, library: "personal", write_enabled: !!this.get("writeEnabled") && !this.metadataError, metadata_error: this.metadataError, relation_migration: this.relationMigration || null, account_required: false, default_colors: this.colorDefaults(), color_palette: this.colors, obsidian_links: this.obsidianLinks() };
        if (data.action === "obsidian_link") {
            const { item } = await this.attachment(data.attachment_id);
            if (typeof data.annotation_id !== "string" || !/^u-[A-Z0-9]{8}$/.test(data.annotation_id)) throw new Error("Use an annotation ID returned by this bridge");
            const annotation = await Zotero.Items.getByLibraryAndKeyAsync(Zotero.Libraries.userLibraryID, data.annotation_id.slice(2));
            if (!annotation || annotation.deleted || !annotation.isAnnotation() || annotation.parentID !== item.id) throw new Error("Annotation does not belong to this PDF attachment");
            await annotation.loadDataType("annotation");
            const kind = data.content_kind;
            if (!["annotation", "image", "chart"].includes(kind)) throw new Error("Invalid Obsidian content kind");
            if ((annotation.annotationType === "image") !== (kind !== "annotation")) throw new Error("Content kind does not match annotation type");
            const enabled = this.obsidianLinks().effective[kind];
            return { attachment_id: this.ref(item), annotation_id: this.ref(annotation), content_kind: kind, enabled, url: enabled ? "zotero://open-pdf/library/items/" + item.key + "?annotation=" + annotation.key : null };
        }
        if (data.action === "search") {
            const query = typeof data.query === "string" ? data.query.trim() : "";
            if (query.length > 500) throw new Error("Query is too long");
            const limit = this.integer(data.limit === undefined ? 20 : data.limit, 1, 50, "limit");
            const offset = this.integer(data.offset === undefined ? 0 : data.offset, 0, 100000, "offset");
            const search = new Zotero.Search();
            search.libraryID = Zotero.Libraries.userLibraryID;
            search.addCondition("deleted", "false");
            search.addCondition("itemType", "isNot", "annotation");
            search.addCondition("itemType", "isNot", "note");
            search.addCondition("itemType", "isNot", "attachment");
            if (query) search.addCondition("quicksearch-titleCreatorYear", "contains", query);
            const ids = await search.search();
            const items = await Zotero.Items.getAsync(ids.slice(offset, offset + limit));
            return { total: ids.length, next_offset: offset + limit < ids.length ? offset + limit : null, items: await Promise.all(items.map(item => this.describe(item))) };
        }
        if (data.action === "selected") {
            const pane = Zotero.getActiveZoteroPane();
            const items = pane ? pane.getSelectedItems() : [];
            return { items: await Promise.all(items.filter(item => item.libraryID === Zotero.Libraries.userLibraryID && !item.deleted && (item.isRegularItem() || item.isPDFAttachment())).map(item => this.describe(item))) };
        }
        if (data.action === "attachment") {
            const { item, filePath, stat } = await this.attachment(data.attachment_id);
            return { attachment_id: this.ref(item), file_path: filePath, size: stat.size, modified: stat.lastModified, title: item.getField("title") };
        }
        if (data.action === "annotations") {
            const { item } = await this.attachment(data.attachment_id);
            await item.loadDataType("childItems");
            const result = [];
            for (const annotation of item.getAnnotations()) {
                await annotation.loadDataType("annotation");
                await annotation.loadDataType("annotationDeferred");
                result.push({ annotation_id: this.ref(annotation), type: annotation.annotationType, text: annotation.annotationText || "", comment: annotation.annotationComment || "", color: annotation.annotationColor, page_label: annotation.annotationPageLabel, author: annotation.annotationAuthorName, position: JSON.parse(annotation.annotationPosition) });
            }
            return { annotations: result };
        }
        throw new Error("Unsupported action");
    },
    async digest(filePath) {
        const bytes = await IOUtils.read(filePath);
        return this.digestBytes(bytes);
    },
    digestBytes(bytes) {
        const hash = Components.classes["@mozilla.org/security/hash;1"].createInstance(Components.interfaces.nsICryptoHash);
        hash.init(hash.SHA256);
        hash.update(bytes, bytes.length);
        return Array.from(hash.finish(false), char => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    },
    digestText(text) {
        return this.digestBytes(new TextEncoder().encode(text));
    },
    validateAnnotation(value, pageCount) {
        if (!value || !["highlight", "underline", "note", "image"].includes(value.type)) throw new Error("Invalid annotation type");
        const pageIndex = this.integer(value.page_index, 0, pageCount - 1, "page index");
        if (!Array.isArray(value.rects) || !value.rects.length || value.rects.length > 400) throw new Error("Invalid annotation rectangles");
        const viewBox = value.view_box;
        if (!Array.isArray(viewBox) || viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= viewBox[0] || viewBox[3] <= viewBox[1]) throw new Error("Invalid PDF page bounds");
        for (const rect of value.rects) {
            if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite) || rect[2] <= rect[0] || rect[3] <= rect[1]
                || rect[0] < viewBox[0] - 1 || rect[1] < viewBox[1] - 1 || rect[2] > viewBox[2] + 1 || rect[3] > viewBox[3] + 1) throw new Error("Annotation rectangle is outside the PDF page");
        }
        if (["highlight", "underline"].includes(value.type) && (typeof value.text !== "string" || !value.text.trim() || value.text.length > 50000)) throw new Error("Highlight needs exact source text");
        if (value.type === "image") {
            if (value.rects.length !== 1 || typeof value.image_base64 !== "string" || value.image_base64.length > 8000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.image_base64)) throw new Error("Invalid image annotation PNG");
            const png = atob(value.image_base64);
            if (!png.startsWith("\x89PNG\r\n\x1a\n") || png.length < 24) throw new Error("Image cache must be PNG");
            const size = offset => ((png.charCodeAt(offset) * 16777216) + (png.charCodeAt(offset + 1) << 16) + (png.charCodeAt(offset + 2) << 8) + png.charCodeAt(offset + 3));
            if (size(16) < 1 || size(20) < 1 || size(16) > 10000 || size(20) > 10000) throw new Error("Invalid PNG dimensions");
        }
        if (typeof value.comment !== "string" || value.comment.length > 20000 || (value.type === "note" && !value.comment.trim())) throw new Error("Invalid annotation comment");
        const role = value.color_role === undefined ? (value.type === "image" ? "image" : "annotation") : value.color_role;
        if (!Object.prototype.hasOwnProperty.call(this.colorPreferences, role)
            || (value.type === "image" ? !["image", "chart"].includes(role) : !["annotation", "important"].includes(role))) throw new Error("Invalid annotation color role");
        const color = value.color === undefined ? this.colorDefaults()[role] : value.color;
        if (!Object.prototype.hasOwnProperty.call(this.colors, color)) throw new Error("Invalid annotation color");
        if (!Array.isArray(value.tags) || value.tags.length > 50 || value.tags.some(tag => typeof tag !== "string" || !tag.trim() || tag.length > 200)) throw new Error("Invalid tags");
        this.integer(value.offset, 0, 1000000000, "text offset");
        if (typeof value.page_label !== "string" || value.page_label.length > 100) throw new Error("Invalid page label");
        const pad = (value, width) => String(Math.min(10 ** width - 1, Math.max(0, Math.floor(value)))).padStart(width, "0");
        const top = viewBox[3] - value.rects[0][3];
        // Preserve the normalized shape of explicitly colored legacy plans so
        // their stored receipt hashes remain valid after this upgrade.
        const classification = value.color_role === undefined && value.color !== undefined ? {} : { color_role: role };
        return { ...value, color, ...classification, page_index: pageIndex, sort_index: [pad(pageIndex, 5), pad(value.offset || 0, 6), pad(top, 5)].join("|") };
    },
    async updateAnnotations(data) {
        this.assertEnabled(true);
        const { item: attachment, filePath } = await this.attachment(data.attachment_id);
        if (!Zotero.Libraries.get(attachment.libraryID).editable) throw new Error("Library is read-only");
        const pageCount = this.integer(data.page_count, 1, 100000, "page count");
        if (!Array.isArray(data.annotations) || !data.annotations.length || data.annotations.length > 50) throw new Error("Update batch must have 1–50 annotations");
        if (!/^[a-f0-9]{64}$/.test(data.file_sha256 || "") || await this.digest(filePath) !== data.file_sha256) throw new Error("PDF changed since repair was prepared");
        const canonical = value => {
            if (Array.isArray(value)) return value.map(canonical);
            if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
            return value;
        };
        const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
        const seen = new Set();
        const inputs = data.annotations.map(value => {
            if (!value || !/^u-[A-Z0-9]{8}$/.test(value.annotation_id || "") || seen.has(value.annotation_id)) throw new Error("Invalid or duplicate annotation ID");
            seen.add(value.annotation_id);
            if (!["highlight", "underline"].includes(value.type)) throw new Error("Boundary updates only support existing text annotations");
            if (typeof value.expected_text !== "string" || !value.expected_position || typeof value.expected_position !== "object") throw new Error("Missing expected annotation state");
            return this.validateAnnotation(value, pageCount);
        });
        const result = { attachment_id: this.ref(attachment), updated: [], already_current: [] };
        await Zotero.DB.executeTransaction(async () => {
            const changes = [];
            // Check the entire batch before changing any item.
            for (const input of inputs) {
                this.assertEnabled(true);
                const annotation = await Zotero.Items.getByLibraryAndKeyAsync(Zotero.Libraries.userLibraryID, input.annotation_id.slice(2));
                if (!annotation || annotation.deleted || !annotation.isAnnotation() || annotation.parentID !== attachment.id) throw new Error("Annotation does not belong to this PDF");
                await annotation.loadDataType("annotation");
                await annotation.loadDataType("annotationDeferred");
                const position = JSON.parse(annotation.annotationPosition);
                if (annotation.annotationType !== input.type || position.pageIndex !== input.page_index || input.expected_position.pageIndex !== input.page_index) throw new Error("Boundary updates must retain annotation type and page");
                const replacement = { ...position, rects: input.rects };
                if ((annotation.annotationText || "") === input.text && equal(position, replacement)) {
                    result.already_current.push(input.annotation_id);
                    continue;
                }
                if ((annotation.annotationText || "") !== input.expected_text || !equal(position, input.expected_position)) throw new Error("Annotation changed since repair was prepared: " + input.annotation_id);
                changes.push({ annotation, input, replacement });
            }
            for (const { annotation, input, replacement } of changes) {
                this.assertEnabled(true);
                // Retain ID, comment, color, tags, author, relations and list order.
                annotation.annotationText = input.text;
                annotation.annotationPosition = JSON.stringify(replacement);
                await annotation.save();
                result.updated.push(input.annotation_id);
            }
        });
        return result;
    },
    async apply(data) {
        this.assertEnabled(true);
        if (typeof data.request_id !== "string" || !/^[a-f0-9]{32}$/.test(data.request_id)) throw new Error("Invalid request ID");
        const { item: attachment, filePath } = await this.attachment(data.attachment_id);
        const library = Zotero.Libraries.get(attachment.libraryID);
        if (!library.editable) throw new Error("Library is read-only");
        const pageCount = this.integer(data.page_count, 1, 100000, "page count");
        if (!Array.isArray(data.annotations) || !data.annotations.length || data.annotations.length > 50) throw new Error("Annotation batch must have 1–50 items");
        const annotations = data.annotations.map(value => this.validateAnnotation(value, pageCount));
        if (!/^[a-f0-9]{64}$/.test(data.file_sha256 || "") || await this.digest(filePath) !== data.file_sha256) throw new Error("PDF changed since it was read. Read and prepare annotations again.");
        const payloadHash = this.digestText(JSON.stringify({ attachment: attachment.key, hash: data.file_sha256, annotations }));
        const record = await PaperBridgeMetadata.reserve(data.request_id, payloadHash, attachment, annotations);
        const result = { attachment_id: this.ref(attachment), created: [], already_applied: false };
        let reused = 0;
        await Zotero.DB.executeTransaction(async () => {
            const existing = [];
            for (let index = 0; index < annotations.length; index++) {
                const entry = record.entries[index];
                const annotation = await Zotero.Items.getByLibraryAndKeyAsync(attachment.libraryID, entry.key);
                if (!annotation && entry.committed) throw new Error("Previously created annotation no longer exists; refusing to recreate it on retry");
                if (annotation) {
                    if (annotation.deleted || !annotation.isAnnotation() || annotation.parentID !== attachment.id) throw new Error("Previously created annotation was deleted or moved; review it before preparing a new request");
                    await annotation.loadDataType("annotation");
                    if (annotation.annotationType !== annotations[index].type) throw new Error("Previously created annotation has a different type");
                }
                existing.push(annotation);
            }
            const present = existing.filter(Boolean).length;
            if (present && present !== annotations.length) throw new Error("Only part of a previously created batch exists; review its annotations before preparing a new request");
            for (let index = 0; index < annotations.length; index++) {
                this.assertEnabled(true);
                const input = annotations[index];
                const entry = record.entries[index];
                let annotation = existing[index];
                if (annotation) {
                    reused++;
                }
                if (!annotation) {
                    annotation = new Zotero.Item("annotation");
                    annotation.libraryID = attachment.libraryID;
                    annotation.key = entry.key;
                    await annotation.loadPrimaryData();
                    annotation.parentID = attachment.id;
                    annotation.annotationType = input.type;
                    if (["highlight", "underline"].includes(input.type)) annotation.annotationText = input.text;
                    annotation.annotationComment = input.comment;
                    annotation.annotationColor = this.colors[input.color];
                    annotation.annotationPageLabel = input.page_label || String(input.page_index + 1);
                    annotation.annotationSortIndex = input.sort_index;
                    annotation.annotationPosition = JSON.stringify({ pageIndex: input.page_index, rects: input.rects });
                    annotation.annotationAuthorName = "Codex";
                    for (const tag of input.tags) annotation.addTag(tag);
                    await annotation.save();
                }
                result.created.push({ annotation_id: this.ref(annotation), type: input.type, page: input.page_index + 1, zotero_uri: "zotero://open-pdf/library/items/" + attachment.key + "?annotation=" + annotation.key });
            }
        });
        result.already_applied = reused === annotations.length;
        // The prewritten key journal survives a crash here. Retrying an image
        // cache or journal write reuses those keys, never creating duplicate items.
        await PaperBridgeMetadata.commit(data.request_id, record.complete);
        for (let index = 0; index < annotations.length; index++) {
            const input = annotations[index];
            if (input.type !== "image") continue;
            const decoded = atob(input.image_base64);
            const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
            await Zotero.Annotations.saveCacheImage({ libraryID: attachment.libraryID, key: result.created[index].annotation_id.slice(2) }, new Blob([bytes], { type: "image/png" }));
        }
        await PaperBridgeMetadata.commit(data.request_id, true);
        return result;
    }
};
