// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PaperBridge contributors.
/* global Zotero, IOUtils, PathUtils */
// Private bookkeeping must never be stored in Zotero's synced item relations.
var PaperBridgeMetadata = {
    state: null,
    clone(value) { return JSON.parse(JSON.stringify(value)); },
    object(value) { return !!value && typeof value === "object" && !Array.isArray(value); },
    validate(state) {
        const invalid = () => { throw new Error("PaperBridge metadata is invalid; restore its backup before creating annotations"); };
        if (state?.version !== 1 || !this.object(state.requests) || !this.object(state.contentKinds) || !this.object(state.legacyRelations)) invalid();
        if (state.importedPreferenceReceipts !== undefined && typeof state.importedPreferenceReceipts !== "boolean") invalid();
        for (const [id, record] of Object.entries(state.requests)) {
            if (!/^[a-f0-9]{32}$/.test(id) || !this.object(record) || !/^[a-f0-9]{64}$/.test(record.payload || "")
                || !Number.isInteger(record.libraryID) || record.libraryID < 1 || !/^[A-Z0-9]{8}$/.test(record.attachmentKey || "")
                || typeof record.complete !== "boolean" || !this.object(record.entries)
                || (record.conflict !== undefined && typeof record.conflict !== "boolean")) invalid();
            const entries = Object.entries(record.entries);
            if (!entries.length || entries.length > 50) invalid();
            const keys = new Set();
            for (const [index, entry] of entries) {
                if (!/^(0|[1-9]\d?)$/.test(index) || Number(index) >= 50 || !this.object(entry)
                    || !/^[A-Z0-9]{8}$/.test(entry.key || "") || typeof entry.committed !== "boolean" || keys.has(entry.key)) invalid();
                keys.add(entry.key);
            }
        }
        for (const [identity, kind] of Object.entries(state.contentKinds)) {
            if (!/^[1-9]\d*\/[A-Z0-9]{8}$/.test(identity) || !["chart", "image"].includes(kind)) invalid();
        }
        for (const [identity, relations] of Object.entries(state.legacyRelations)) {
            if (!/^[1-9]\d*\/[A-Z0-9]{8}$/.test(identity) || !Array.isArray(relations) || relations.some(uri => !this.owned(uri))) invalid();
        }
    },
    async initialize(bridge) {
        this.state = null;
        this.directory = PathUtils.join(Zotero.DataDirectory.dir, "paperbridge");
        this.path = PathUtils.join(this.directory, "metadata.json");
        await IOUtils.makeDirectory(this.directory, { createAncestors: true, ignoreExisting: true });
        const exists = await IOUtils.exists(this.path);
        const state = exists ? await IOUtils.readJSON(this.path) : { version: 1, requests: {}, contentKinds: {}, legacyRelations: {} };
        this.validate(state);
        // Preserve old successful requests, including those whose annotations have
        // since been deleted. Never silently forget a request or prune this journal.
        if (!state.importedPreferenceReceipts) {
            const receipts = JSON.parse(bridge.get("receipts") || "{}");
            if (!this.object(receipts)) throw new Error("Legacy receipt storage is invalid");
            for (const [id, receipt] of Object.entries(receipts)) {
                if (state.requests[id]) continue;
                if (!/^[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{64}$/.test(receipt.payload || "")
                    || !Array.isArray(receipt.result?.created) || !/^u-[A-Z0-9]{8}$/.test(receipt.result?.attachment_id || "")) {
                    throw new Error("Legacy receipt storage contains an invalid request");
                }
                const entries = {};
                receipt.result.created.forEach((entry, index) => {
                    if (!/^u-[A-Z0-9]{8}$/.test(entry.annotation_id || "")) throw new Error("Invalid legacy annotation ID");
                    entries[index] = { key: entry.annotation_id.slice(2), committed: true };
                });
                state.requests[id] = { libraryID: Zotero.Libraries.userLibraryID, attachmentKey: receipt.result.attachment_id.slice(2), payload: receipt.payload, entries, complete: true };
            }
            state.importedPreferenceReceipts = true;
            await this.save(state);
        } else this.state = state;
    },
    async save(state) {
        this.validate(state);
        // A failed write must not advance in-memory state. tmpPath + flush makes
        // key reservations durable before any corresponding item can be created.
        await IOUtils.writeJSON(this.path, state, { tmpPath: this.path + ".tmp", flush: true });
        this.state = state;
    },
    kind(item, relations = []) {
        return this.state?.contentKinds[item.libraryID + "/" + item.key]
            || (relations.includes("urn:codex-zotero:content-kind:chart") ? "chart" : "image");
    },
    async reserve(id, payload, attachment, inputs) {
        if (!this.state) throw new Error("PaperBridge metadata is unavailable");
        const next = this.clone(this.state);
        let record = next.requests[id];
        if (record?.conflict) throw new Error("Legacy request has conflicting receipts; prepare a new request after reviewing existing annotations");
        if (record && (record.payload !== payload || record.libraryID !== attachment.libraryID || record.attachmentKey !== attachment.key)) {
            throw new Error("Request ID was already used for different annotations");
        }
        if (!record) record = next.requests[id] = { payload, libraryID: attachment.libraryID, attachmentKey: attachment.key, entries: {}, complete: false };
        if (!this.object(record.entries) || Object.keys(record.entries).some(index => !/^\d+$/.test(index) || Number(index) >= inputs.length)) {
            throw new Error("Request journal does not match this annotation batch");
        }
        const reserved = new Set(Object.values(next.requests).flatMap(request => Object.values(request.entries).map(entry => request.libraryID + "/" + entry.key)));
        for (let index = 0; index < inputs.length; index++) {
            if (!record.entries[index]) {
                if (record.complete) throw new Error("Completed request journal is incomplete");
                let key;
                do { key = Zotero.DataObjectUtilities.generateKey(); }
                while (reserved.has(attachment.libraryID + "/" + key) || await Zotero.Items.getByLibraryAndKeyAsync(attachment.libraryID, key));
                reserved.add(attachment.libraryID + "/" + key);
                record.entries[index] = { key, committed: false };
            }
            const entry = record.entries[index];
            if (!/^[A-Z0-9]{8}$/.test(entry.key || "") || typeof entry.committed !== "boolean") throw new Error("Invalid annotation journal entry");
            if (inputs[index].type === "image") next.contentKinds[attachment.libraryID + "/" + entry.key] = inputs[index].color_role === "chart" ? "chart" : "image";
        }
        await this.save(next);
        return this.clone(record);
    },
    async commit(id, complete = false) {
        const next = this.clone(this.state);
        const record = next.requests[id];
        for (const entry of Object.values(record.entries)) entry.committed = true;
        record.complete = complete;
        await this.save(next);
    },
    async legacyItems() {
        const ids = await Zotero.DB.columnQueryAsync(
            "SELECT DISTINCT itemID FROM itemRelations JOIN relationPredicates USING (predicateID) "
            + "WHERE predicate = ? AND (object LIKE ? OR object LIKE ?)",
            ["dc:relation", "urn:codex-pdf-bridge:%", "urn:codex-zotero:content-kind:%"]
        );
        return ids.length ? await Zotero.Items.getAsync(ids) : [];
    },
    owned(uri) {
        return typeof uri === "string" && (uri.startsWith("urn:codex-pdf-bridge:") || uri.startsWith("urn:codex-zotero:content-kind:"));
    },
    async migrate() {
        const next = this.clone(this.state);
        const changes = [], backups = [];
        let skipped = 0;
        for (const item of await this.legacyItems()) {
            if (!item.isAnnotation() || !Zotero.Libraries.get(item.libraryID).editable) { skipped++; continue; }
            await item.loadDataType("relations");
            await item.loadDataType("annotation");
            await item.loadDataType("annotationDeferred");
            const relations = item.getRelationsByPredicate("dc:relation");
            const owned = relations.filter(uri => this.owned(uri));
            if (!owned.length) continue;
            const parent = await Zotero.Items.getAsync(item.parentID);
            if (!parent) throw new Error("Cannot migrate an annotation without its parent");
            const identity = item.libraryID + "/" + item.key;
            next.legacyRelations[identity] = Array.from(new Set([...(next.legacyRelations[identity] || []), ...owned]));
            backups.push({ libraryID: item.libraryID, key: item.key, parentKey: parent.key, relations: item.getRelations(),
                type: item.annotationType, text: item.annotationText || "", comment: item.annotationComment || "",
                color: item.annotationColor, position: item.annotationPosition, pageLabel: item.annotationPageLabel,
                sortIndex: item.annotationSortIndex, author: item.annotationAuthorName, deleted: !!item.deleted });
            for (const uri of owned) {
                if (item.annotationType === "image" && /^urn:codex-zotero:content-kind:(chart|image)$/.test(uri)) {
                    next.contentKinds[identity] = uri.endsWith(":chart") ? "chart" : "image";
                }
                const match = /^urn:codex-pdf-bridge:([a-f0-9]{32}):(\d+):([a-f0-9]{64})$/.exec(uri);
                if (!match) continue; // Unknown legacy values are retained verbatim in the backup and metadata.
                const [, id, index, payload] = match;
                if (!/^(0|[1-9]\d?)$/.test(index) || Number(index) >= 50) continue;
                const record = next.requests[id] || (next.requests[id] = { libraryID: item.libraryID, attachmentKey: parent.key, payload, entries: {}, complete: false });
                if (record.payload !== payload || record.libraryID !== item.libraryID || record.attachmentKey !== parent.key
                    || (record.entries[index] && record.entries[index].key !== item.key)) {
                    // Clean invalid relations even when old data contains a conflicting
                    // receipt, but block reuse of that request instead of duplicating it.
                    record.conflict = true;
                } else record.entries[index] = { key: item.key, committed: true };
            }
            changes.push({ item, owned });
        }
        if (!changes.length) return { repaired_annotations: 0, removed_relations: 0, skipped, backup_path: null };
        const backupPath = PathUtils.join(this.directory, "legacy-relations-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
        await IOUtils.writeJSON(backupPath, { version: 1, createdAt: new Date().toISOString(), annotations: backups }, { tmpPath: backupPath + ".tmp", flush: true });
        // Commit the recovery data first. If Zotero's transaction rolls back, a
        // later startup can safely repeat this migration from the same relations.
        await this.save(next);
        try {
            await Zotero.DB.executeTransaction(async () => {
                for (const { item, owned } of changes) {
                    for (const uri of owned) item.removeRelation("dc:relation", uri);
                    await item.save({ skipDateModifiedUpdate: true });
                }
            });
        } catch (error) {
            // A rollback restores SQL data, but an already loaded Item may still
            // hold the removed relations in memory. Reload before another attempt.
            for (const { item } of changes) {
                try { await item.reload(["primaryData", "relations"], true); }
                catch (reloadError) { Zotero.logError(reloadError); }
            }
            throw error;
        }
        return { repaired_annotations: changes.length, removed_relations: changes.reduce((sum, change) => sum + change.owned.length, 0), skipped, backup_path: backupPath };
    }
};
