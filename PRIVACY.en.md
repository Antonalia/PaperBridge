# Privacy

[简体中文](PRIVACY.md) | **English**

PaperBridge connects Codex to Zotero on this computer through an authenticated `127.0.0.1` endpoint. It exposes personal-library metadata, local PDF text and native annotations only to requests carrying the local token. Group libraries are not supported. Browser-origin requests are rejected. Subsequent processing by Codex/OpenAI follows your product settings; the local bridge does not mean the model runs entirely offline.

One-click setup backs up an existing Codex configuration before changes, updates the PaperBridge MCP entry and preserves unrelated entries. From 1.0.2, plugin updates automatically advance valid, enabled connections whose executable and arguments still belong to PaperBridge. Removed, disabled or customized connections are left unchanged. Failures can be retried manually.

From 1.0.3, setup also copies bundled skills to `$CODEX_HOME/skills` (default `~/.codex/skills`). New releases add bundled skills and update unchanged managed files. Locally edited or conflicting independent copies are preserved. The local `paperbridge-skills.json` inventory contains skill names and file hashes. Skill installation makes no network requests. Selecting the interface language before setup chooses the corresponding skill entrypoints; saved user rules and note content are not translated.

Zotero accesses the public GitHub update feed and XPI download links over HTTPS according to your update settings. Those requests reveal ordinary request information, such as the IP address, to GitHub. They do not attach library content, annotations, Codex configuration or the local token. Each token is generated on the user's machine and passed to setup over standard input, never through command-line arguments or release files.

Annotation and paper-tag writes require enabled writes and user authorization. Paper tags are appended to the regular parent item, preserving existing tags. Imports write only the configured Obsidian vault, back up existing notes and preserve manual text. Temporary preparation plans may contain original text, comments and local paths; treat them as personal data.

From 1.0.1, idempotency records and image/figure classifications live in `paperbridge/` beneath the Zotero data directory instead of synced item `relations`. Startup checks the two legacy internal URN types, backs up the data and removes only PaperBridge's invalid relations. Migration backups may contain annotation data; do not publish them as release attachments or diagnostic files. Native annotations still follow your Zotero synchronization settings.

Share only the generated XPI, corresponding source ZIP and public documentation. Do not publish `bridge-config.json`, personal papers or notes, import plans, Codex configuration, Zotero libraries or profile directories, or `paperbridge/` metadata and migration backups.
