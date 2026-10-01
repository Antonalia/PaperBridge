---
name: zotero-literature-notes
description: "Read Zotero papers in depth and turn verified native annotations into detailed Obsidian literature notes through PaperBridge, following collection folders and source-link settings. Use for requests to explain a paper and save it to Obsidian, or annotate before importing."
---

# Zotero → Obsidian literature notes

[简体中文](SKILL.zh.md) | **English**

Complete a traceable chain: **Zotero original → native PDF annotations → PaperBridge import → detailed explanation in the same Obsidian note**. Use English with this entrypoint unless the user requests another language; retain technical terms, math and verified values.

Explanation/search requests alone do not authorize annotation or export writes. An explicit full-workflow request authorizes its annotations/import; prepare concrete plans, inspect previews and execute within that authorization without asking again. Authorization does not extend to settings changes, deletion, unrelated note moves or messages.

## 1. Verify the paper and read its source

1. Check status/writes and keep Zotero open. Use search for titles/keywords and selected items only when the user points to the selection. Use returned IDs.
2. Verify title, authors, date, arXiv/DOI and version. Proceed for a unique contextual match; clarify genuinely ambiguous candidates.
3. Read main text and necessary appendices in batches of at most 20 one-based physical PDF pages. Include methods, experiments, ablations and important appendices; an abstract or secondary account is not a substitute.
4. Use exact source finding for selections and only returned locators. State OCR limitations for scanned PDFs instead of inventing anchors.
5. Default related-work scope is work actually cited, discussed or compared in the paper. Verify its source context. History, similar notes or a conceivable combination do not justify adding comparisons. Add external comparisons only when currently requested, clearly marking them as extensions. Search Zotero for each cited paper using an exact title or distinctive phrase; check pagination rather than treating a truncated result as absence. Read local PDFs first when available. Browse original/author materials for missing references or current versions, without replacing local Zotero citations with web links. A single-paper reading is not a systematic review.

## 2. Inspect and supplement native annotations

List existing annotations. If none exist, create meaningful native evidence before preparing an Obsidian import; lack of annotations does not justify bypassing the import with a handwritten export. Reuse existing content and fill requested gaps without duplicate source/purpose annotations.

Cover the evidence backbone: problem, conclusion, model overview, mechanisms, training/inference differences, main results, ablations, measurement conditions and limits. Choose counts by paper complexity, not page quotas.

- Use prepared text annotations with same-page consecutive locators. Select complete sentences through their final punctuation, excluding adjacent fragments. A passage is often one line, not a sentence. Two-column extraction order does not prove paragraph continuity. Follow explicit phrase/formula selection requests.
- Match actual extracted source, including hyphenation, math and whitespace. Put interpretation in comments, retain highlighted originals, use important emphasis for central points and omit colors unless requested.
- Render and actually inspect figures/tables before measuring the pixel crop. Use returned render IDs, `figure`/`table` kinds and original coordinates, never guessed coordinates or another PDF's regions. Explain data flow for figures and metrics/baselines/deltas/conditions for tables.
- Inspect text, position, colors and crops before applying. Record returned annotation IDs and read back actual state. PDFs remain unchanged.

### Boundaries and geometry

Check every prepared selection against the full original sentence. Apply one meaningful initial highlight for a new PDF/layout, inspect `position.rects`, then enlarge the batch. Multiple rectangles for a multiline sentence are normal; splitting it into separate annotations is not. Check both overlap between annotations and overlap between adjacent rectangles within one annotation. Report real geometry problems and pause further text highlights; mathematical scripts may need taller bounds, so fixed-height clipping is not a safe repair.

Earlier local bridge 0.1.10 used line bounding boxes for passages and unions of matched character boxes for exact finding; font bounds could overlap line spacing. Exact sentence finding improves horizontal endpoints but does not itself prove no vertical overlap. Do not guess coordinates, bypass locators or add duplicate regions as a correction.

