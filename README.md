# 文献桥 · PaperBridge

把 Zotero 中的论文交给 Codex 阅读、标注，再把标注按 Zotero 分类整理到 Obsidian。PaperBridge 是本机运行的社区插件，当前正式版为 **1.0.2**。

## 从下载到第一篇笔记

1. **准备软件。** 使用 Windows x64、Zotero 7–11 和 Codex。要导入笔记，还需已有 Obsidian 仓库。插件内置所需的 PDF 处理程序，普通用户不用安装 Python、Node.js 或 C++ 编译器。Zotero 7–11 是插件清单允许的范围，尚未逐一完成实机验证。
2. **安装插件。** 在 [GitHub Releases](https://github.com/Antonalia/PaperBridge/releases/latest) 下载 `paperbridge-1.0.2.xpi`。打开 Zotero，依次选择“工具 → 插件 → 齿轮 → 从文件安装插件”，选中 XPI，并按提示重启 Zotero。安装时不需要下载源码 ZIP。
3. **连接 Codex。** 在 Zotero 设置侧栏打开“文献桥”，勾选“启用本地连接”，首次点击“配置 Codex”。看到配置成功后，**完全退出并重新打开 Codex**。使用期间保持 Zotero 运行。以后插件升级会自动更新仍启用的已有连接，按提示重启 Codex 即可；自动配置失败时可再次点击配置重试。
4. **准备论文。** 将论文条目及 PDF 放进 Zotero 个人库；建议放入相应分类，例如“具身智能”。在 Codex 聊天中说：“用 Zotero 查找《论文题名》，读 PDF，并说明方法和实验结果。”Codex 会通过本地 Bridge 检索条目、读取原文。群组库目前不支持。
5. **需要标注时打开写入。** 在“文献桥”设置中勾选“允许创建原生高亮、下划线和批注”。随后可以说：“先检查这篇论文已有的标注，给关键句补充高亮和中文批注。”Codex 会先生成可检查的标注方案，再写入 Zotero。高亮是 Zotero 原生标注，PDF 原文件不会被改写。
6. **设置 Obsidian 位置。** 在同一设置页填入 Obsidian 仓库的完整路径（例如 `D:\Obsidian\我的笔记`），顶层目录可填 `文献笔记`，子目录结构选“按照 Zotero 分类层级”。这样“具身智能”分类下的论文会进入 `文献笔记/具身智能/`。如果论文属于多个分类，导入时应明确指定所用分类。按需要设置文字、图片及图表的 Zotero 跳转链接开关。
7. **导入并核对。** 在 Codex 中说：“把这篇论文的 Zotero 标注导入 Obsidian，并详细解释模型结构、公式中每个变量、实验结果和结论。”Bridge 会先给出目标路径与导入预览，再写入所设仓库；已有笔记在修改前会备份，重复导入不会重复添加同一批标注。最后检查笔记是否位于预期的分类目录，图片和 Zotero 链接是否可用。

只想快速确认连接时，在 Codex 中说“检查 Zotero 文献桥状态”。如果找不到论文，先确认 Zotero 正在运行、条目在个人库中且附有可读取的 PDF。扫描版 PDF 可能需要先做 OCR，才能精确定位文字。

## 可选：论文精读 skill

源码包里的 `skills/zotero-literature-notes/` 提供更细的论文精读流程：核对原文、补充缺失标注、按分类导入、逐式解释公式变量，并区分论文数据与教学数字例子。XPI 内也带有该 skill 的文件，但**不会自动安装到 Codex**。需要使用时，把该文件夹复制到自己的 Codex skills 目录，然后在聊天中输入 `$zotero-literature-notes` 和论文题名。安装方法与完整规则见 [SKILL.md](skills/zotero-literature-notes/SKILL.md)。

## 开启自动更新（从 1.0.2 起）

1. **旧版先手动升级一次。** 1.0.1 和早期版本没有有效的在线更新地址，需先下载 `paperbridge-1.0.2.xpi` 覆盖安装。以后不必每次手动下载。
2. **开启 Zotero 的更新开关。** 在“工具 → 插件”中打开文献桥详情，把“Allow automatic updates”设为 **On**。Default 跟随 Zotero 的全局设置，Off 停止后台更新。旧版曾强制关闭此开关，所以旧用户升级后需手动选择 On；新版不会再重置你的选择。
3. **检查更新。** 点击“Check for Updates”可立即检查。后续由 Zotero 检查 GitHub Release 的更新清单，并按版本及兼容范围下载 XPI、核验 SHA-256 和安装。网络不可达时可继续手动安装。
4. **重启 Codex。** 对已经配置且仍启用的 `zotero_local`，插件启动后自动部署新版内置程序、备份配置并更新程序路径，保留其他 MCP 和该连接的附加设置。首次配置仍需手动点击；已删除、禁用或修改程序参数的连接不会被自动重新启用或覆盖。升级完成后到文献桥设置查看状态，并完全退出再打开 Codex。失败时保留旧路径，点击“配置 Codex”重试。

自动更新使用公开 GitHub HTTPS 地址，只检查版本和下载插件，不向更新源上传个人文献、标注或本机连接密钥。

## 旧版升级：修复 Zotero 同步报错

如果你使用过 1.0.0 或早期本地版，并遇到 `relations values currently must be Zotero item URIs`、条目上传返回 400，或随后出现 `Made no progress during upload`，请按下面的步骤升级。

1. 从 [Releases](https://github.com/Antonalia/PaperBridge/releases/latest) 下载当前版本 XPI，在 Zotero 中通过“从文件安装插件”覆盖安装，随后重启 Zotero。插件 ID 沿用旧版，设置会保留。
2. 新版首次启动时会检查旧版写入的两类内部关联值：`urn:codex-pdf-bridge:` 和 `urn:codex-zotero:content-kind:`。先保存本地备份，再将这些信息迁移到本地元数据，清理导致云端校验失败的关联值。标注文字、评论、颜色、位置和有效的 Zotero 条目关联会保留。
3. 已配置的有效连接会自动更新配套程序。若设置页显示失败或尚未配置，在“设置 → 文献桥”中点击“配置 Codex”，然后完全退出并重新打开 Codex。
4. 在 Zotero 中重新执行同步，核对本机的同步结果。迁移完成不等于已通过云端同步；如果还有错误，保留新的错误信息以便定位。

本地元数据和迁移备份放在 **Zotero 数据目录下的 `paperbridge/`**，不是插件安装目录。可在 Zotero 的高级设置中查看数据目录位置。该目录可能含有个人标注信息，请保留在自己的设备中。仅禁用旧版插件不会清理已经写入的非法关联。

1.0.2 包含 1.0.1 的同步修复；不要删除本地元数据或迁移备份来解决更新问题。

## 常见问题与文件说明

- **配置程序无法启动：** Windows 可能缺少兼容的 Microsoft Visual C++ x64 运行库。请从[微软官方页面](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)安装；已经装好则无需重复安装。程序未作商业代码签名。
- **连不上或看不到新工具：** 确认 Zotero 在运行、本地连接已启用，再完全退出并打开 Codex；回到设置页查看“配置 Codex”的状态信息。
- **笔记位置不对：** 核对仓库路径、顶层目录、子目录结构和论文在 Zotero 中的完整分类层级。无分类论文会放在顶层目录下。
- **下载哪个文件：** 普通用户首次只下载 `paperbridge-1.0.2.xpi`。`paperbridge-1.0.2-source.zip` 是一个完整源码包，供审查和自行构建；`SHA256SUMS.txt` 用于校验下载文件；`updates.json` 供 Zotero 自动读取，用户无需安装它。GitHub 自动生成的“Source code (zip)”不包含本发行附带的第三方依赖源码，需要完整对应源码时请下载带版本号的源码包。

## 隐私、许可与开发

Bridge 在本机通过带密钥的 `127.0.0.1` 连接 Zotero 与 Codex。Codex 对论文内容的后续处理取决于 Codex/OpenAI 的产品设置；本地连接不等于模型完全离线。详见 [PRIVACY.md](PRIVACY.md)。

项目采用 AGPL-3.0-or-later，见 [LICENSE](LICENSE)。完整源码与第三方许可见 [SOURCE-CODE.md](SOURCE-CODE.md) 和 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)；自行构建步骤见 [BUILD.md](BUILD.md)。PaperBridge 是独立社区项目，与 Zotero、OpenAI 或 Beaver 官方没有隶属或背书关系。
