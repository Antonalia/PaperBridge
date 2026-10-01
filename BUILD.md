# 构建 1.0.1

环境：Windows x64、CPython 3.12.14，PyMuPDF/MuPDF 1.28.2。插件与 MCP 均为 1.0.1。
解压源码 ZIP，在 paperbridge-1.0.1 目录打开 PowerShell：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe --version
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-build.txt
.\.venv\Scripts\python.exe tools/build_portable.py
node tests/test_relations.mjs
.\.venv\Scripts\python.exe tests/test_release.py
.\.venv\Scripts\python.exe tools/build.py
```

Python 应显示 3.12.14；使用其他版本会停止。输出在 dist/，包含 XPI、完整源码 ZIP 和 SHA256SUMS.txt。
打包检查依赖源归档、版本和程序哈希。构建不连接个人 Zotero，也不改写 Codex 配置。
未承诺字节级可复现，工具链、时间戳等可能影响最终文件哈希。

third_party/source-manifest.json 记录依赖源码的精确地址、版本、文件名和 SHA-256。
源归档附在 third_party/sources/，保留原版权和许可。
MuPDF 源码包括 thirdparty 目录；从依赖源码重建 PyMuPDF，需阅读其 setup.py，
设置 PYMUPDF_SETUP_MUPDF_BUILD 指向解压后的匹配 MuPDF 源树，使用相应 Visual Studio C++ 工具链。
正常构建本插件使用固定官方 wheel；该 wheel 不代替附带的完整依赖源码。
CPython 源树 PCbuild/ 包含 Windows 构建及外部依赖获取脚本。
Node MCP 入口 server.mjs 只使用 Node.js 内置模块，不需 npm 依赖。
标注迁移与失败重试测试使用 Node.js 20 或更新版本；测试使用模拟库，不接触个人 Zotero。

## Python 的外部组件与系统运行库

发布环境实际使用 OpenSSL 3.5.8、zlib 1.3.2，它们的完整源归档与原始许可也随源码 ZIP 提供。
libffi 3.4.4、xz 5.2.5、bzip2 1.0.8 的源归档来自 CPython 的 source-deps，版本依据上游 PCbuild/get_externals.bat；
DLL 未提供可直接读取的对应版本，因此索引保留这一来源依据，不冒充独立二进制版本鉴定。
CPython 源树脚本的默认 OpenSSL/zlib 版本与当前发布环境不同；若重建解释器，应使用索引记录的实际源版本。
本项目构建依赖一个安装好的 CPython 3.12.14，不宣称该源码 ZIP 的默认 CPython 构建参数可逐字重现开发运行环境。

Microsoft C++ 系统运行库不打包进 XPI，不以本项目 AGPL 许可证重新授权。
构建脚本会从 PyInstaller 二进制清单排除 VCRUNTIME140.dll、VCRUNTIME140_1.dll 和 MSVCP140.dll。
运行与测试机器需预先从微软官方安装兼容 x64 运行库，测试程序只使用 Windows 系统搜索路径。