Current apply tools add annotations. Verify an actual callable in-place update interface before repair; a same-plan retry being idempotent does not deduplicate new plans. Otherwise preserve old annotations and provide a correction preview/limitation, never edit live Zotero SQLite or claim a changed comment repaired highlight geometry.

## 3. Import through the bridge using actual folders and links

1. Initially prepare the import with the true attachment and comments, **without `target_note`**. Read the actual vault, top folder, layout, collection ID/full path, resolved note path and link preferences. If needed inspect the bridge's snapshot. Search results alone do not justify guessing collections.
2. Collection layout means **vault / top folder / full collection hierarchy / filename.md**. Top folder and collection path are additive. Preserve parent/child levels, not just the leaf, and do not invent theme folders. Flat layout applies only when configured. Use bridge-sanitized paths rather than collection labels as arbitrary shell paths.
3. Resolve multiple collections from returned candidates, actual selected collection or user instructions; pass the appropriate `collection_id` and reprepare. Clarify only if no unique selection is possible. Do not silently use the first candidate or the top folder. When the task explicitly requires collection layout, missing/unfiled/unreadable collections are a limitation to resolve, not a reason to claim top-level placement is correct.
4. Use `target_note` only for explicit destinations, real existing notes or filename changes. Changing a filename retains the already verified top folder/full collection parent path. Independent regeneration chooses a new filename there without copying old content or overwriting. A wrongly placed old note does not authorize continuing in the wrong folder; safely migrate note, links and sidecar metadata when the task requires correct placement. Only explicit exceptions override the configured destination.
5. If internal markers were cleaned, run `scripts/note_metadata.py restore --vault <actual vault> --note <absolute note>` before syncing; do not append duplicate imports to a marker-free note. Restore preserves unmanaged text and refuses uncertain edited-block matching. Review resolved path, annotations, images and links, then apply within authorization. Successful preparation is not a saved note.
6. For changed notes/settings, reprepare once and inspect differences. Repeated conflicts retain the draft and report the obstacle. No-annotation failures return to creating evidence. Do not modify preferences to fit a guessed destination or copy files as a substitute for the bridge.

Manual annotation deep links require `zotero_get_obsidian_link` with verified annotation IDs and content kinds. Omit disabled/null links, including text/image/figure preferences. Do not hand-construct links to bypass settings.

### Prefer Zotero for source citations

For both prose and reference tables, link a paper found in Zotero directly to Zotero. Only genuinely unfiled papers use verified original/author webpages. Browsing does not change this routing. arXiv/DOI may remain identity text; requested project/code pages or another version may have their own web links.

- General citations use returned `zotero_uri`, even if a local item lacks a PDF.
- Evidence citations prefer the actual read PDF page: verify the returned personal attachment ID `u-XXXXXXXX`, remove only `u-`, and use `zotero://open-pdf/library/items/<attachment-key>?page=<physical-page>`. Never use the parent item key. Verify page bounds with the PDF read; distinguish printed page labels. Prefer a bridge page-link resolver when available. If attachment/page cannot be confirmed, use the item URI and honest location text.
- Link near the supported explanation, with equation/table/appendix numbering and physical page. Choose key pages, optionally two adjacent ones, instead of collecting all evidence links at the end. Never leave placeholders in delivered notes.
- Source citations and `?annotation=...` links serve different purposes. Continue respecting annotation link switches; do not disguise annotation links as sources or reset preferences. Follow explicit requests to omit all Zotero source links.
- A failed search/connection is not proof a paper is absent. State uncertainty and reuse one verified mapping per paper rather than switching randomly between web and Zotero.

## 4. Expand the same imported note

Read the saved note and add the interpretation outside bridge-managed blocks, preserving original/manual content, annotation IDs, resources and management boundaries. Update only this skill's expansion area, avoiding full overwrite or repeated append. A possible area uses `<!-- literature-notes:expanded:start -->` and `<!-- literature-notes:expanded:end -->`. Preserve meaningful user additions inside an existing area. Reorganize detailed handwritten content instead of creating an equivalent second explanation. Embedded bridge blocks keep their content and intact boundaries even if moved beside relevant explanations; replacing an expansion must not delete them.

