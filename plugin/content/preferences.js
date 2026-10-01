// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PaperBridge contributors.
/* global Zotero */
(function () {
    const i18n = Zotero.PaperBridgeI18n;
    const t = text => i18n ? i18n.t(text) : text;
    const prefix = "extensions.zotero.codexPdfBridge.";
    const get = key => Zotero.Prefs.get(prefix + key, true);
    const colors = { yellow: "#ffd400", red: "#ff6666", green: "#5fb236", blue: "#2ea8e5", purple: "#a28ae5", magenta: "#e56eee", orange: "#f19837", gray: "#aaaaaa" };
    const labels = { yellow: "黄色", red: "红色", green: "绿色", blue: "蓝色", purple: "紫色", magenta: "洋红色", orange: "橙色", gray: "灰色" };
    const defaultAnnotationRules = "默认按完整句子选取文字高亮和下划线，从句首开始，到该句结束标点为止；可以连续选择多个完整句子，不包含上一句残段或下一句开头。用户明确要求短语、术语、公式或其他片段时，按其指定边界选择。\n一个句子跨多行时保留为同一条标注；禁止按固定行数截取。先阅读原文并确定完整选段，再通过 find_pdf_text 精确定位；read_pdf 返回的一行 passage 不等于一句。\n首行和末行只覆盖实际选中文字，不能把整行框当成句子边界。匹配使用 PDF 实际提取原文，保留断词、数学字符和空白规则；解释或译文写入批注。\n应用前检查 prepare 预览的开头、结尾及相邻原文，确认没有选入下一句片段。检索失败时回查页面，不猜坐标。修复已有标注时使用原位更新能力，避免新增重复标注。";
    const defaults = { defaultColor: "yellow", importantColor: "red", imageColor: "purple", chartColor: "blue" };
    const linkChildren = ["obsidianAnnotationLinks", "obsidianImageLinks", "obsidianChartLinks"];
    const htmlNamespace = "http://www.w3.org/1999/xhtml";
    let ruleDraft = [], ruleOpen = [], originalRuleText = "", rulesChanged = false;
    function setRuleStatus(text) {
        const status = document.getElementById("codex-bridge-rules-status");
        if (status) status.textContent = text;
    }
    function parseRules(text) {
        if (!text.trim()) return [];
        // Remember the card layout separately so a rule may itself be multiline.
        try {
            const cards = JSON.parse(get("annotationRuleCards") || "null");
            if (Array.isArray(cards) && cards.every(value => typeof value === "string") && cards.join("\n\n") === text) return cards;
        } catch (_) { /* Older versions only store the plain rules text. */ }
        const separator = /\r?\n[ \t]*\r?\n/.test(text) ? /\r?\n[ \t]*\r?\n+/ : /\r?\n/;
        return text.split(separator).filter(value => value.trim());
    }
    function markRulesChanged() {
        rulesChanged = true;
        setRuleStatus(t("修改尚未保存，点击“保存规则”后生效。"));
    }
    function fitRuleInput(input) {
        input.style.height = "auto";
        if (input.scrollHeight) input.style.height = Math.min(input.scrollHeight + 2, 220) + "px";
    }
    function renderRules(focusIndex = -1) {
        const list = document.getElementById("codex-bridge-ruleCards");
        if (!list) return;
        const count = document.getElementById("codex-bridge-ruleCount");
        if (count) count.textContent = ruleDraft.length + t(" 条");
        list.replaceChildren();
        if (!ruleDraft.length) {
            const empty = document.createElementNS(htmlNamespace, "div");
            empty.className = "codex-rules-empty";
            empty.textContent = t("暂无额外规则。点击“添加规则”开始编写，或恢复默认规则。");
            list.appendChild(empty);
        }
        ruleDraft.forEach((text, index) => {
            const card = document.createElementNS(htmlNamespace, "details");
            card.className = "codex-rule-card";
            card.open = index === focusIndex || !!ruleOpen[index];
            const header = document.createElementNS(htmlNamespace, "summary");
            header.className = "codex-rule-header";
            const label = document.createElementNS(htmlNamespace, "span");
            label.className = "codex-rule-label";
            label.textContent = t("规则 ") + (index + 1);
            const preview = document.createElementNS(htmlNamespace, "span");
            preview.className = "codex-rule-preview";
            preview.textContent = text.replace(/\s+/g, " ").trim() || t("新规则，点击编辑");
            header.appendChild(label); header.appendChild(preview);
            const input = document.createElementNS(htmlNamespace, "textarea");
            input.id = "codex-bridge-rule-" + index;
            input.className = "codex-rule-input";
            input.rows = 2;
            input.maxLength = 10000;
            input.value = text;
            input.placeholder = t("在这里填写这条规则…");
            input.setAttribute("aria-label", t("编辑规则 ") + (index + 1));
            input.addEventListener("input", () => {
                ruleDraft[index] = input.value;
                preview.textContent = input.value.replace(/\s+/g, " ").trim() || t("新规则，点击编辑");
                markRulesChanged(); fitRuleInput(input);
            });
            card.addEventListener("toggle", () => {
                if (list.children[index] !== card) return;
                ruleOpen[index] = card.open;
                if (card.open) fitRuleInput(input);
            });
            const remove = document.createElementNS(htmlNamespace, "button");
            remove.type = "button";
            remove.className = "codex-rule-remove";
            remove.textContent = t("删除");
            remove.setAttribute("aria-label", t("删除规则 ") + (index + 1));
            remove.addEventListener("click", () => { ruleDraft.splice(index, 1); ruleOpen.splice(index, 1); markRulesChanged(); renderRules(); });
            const controls = document.createElementNS(htmlNamespace, "div");
            controls.className = "codex-rule-controls";
            controls.appendChild(remove);
            card.appendChild(header); card.appendChild(input); card.appendChild(controls); list.appendChild(card);
            if (card.open) fitRuleInput(input);
            if (index === focusIndex) input.focus();
        });
    }
    function refreshLinkControls(enabled) {
        for (const name of linkChildren) {
            const control = document.getElementById("codex-bridge-" + name);
            if (control) control.disabled = !enabled;
        }
    }
    function showColor(name, value) {
        const preview = document.getElementById("codex-bridge-" + name + "-swatch");
        if (!preview || !colors[value]) return;
        preview.style.backgroundColor = colors[value];
        preview.setAttribute("title", t(labels[value]) + " " + colors[value]);
        preview.setAttribute("aria-label", t(labels[value]));
    }
    function refresh() {
        const pane = document.getElementById("codex-bridge-pane");
        if (pane && i18n) i18n.apply(pane);
        const language = document.getElementById("codex-bridge-language");
        if (language && i18n) language.value = i18n.language();
        const enabled = document.getElementById("codex-bridge-enabled");
        if (!enabled) return;
        enabled.checked = !!get("enabled");
        document.getElementById("codex-bridge-write").checked = !!get("writeEnabled");
        for (const name of ["obsidianLinksEnabled", ...linkChildren]) {
            document.getElementById("codex-bridge-" + name).checked = !!get(name);
        }
        refreshLinkControls(!!get("obsidianLinksEnabled"));
        for (const [name, fallback] of Object.entries(defaults)) {
            const value = colors[get(name)] ? get(name) : fallback;
            const menu = document.getElementById("codex-bridge-" + name);
            if (menu) menu.value = value;
            showColor(name, value);
        }
        originalRuleText = typeof get("annotationRules") === "string" ? get("annotationRules") : defaultAnnotationRules;
        ruleDraft = parseRules(originalRuleText);
        ruleOpen = [];
        const section = document.getElementById("codex-bridge-ruleSection");
        if (section) section.open = false;
        rulesChanged = false;
        renderRules();
        refreshSetupStatus();
    }
    function refreshSetupStatus() {
        const configured = get("configuredVersion");
        const status = document.getElementById("codex-bridge-setup-status");
        let upgrade;
        try { upgrade = JSON.parse(get("upgradeStatus") || "null"); } catch (_) { /* Ignore obsolete status. */ }
        if (configured) status.textContent = t("已配置版本 ") + configured + t("。新版会自动升级已启用的连接；配置变更后请重启 Codex。");
        if (upgrade?.state === "failed") status.textContent = t(upgrade.message);
        if (upgrade?.state === "skipped") status.textContent = t("Codex 连接已移除、禁用或被手动调整，未自动覆盖。需要连接时请点击配置。");
        if (upgrade?.state === "updated" && upgrade.automatic) status.textContent = t("已自动升级配套程序至 ") + upgrade.version + t("，请完全退出并重新打开 Codex。");
        let saved;
        try { saved = JSON.parse(get("skillStatus") || "null"); } catch (_) { /* Ignore obsolete status. */ }
        if (saved) {
            status.textContent += t("。Skills：") + (saved.skills || []).map(skill => skill.name + (skill.state === "preserved" ? t("（保留本地修改）") : " ✓")).join(", ");
            if (saved.error) status.textContent += t("。Skill 安装失败：") + saved.error;
        }
    }
    // Scripts run before Zotero inserts the pane. The load event does not bubble.
    document.addEventListener("load", event => {
        if (event.target.id === "codex-bridge-pane") refresh();
    }, true);
    document.addEventListener("command", async event => {
        const target = event.target;
        const languageMenu = target.closest?.("menulist");
        if (target.id === "codex-bridge-language" || languageMenu?.id === "codex-bridge-language") {
            const value = target.localName === "menuitem" ? target.getAttribute("value") : target.value;
            Zotero.Prefs.set(prefix + "language", value === "en" ? "en" : "zh", true);
            if (i18n) i18n.apply(document.getElementById("codex-bridge-pane"));
            renderRules(); refreshSetupStatus();
            setRuleStatus(t(rulesChanged ? "修改尚未保存，点击“保存规则”后生效。" : "编辑、添加或删除后点击“保存规则”生效。"));
            for (const [key, fallback] of Object.entries(defaults)) showColor(key, get(key) || fallback);
            return;
        }
        if (target.id === "codex-bridge-addRule") {
            ruleDraft.push(""); ruleOpen.push(true); markRulesChanged(); renderRules(ruleDraft.length - 1); return;
        }
        if (["codex-bridge-saveRules", "codex-bridge-resetRules", "codex-bridge-clearRules"].includes(target.id)) {
            if (target.id === "codex-bridge-resetRules") { ruleDraft = t(defaultAnnotationRules).split("\n"); ruleOpen = []; }
            if (target.id === "codex-bridge-clearRules") { ruleDraft = []; ruleOpen = []; }
            if (target.id !== "codex-bridge-saveRules") { markRulesChanged(); renderRules(); return; }
            const cards = ruleDraft.filter(value => value.trim());
            const text = rulesChanged ? cards.join("\n\n") : originalRuleText;
            if (text.length > 10000) { setRuleStatus(t("全部规则合计不能超过 10000 个字符。")); return; }
            try {
                Zotero.Prefs.set(prefix + "annotationRules", text, true);
                // Keep independent cards stable across reloads, including blank lines inside a card.
                Zotero.Prefs.set(prefix + "annotationRuleCards", JSON.stringify(cards), true);
                originalRuleText = text; ruleDraft = cards; ruleOpen = []; rulesChanged = false; renderRules();
                setRuleStatus(t("已保存 ") + cards.length + t(" 条规则，后续读取和准备标注时生效。"));
            } catch (error) { setRuleStatus(t("保存失败：") + error.message); }
            return;
        }
        if (target.id === "codex-bridge-obsidianLinksEnabled") refreshLinkControls(target.checked);
        const menu = target.closest?.("menulist");
        const name = menu?.id.replace("codex-bridge-", "");
        if (Object.prototype.hasOwnProperty.call(defaults, name)) {
            showColor(name, target.localName === "menuitem" ? target.getAttribute("value") : menu.value);
        }
        if (target.id === "codex-bridge-configure") {
            const status = document.getElementById("codex-bridge-setup-status");
            target.disabled = true;
            status.textContent = t("正在部署内置程序并配置 Codex…");
            try {
                const result = await Zotero.CodexPDFBridgeInstaller.configure();
                status.textContent = t("配置成功，请重启 Codex。配置文件：") + result.config_path + (result.backup_path ? t("。原配置已备份。") : "");
                const skills = result.skills || [];
                status.textContent += t("。Skills：") + skills.map(skill => skill.name + (skill.state === "preserved" ? t("（保留本地修改）") : " ✓")).join(", ");
                if (result.skill_error) status.textContent += t("。Skill 安装失败：") + result.skill_error;
            } catch (error) {
                status.textContent = t("配置失败：") + error.message;
            } finally { target.disabled = false; }
        }
    });
    document.addEventListener("select", event => {
        const name = event.target.id?.replace("codex-bridge-", "");
        if (Object.prototype.hasOwnProperty.call(defaults, name)) showColor(name, event.target.value);
    });
    refresh();
})();
