# 本地论文自动标签

**简体中文** | [English](ITEM-TAGS.en.md)

新增 `zotero_get_item_tags`、`zotero_prepare_item_tags`、`zotero_apply_item_tags`。
`item_id` 接受搜索/选中返回的个人库文献或 PDF ID；PDF 解析到父条目，无需下载 PDF。
独立 PDF、笔记、批注、垃圾箱与非个人库条目不接受。

读取论文后由调用者根据实际内容生成标签，先读取已有标签并复用用户词汇。
prepare 返回 additions、already_present 和 60 分钟的 plan_id，不写库。
apply 使用现有写入开关，只追加缺失的 Zotero 自动标签（type 1）。
已有标签及类型保留。尚有新增标签时，已有标签快照变化会拒绝旧计划；全部已存在时安全返回。
同一计划可重试；过期或 MCP 重启后重新 prepare。apply 后调用 get 回读验证。

验证：`node tests/test_item_tags.mjs`、`.venv/Scripts/python.exe tests/test_item_tags.py`。
本地安装包：先构建内置程序，再运行 `tools/build_local.py --output <目录>`。
该脚本不生成更新清单、不推送、不发布，保留正式版本号。
安装 XPI 后在文献桥设置点击“配置 Codex”，再重启或重新加载 Codex MCP。
本地包的依赖完整源代码仍位于仓库 `third_party/sources/`；公开分发请使用正式源码配套构建流程。
