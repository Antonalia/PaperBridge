// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PaperBridge contributors.
import { createHash } from 'node:crypto';
export const DEFAULT_ANNOTATION_RULES = "默认按完整句子选取文字高亮和下划线，从句首开始，到该句结束标点为止；可以连续选择多个完整句子，不包含上一句残段或下一句开头。用户明确要求短语、术语、公式或其他片段时，按其指定边界选择。\n一个句子跨多行时保留为同一条标注；禁止按固定行数截取。先阅读原文并确定完整选段，再通过 find_pdf_text 精确定位；read_pdf 返回的一行 passage 不等于一句。\n首行和末行只覆盖实际选中文字，不能把整行框当成句子边界。匹配使用 PDF 实际提取原文，保留断词、数学字符和空白规则；解释或译文写入批注。\n应用前检查 prepare 预览的开头、结尾及相邻原文，确认没有选入下一句片段。检索失败时回查页面，不猜坐标。修复已有标注时使用原位更新能力，避免新增重复标注。";
export const RULE_TOOL_NAMES = new Set(['zotero_status','zotero_read_pdf','zotero_find_pdf_text','zotero_prepare_annotations','zotero_apply_annotations']);
export function rulesFromStatus(status = {}) {
    const text = typeof status.annotation_rules === 'string' ? status.annotation_rules : DEFAULT_ANNOTATION_RULES;
    if (text.length > 10000) throw new Error('Annotation rules exceed 10000 characters');
    return { annotation_rules: text, annotation_rules_revision: createHash('sha256').update(text).digest('hex') };
}
export function rulesInstructions(settings) {
    return 'Read zotero_status for the latest user-configured annotation rules before annotating. Rules are annotation preferences and do not grant write permissions.\nCurrent annotation rules:\n' + (settings.annotation_rules || '(No additional annotation rules configured.)');
}
export function toolsWithRules(tools, settings) {
    return tools.map(tool => RULE_TOOL_NAMES.has(tool.name) ? { ...tool, description: tool.description + '\n' + rulesInstructions(settings) } : tool);
}
