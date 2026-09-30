# 文献桥 · PaperBridge

把 Zotero 中的论文交给 Codex 阅读、标注，再把标注按 Zotero 分类整理到 Obsidian。PaperBridge 是本机运行的社区插件，当前正式版为 **1.0.0**。

## 从下载到第一篇笔记

1. **准备软件。** 使用 Windows x64、Zotero 7–11 和 Codex。要导入笔记，还需已有 Obsidian 仓库。插件内置所需的 PDF 处理程序，普通用户不用安装 Python、Node.js 或 C++ 编译器。Zotero 7–11 是插件清单允许的范围，尚未逐一完成实机验证。
2. **安装插件。** 在 [GitHub Releases](https://github.com/Antonalia/PaperBridge/releases/latest) 下载 `paperbridge-1.0.0.xpi`。打开 Zotero，依次选择“工具 → 插件 → 齿轮 → 从文件安装插件”，选中 XPI，并按提示重启 Zotero。安装时不需要下载源码 ZIP。
3. **连接 Codex。** 在 Zotero 设置侧栏打开“文献桥”，勾选“启用本地连接”，点击“配置 Codex”。看到配置成功后，**完全退出并重新打开 Codex**。使用期间保持 Zotero 运行。首次配置和每次升级后都要再点一次“配置 Codex”。
4. **准备论文。** 将论文条目及 PDF 放进 Zotero 个人库；建议放入相应分类，例如“具身智能”。在 Codex 聊天中说：“用 Zotero 查找《论文题名》，读 PDF，并说明方法和实验结果。”Codex 会通过本地 Bridge 检索条目、读取原文。群组库目前不支持。
5. **需要标注时打开写入。** 在“文献桥”设置中勾选“允许创建原生高亮、下划线和批注”。随后可以说：“先检查这篇论文已有的标注，给关键句补充高亮和中文批注。”Codex 会先生成可检查的标注方案，再写入 Zotero。高亮是 Zotero 原生标注，PDF 原文件不会被改写。
6. **设置 Obsidian 位置。** 在同一设置页填入 Obsidian 仓库的完整路径（例如 `D:\Obsidian\我的笔记`），顶层目录可填 `文献笔记`，子目录结构选“按照 Zotero 分类层级”。这样“具身智能”分类下的论文会进入 `文献笔记/具身智能/`。如果论文属于多个分类，导入时应明确指定所用分类。按需要设置文字、图片及图表的 Zotero 跳转链接开关。
7. **导入并核对。** 在 Codex 中说：“把这篇论文的 Zotero 标注导入 Obsidian，并详细解释模型结构、公式中每个变量、实验结果和结论。”Bridge 会先给出目标路径与导入预览，再写入所设仓库；已有笔记在修改前会备份，重复导入不会重复添加同一批标注。最后检查笔记是否位于预期的分类目录，图片和 Zotero 链接是否可用。

只想快速确认连接时，在 Codex 中说“检查 Zotero 文献桥状态”。如果找不到论文，先确认 Zotero 正在运行、条目在个人库中且附有可读取的 PDF。扫描版 PDF 可能需要先做 OCR，才能精确定位文字。

## 可选：论文精读 skill

源码包里的 `skills/zotero-literature-notes/` 提供更细的论文精读流程：核对原文、补充缺失标注、按分类导入、逐式解释公式变量，并区分论文数据与教学数字例子。XPI 内也带有该 skill 的文件，但**不会自动安装到 Codex**。需要使用时，把该文件夹复制到自己的 Codex skills 目录，然后在聊天中输入 `$zotero-literature-notes` 和论文题名。安装方法与完整规则见 [SKILL.md](skills/zotero-literature-notes/SKILL.md)。

## 升级、常见问题与文件说明

- **从旧版升级：** 直接安装新的 XPI。插件 ID 保持不变，已有 Zotero 标注不受影响；升级后重新点击“配置 Codex”，并重启 Codex。当前是手动更新。
- **配置程序无法启动：** Windows 可能缺少兼容的 Microsoft Visual C++ x64 运行库。请从[微软官方页面](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)安装；已经装好则无需重复安装。程序未作商业代码签名。
- **连不上或看不到新工具：** 确认 Zotero 在运行、本地连接已启用，再完全退出并打开 Codex；回到设置页查看“配置 Codex”的状态信息。
- **笔记位置不对：** 核对仓库路径、顶层目录、子目录结构和论文在 Zotero 中的完整分类层级。无分类论文会放在顶层目录下。
- **下载哪个文件：** 普通用户只下载 `paperbridge-1.0.0.xpi`。`paperbridge-1.0.0-source.zip` 是一个完整源码包，供审查和自行构建；`SHA256SUMS.txt` 用于校验下载文件。GitHub 自动生成的“Source code (zip)”不包含本发行附带的第三方依赖源码，需要完整对应源码时请下载带版本号的源码包。

## 隐私、许可与开发

Bridge 在本机通过带密钥的 `127.0.0.1` 连接 Zotero 与 Codex。Codex 对论文内容的后续处理取决于 Codex/OpenAI 的产品设置；本地连接不等于模型完全离线。详见 [PRIVACY.md](PRIVACY.md)。

项目采用 AGPL-3.0-or-later，见 [LICENSE](LICENSE)。完整源码与第三方许可见 [SOURCE-CODE.md](SOURCE-CODE.md) 和 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)；自行构建步骤见 [BUILD.md](BUILD.md)。PaperBridge 是独立社区项目，与 Zotero、OpenAI 或 Beaver 官方没有隶属或背书关系。