Read [model explanation guidance](references/model-explanation.en.md). Follow actual data flow: inputs/tensors → computation → outputs/update dependencies → complete symbol definitions → numerical teaching example → training/inference. Place original evidence, figures and related-work citations near the relevant explanation, not only at the end. Actually read supplied style samples; if unavailable, request excerpts instead of claiming imitation.

### Title, publication metadata and opening

Obsidian's inline title comes from the filename, not a body H1. Use the full paper title as the real filename, minimally replacing Windows-invalid characters (e.g. a colon with a fullwidth colon). Do not put execution labels into the title. Independently generated notes do not overwrite an existing namesake; add a short version suffix only for an actual conflict.

When inline titles are enabled/confirmed, start with a compact **publication date / journal or conference** table, without a duplicate H1 or identity paragraph repeating authors, version, page count and full title. If inline titles are explicitly disabled, retain one title H1. Do not change global display preferences. Renames check target conflicts, references, relative images and sidecar metadata; changing body H1 alone is not a filename change.

Verify dates/venues from Zotero metadata and the corresponding source. Label preprint dates as preprint release dates rather than formal publication dates. For unknown venues, state unconfirmed or an identified preprint platform; do not invent a venue or infer unpublished status. Link available local sources through Zotero. The first prose paragraph explains the problem, existing tension/gap and core idea, rather than repeating identity or listing modules.

Scale detail to the paper and request, covering the research question, actual cited predecessors, architecture/tensor/time scales, every shown formula's complete symbols/axes/shapes and worked calculation, experiments and ablations, hardware/resolution/sampling/timing scope, conclusions and limits. Distinguish percentage points from relative percentages, task/class averages, cumulative ablations from retrained controls, and same-checkpoint inference changes. Avoid combining speed ratios across unlike conditions. Separate author claims, derivations and untested ideas; note seeds, saturated benchmarks and restricted real/OOD testing. Add knowledge links only to relevant real existing notes within the source/requested scope, not merely because history mentioned them.

Use short verifiable quotations, not extensive copies. For edits outside default writable roots, obtain necessary file permissions for the authorized local edit without extending to unrelated files.

### Keep internal markers out of the finished body

After import/expansion, run `scripts/note_metadata.py clean --vault <actual vault> --note <absolute note>`. It moves recognized `codex-zotero-*` and expansion management comments into `.codex-zotero-sync` sidecar metadata, preserving prose, sources, images, formulas and enabled links. Do not leave escaped markers, internal ID lists or execution logs in the finished note. Restore before later sync/edit and clean afterwards; keep note and sidecar together. Do not alter native annotations/settings for this presentation.

## 5. Completion checks

Verify native annotations, successful bridge import, actual full collection/top-folder destination, image resolution, expansion and retained manual content. Record returned collection ID/full path and real vault-relative destination. Check values, formula/code fences, citation identities, duplication, verified page attachment keys and Zotero routing. Confirm source comparisons have original evidence or current explicit authorization.

Read formulas in the saved note: every displayed expression—including teaching dependencies—has nearby complete definitions, compatible axes/shapes, no undefined indices/parameters, and core mechanisms have reproducible intermediate calculations and outputs. Distinguish teaching assumptions from paper facts. Updating the skill alone is not completing a requested existing-note edit.

Check filename/inline title, absence of duplicate H1, compact publication table and problem-led opening. Management comments belong in the sidecar; evidence and literature appear near the mechanism, and a reader can follow a complete computation.

Finally state the paper, actual added text/image annotations, verified bridge import, actual vault-relative path and explanation scope. A workspace backup is optional and does not replace the Obsidian delivery. If bridge, writes, OCR or import remains blocked, retain completed drafts and state the precise limitation. Do not bypass the flow without explicit permission for a manual alternative or claim complete success.
