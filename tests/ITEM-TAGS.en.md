# Local automatic paper tags

[简体中文](ITEM-TAGS.md) | **English**

Tools: `zotero_get_item_tags`, `zotero_prepare_item_tags`, `zotero_apply_item_tags`.
Use a returned personal-library paper or PDF `item_id`; PDF IDs resolve to the regular parent without needing the file downloaded. Standalone PDFs, notes, annotations, trashed items and non-personal items are rejected.

After reading the paper, choose content-grounded tags and reuse existing vocabulary. Prepare returns additions, already-present tags and a plan valid for 60 minutes, without writing. Apply uses the existing write switch and adds only missing automatic tags (type 1), preserving all previous tags/types. Pending additions require an unchanged existing-tag snapshot; when all requested tags are already present, a retry returns safely. Expired plans or a restarted MCP require preparing again. Read tags after applying to confirm success.

Tests: `node tests/test_item_tags.mjs` and `.venv/Scripts/python.exe tests/test_item_tags.py`.
For a local development package, build the companion and run `tools/build_local.py --output <directory>`. It does not generate an update feed or publish, and retains the current version. Install the XPI, click Configure Codex and reload Codex/MCP. Complete dependency sources remain under `third_party/sources/`; use the ordinary matching-source release build for public distribution.
