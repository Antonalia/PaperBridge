# Changelog

[简体中文](CHANGELOG.md) | **English**

## 1.0.3 — Bilingual presentation, paper tags and automatic skills

- Refresh the README with a project banner, square badges, feature cards and a workflow diagram. Chinese is the default; English documentation covers setup, updates, privacy, source and builds.
- Add a persistent Chinese/English selector for the settings page, including labels, accessibility text, color names, setup states and companion errors. Existing user data remains in its original language.
- Add get/prepare/apply tools for paper-level automatic tags. PDF IDs resolve to regular parent items; existing tags are preserved, pending stale plans are rejected and repeated application is idempotent.
- Bundle `zotero-paper-annotator` with `zotero-literature-notes`, including English skill entrypoints. Configure Codex installs all bundled skills. Upgrades add future skills and update unchanged managed copies while preserving local edits.
- Add tag, skill installation, translation coverage and packaged-runtime checks. Retain the synchronization repair and native automatic-update behavior.

## 1.0.2 — Native Zotero updates and companion upgrades

- Use Zotero's native update system and the stable GitHub release feed, with XPI SHA-256 verification.
- Respect Default/On/Off update preferences instead of forcing updates off.
- Generate the feed from the actual XPI and upload it with the complete source and checksums before publishing.
- Upgrade valid configured MCP connections, backing up configuration and preserving extra settings and other MCPs. Do not overwrite removed, disabled or customized connections.
- Companion upgrade failures do not prevent Zotero startup. Report status and allow manual retry. Older users need one manual upgrade before automatic updates work.

## 1.0.1 — Fix synchronization errors caused by annotations

- Fix Zotero 10 setup failing with `nsIURI.username` while reading the companion manifest inside the XPI.
- Move internal idempotency records and image/figure kinds out of `dc:relation`; custom URNs there caused Zotero cloud HTTP 400 errors.
- Store metadata locally under `paperbridge/` in the Zotero data directory.
- Back up and migrate the two legacy invalid relation types while preserving annotation content, position and valid relations.
- Document reinstalling, migration, reconfiguration and checking synchronization. Updates were still manual in this version.

## 1.0.0 — First public stable release

- Connect Zotero's personal library to Codex for PDF reading, native annotations and collection-aware Obsidian imports.
- Provide editable annotation rules, color settings and Zotero link preferences.
- Include the Windows x64 companion, complete corresponding source, third-party licenses and SHA-256 checksums.
- Preserve the early local plugin ID, preference prefix and existing native annotations.
