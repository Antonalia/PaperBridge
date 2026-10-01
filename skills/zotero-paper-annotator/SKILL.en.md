---
name: zotero-paper-annotator
description: "Use Zotero PaperBridge to read one paper, create editable native annotations and paper-level topic tags, explain core formulas, and produce Markdown with worked examples. Use for paper annotation, tagging, classification or explanation requests."
---

# Zotero paper annotation

[简体中文](SKILL.zh.md) | **English**

Turn the argument, mechanisms, formulas, experiments and limitations of one paper into native Zotero annotations and a readable Markdown explanation. Use English in this English entrypoint unless the user specifies another language; retain source terminology and mathematical notation. Match the requested depth and output location.

## Connection and scope

- Discover the actual callable `zotero_local` tools. Read `zotero_status` for version, writes, current annotation rules and color preferences. Keep Zotero open; tool names may retain the earlier bridge name.
- Identify the paper with search or selected items. Verify title, version, year and PDF. Use only returned IDs. Clarify only genuinely indistinguishable candidates while continuing independent work.
- Requests to automatically annotate or test on a paper authorize relevant additions. Review prepared plans autonomously and complete already-authorized writes without repeating permission requests. Explanation, summary or preview requests alone do not authorize writes.
- If connection, enabled writes or necessary capabilities are missing, finish possible reading/local work and state the specific limitation. Do not change settings, databases or the installation to bypass restrictions.
- Save Markdown to the requested destination, otherwise the workspace delivery folder (`outputs/` for projectless chats; intermediates in `work/`). Obsidian configuration does not by itself authorize importing. Use bridge prepare/apply imports when requested, respecting configured folders and links.

## Read and select evidence

1. Read the main text and necessary appendices with `zotero_read_pdf`, at most 20 one-based physical pages per call. Read existing annotations to establish duplicate checks.
2. Follow the argument: problem, gap, contributions, mechanism, training/inference, evidence and limitations. Select meaningful evidence rather than fixed page or annotation quotas.
3. List core formulas, including unnumbered expressions and necessary appendix equations. Record original form, number, physical page, symbol-definition sources and uncertainties. A prose summary does not replace formula explanation.
4. Render formula pages and visually verify subscripts, superscripts, sums, conditions, fonts, signs and numbering. Extraction can scramble math; do not repair it into a familiar expression without evidence.
5. Read [explanation patterns](references/explanation-patterns.en.md) for formulas, key points and worked-example requirements.

## Reliable native annotations

A returned passage may be a typeset line rather than a sentence. Determine complete selections in context, then find the exact extracted source with `zotero_find_pdf_text`.

- Default highlights/underlines run from a complete sentence's beginning through its final punctuation; consecutive complete sentences may be combined. Keep a multiline sentence in one annotation and exclude fragments of adjacent sentences. Follow explicit requests for terms, phrases or formula fragments.
- Match the PDF's actual text, including hyphenation, math characters and whitespace. Put translations, interpretations and examples in `comment`, never in place of the highlighted original.
- Use returned opaque locators, not guessed coordinates. If matching fails, revisit the page and nearby text. If a formula cannot be reliably anchored, attach a note to a nearby complete introductory sentence, stating the formula/page. Image regions require an inspected render and measured pixel rectangle from that render.
- Deduplicate across annotation types by page, source/formula region and explanatory purpose. Images and notes may have empty `text`; compare comments, equation numbers and regions too. Preserve existing/manual content. Update in place only when a callable update interface exists; a status flag alone is insufficient. Do not create duplicates as a substitute for repairing old annotations.
- Use `emphasis: important` for central points and `normal` otherwise. Omit explicit colors unless requested so preferences apply. Annotation tags may aid retrieval, but are separate from paper-level tags.
- Comments may contain Markdown and `$...$`/`$$...$$`. Client rendering varies; preserve full Markdown/LaTeX in the independent document rather than promising rendered math in Zotero.

## Automatic paper tags

Automatic paper-annotation requests also include content tags on the regular parent item. Tag-only/classification requests perform reading and tagging only, without extra annotations or long explanations. Explanation/summary/preview requests alone do not write tags.

1. Discover `zotero_get_item_tags`, `zotero_prepare_item_tags` and `zotero_apply_item_tags`. Verify actual callable capability; status/version alone does not prove a write interface exists.
2. Read tags using a returned paper ID. PDF IDs resolve to the regular parent item. Do not place paper topics only on attachments or annotations. Report standalone PDFs without a parent; do not silently create a reference item.
3. Read abstract, method and conclusion, plus relevant text if necessary. Usually choose 3–6 stable topic, method and application tags grounded in the paper. Reuse synonymous existing tags and the user's vocabulary; avoid duplicate languages for the same concept, broad keyword piles and unsupported judgments. Respect requested vocabulary, language and counts; otherwise retain common English technical terms.
4. Execute get → prepare → check target title, existing tags, additions and source evidence → apply → get. The interface adds only missing automatic tags (type 1), retaining existing tags and types. Read and prepare again for expired plans or changed tag snapshots.
5. Report only readback-verified additions/existing tags, separately from annotation tags. Do not assign reading-status tags unless the status is true or requested.

For Ctrl-World, grounded candidates include `world model`, `robot manipulation` and `action-conditioned video generation`. These illustrate selection, not a vocabulary to apply mechanically to other papers.

## Prepare, write and verify annotations

For authorized additions, prepare → inspect → apply → list native annotations. Image/formula crops use `zotero_prepare_image_annotation`; inspect the crop before applying. For the first highlight in a PDF or new bridge version, apply one meaningful complete sentence, inspect returned `position.rects` for endpoints and overlapping adjacent lines, then expand the batch. Check complex superscript geometry against the page. Preserve completed results if real anchoring/geometry issues arise; do not guess a replacement.

Check attachment, page, first/last words, adjacent source, locator coverage and comment in every preview. Rectangles must cover selected text, without the next sentence's beginning. Re-find/reprepare incorrect plans. Reprepare if rule versions change. Report success only after apply and readback. An uncertain response calls for reading existing state, not blindly creating a new plan. Same-plan retries are idempotent; prepared plans are not completed writes. Preserve partial successes and identify failures.

## Markdown delivery

Organize around the paper: identity/version, argument, key mechanisms, all core formulas, numerical examples, experiments and limits. Locate explanations by physical page, section and equation number; distinguish printed page labels.

Separate author claims/results, source-based interpretation and constructed teaching examples. Use short locating quotations rather than copying the paper. Verify math/numbers against pages. Mark missing dimensions or experimental details as not specified; do not invent facts.

Finish with a file link and actual counts: new annotations, existing annotations cited in the explanation, skipped duplicates and failures. Existing content used in an explanation is not a new write, and merely read annotations are not reuse. Declare Zotero completion only after verification.
