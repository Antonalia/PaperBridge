// SPDX-License-Identifier: AGPL-3.0-or-later
/* global Zotero */
var PaperBridgeI18n = {
    language() { return Zotero.Prefs.get('extensions.zotero.codexPdfBridge.language', true) === 'en' ? 'en' : 'zh'; },
    defaultRulesEnglish: [
        'Select complete sentences for highlights and underlines, from the first word through final punctuation. Consecutive complete sentences may be combined; exclude fragments of adjacent sentences. Follow explicit requests for phrases, terms or formula fragments.',
        'Keep a sentence spanning multiple lines in one annotation. Never select by a fixed line count. Read the source and determine the complete selection before exact finding; a read_pdf passage may be only one line.',
        'Cover only selected text on the first and last lines, not the entire line. Match the PDF extraction, including hyphenation, mathematical characters and whitespace; put translations and explanations in comments.',
        'Before applying, check preview endpoints and neighboring text. Revisit the page when matching fails; do not guess coordinates. Repair existing annotations only through an actual in-place update interface, avoiding duplicates.'
    ].join('\n'),
    strings: {
        '文献桥': 'PaperBridge',
        '语言': 'Language',
        '本机 Zotero 与 Codex 的连接。当前仅开放个人文献库。': 'Connect Zotero and Codex on this computer. Personal libraries only.',
        '启用本地连接': 'Enable local bridge',
        '允许创建原生高亮、下划线、批注和论文标签': 'Allow native highlights, underlines, annotations and paper tags',
        '标注规则': 'Annotation rules',
        '点击规则展开编辑，修改后保存。': 'Expand a rule to edit it, then save your changes.',
        '标注规则列表': 'Annotation rule list',
        '＋ 添加规则': '＋ Add rule',
        '保存规则': 'Save rules',
        '恢复默认': 'Restore defaults',
        '清空': 'Clear',
        '编辑、添加或删除后点击“保存规则”生效。': 'Click Save rules after editing, adding or removing rules.',
        '规则以自然语言指导后续标注；当前任务要求优先，已有标注不自动改变。': 'Rules guide future annotations in natural language. Current task instructions take priority; existing annotations stay unchanged.',
        '标注颜色': 'Annotation colors',
        '为本插件新建的标注选择默认颜色。每条标注也可以指定自己的颜色。': 'Choose default colors for new annotations. Individual annotations may specify their own colors.',
        '默认标注颜色': 'Default annotation color',
        '重点标注颜色': 'Key annotation color',
        '图片框选颜色': 'Image region color',
        '图表框选颜色': 'Figure and table color',
        '黄色': 'Yellow', '红色': 'Red', '绿色': 'Green', '蓝色': 'Blue', '紫色': 'Purple', '洋红色': 'Magenta', '橙色': 'Orange', '灰色': 'Gray',
        '图示、图表和表格使用图表框选颜色；照片等图片使用图片框选颜色。颜色在准备标注方案时确定，更改设置后请重新准备方案。': 'Figures, charts and tables use the figure color; photos use the image color. Colors are resolved when a plan is prepared. Prepare again after changing settings.',
        'Obsidian 笔记位置': 'Obsidian note location',
        'Obsidian 仓库路径': 'Obsidian vault path',
        '例如 D:\\Obsidian\\我的笔记': 'For example D:\\Obsidian\\MyNotes',
        '例如 Zotero 或 文献/阅读笔记': 'For example Zotero or Literature/ReadingNotes',
        '新建笔记的顶层目录（相对于仓库，可留空）': 'Top folder for new notes (vault-relative; may be empty)',
        '子目录结构': 'Subfolder layout',
        '按照 Zotero 分类层级': 'Follow Zotero collection hierarchy',
        '全部放在顶层目录': 'Put all notes in the top folder',
        '导入时在所选顶层目录下建立 Zotero 的分类与子分类文件夹。无分类的文献放在顶层；多个分类时可指定分类，或使用 Zotero 当前选中的分类。': 'Imports create collection and subcollection folders beneath the top folder. Unfiled papers go in the top folder. For multiple collections, specify one or use the currently selected collection in Zotero.',
        'Obsidian 跳转链接': 'Obsidian source links',
        '导入 Obsidian 时附带 Zotero 跳转链接（总开关）': 'Include Zotero links in Obsidian imports (master switch)',
        '文字标注与注释附带跳转链接': 'Include links for text annotations and comments',
        '图片附带跳转链接': 'Include links for images',
        '图表与表格附带跳转链接': 'Include links for figures and tables',
        '总开关关闭时全部省略链接，并保留三个子开关的选择。设置用于后续通过 Codex 导入的内容，不改动已有笔记，也不控制其他导入插件。': 'The master switch omits all links while retaining the three individual choices. Settings affect future Codex imports, not existing notes or other import plugins.',
        '连接 Codex': 'Connect Codex',
        '点击下方按钮完成本机 Codex 连接配置，完成后重启 Codex 即可使用。': 'Configure the local Codex connection and install bundled skills with the button below, then restart Codex.',
        '配置 Codex': 'Configure Codex',
        '首次点击“配置 Codex”；之后会自动升级已启用的连接，升级后请重启 Codex。': 'Click Configure Codex once. Future updates upgrade enabled connections and bundled skills; restart Codex afterwards.',
        '随附 Skills': 'Bundled skills',
        '配置 Codex 时自动安装随附的 skills；升级时加入新 skill 并更新未修改的已有 skill。自己编辑过的同名 skill 会保留并提示，不会覆盖。': 'Setup installs bundled skills. Updates add new skills and refresh unchanged managed skills. Locally edited skills with the same name are preserved and reported.',
        '论文精读、重点批注、公式讲解和论文主题标签。': 'Close reading, key annotations, formula explanations and paper-level topic tags.',
        '按 Zotero 分类导入 Obsidian，并展开详细文献笔记。': 'Import into Obsidian by Zotero collection and expand detailed literature notes.',
        '界面语言不会翻译已有规则、目录名、论文标题或用户笔记。': 'Changing the interface language does not translate saved rules, folder names, paper titles or user notes.',
        '修改尚未保存，点击“保存规则”后生效。': 'Unsaved changes. Click Save rules to apply them.',
        ' 条': ' rules',
        '暂无额外规则。点击“添加规则”开始编写，或恢复默认规则。': 'No extra rules. Click Add rule to write one, or restore the defaults.',
        '规则 ': 'Rule ', '新规则，点击编辑': 'New rule; click to edit',
        '在这里填写这条规则…': 'Write this rule here…', '编辑规则 ': 'Edit rule ', '删除规则 ': 'Remove rule ', '删除': 'Remove',
        '已配置版本 ': 'Configured version ',
        '。新版会自动升级已启用的连接；配置变更后请重启 Codex。': '. Updates upgrade enabled connections. Restart Codex after configuration changes.',
        'Codex 连接已移除、禁用或被手动调整，未自动覆盖。需要连接时请点击配置。': 'The Codex connection was removed, disabled or customized and was left unchanged. Click Configure Codex if you want to connect.',
        '已自动升级配套程序至 ': 'Companion upgraded automatically to ',
        '，请完全退出并重新打开 Codex。': '. Fully quit and reopen Codex.',
        '全部规则合计不能超过 10000 个字符。': 'All rules combined must not exceed 10,000 characters.',
        '已保存 ': 'Saved ', ' 条规则，后续读取和准备标注时生效。': ' rules. They apply to future reading and annotation plans.',
        '保存失败：': 'Save failed: ',
        '正在部署内置程序并配置 Codex…': 'Deploying the companion, configuring Codex and installing skills…',
        '配置成功，请重启 Codex。配置文件：': 'Setup complete. Restart Codex. Configuration: ',
        '。原配置已备份。': '. The previous configuration was backed up.', '配置失败：': 'Setup failed: ',
        '。Skills：': '. Skills: ', '（保留本地修改）': ' (local changes preserved)', '。Skill 安装失败：': '. Skill installation failed: ',
        '当前独立程序只支持 Windows x64。': 'The bundled companion currently supports Windows x64 only.',
        '内置程序清单无效，请重新安装插件。': 'Invalid companion manifest. Reinstall the plugin.',
        '内置程序校验失败，请重新安装插件。': 'Companion checksum failed. Reinstall the plugin.',
        '不支持的插件资源地址，请使用正式 XPI 安装。': 'Unsupported plugin resource address. Install the packaged XPI.',
        '正在配置，请稍候。': 'Setup is already running. Please wait.',
        '配置程序输出异常。': 'Unexpected setup program output.',
        '配置程序未能启动或未返回结果。请确认已安装 Microsoft Visual C++ x64 运行库，并检查 Windows 是否阻止了该程序。': 'Setup could not start or returned no result. Check the Microsoft Visual C++ x64 runtime and whether Windows blocked the program.',
        'Codex 配置失败。': 'Codex setup failed.',
        '配套程序升级未完成，请在文献桥设置中重试配置。': 'The companion upgrade failed. Retry setup in PaperBridge settings.'
    },
    t(text) {
        if (this.language() !== 'en') return text;
        if (typeof text === 'string' && text.startsWith('默认按完整句子') && text.includes('禁止按固定行数截取')) return this.defaultRulesEnglish;
        return this.strings[text] || text;
    },
    originals: new WeakMap(),
    apply(root) {
        const visit = node => {
            if (node.nodeType === 3) {
                if (!node.parentNode || ['style', 'script', 'textarea'].includes(node.parentNode.localName)) return;
                if (!this.originals.has(node)) this.originals.set(node, node.nodeValue);
                const original = this.originals.get(node), key = original.trim();
                node.nodeValue = original.replace(key, this.t(key));
            } else if (node.nodeType === 1) {
                let values = this.originals.get(node);
                if (!values) {
                    values = {};
                    for (const name of ['label', 'value', 'placeholder', 'aria-label', 'title']) if (node.hasAttribute(name) && /[\u4e00-\u9fff]/.test(node.getAttribute(name))) values[name] = node.getAttribute(name);
                    this.originals.set(node, values);
                }
                for (const [name, value] of Object.entries(values)) node.setAttribute(name, this.t(value));
                for (const child of node.childNodes) visit(child);
            }
        };
        visit(root);
    }
};
