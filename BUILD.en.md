# Build 1.0.3

[简体中文](BUILD.md) | **English**

Build environment: Windows x64, CPython 3.12.14, PyMuPDF/MuPDF 1.28.2. Plugin and MCP version: 1.0.3. Extract the versioned source ZIP and run PowerShell in its project directory:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe --version
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-build.txt
.\.venv\Scripts\python.exe tools/build_portable.py
node tests/test_relations.mjs
node tests/test_updates.mjs
node tests/test_item_tags.mjs
node tests/test_i18n.mjs
.\.venv\Scripts\python.exe tests/test_updates.py
.\.venv\Scripts\python.exe tests/test_item_tags.py
.\.venv\Scripts\python.exe tests/test_skills.py
.\.venv\Scripts\python.exe tests/test_release.py
.\.venv\Scripts\python.exe tools/build.py
.\.venv\Scripts\python.exe tests/test_updates.py --artifacts
```

Python must report 3.12.14; other versions stop the build. `dist/` receives the XPI, complete source ZIP, `SHA256SUMS.txt` and `updates.json`. Packaging verifies dependency source archives, versions and executable hashes. Build/test scripts use disposable fixtures and do not connect to a personal Zotero library or modify personal Codex configuration. Byte-for-byte reproducibility is not promised; toolchains and timestamps can change hashes.

`third_party/source-manifest.json` records each dependency's exact source location and SHA-256. Original licenses accompany the archives under `third_party/sources/`. MuPDF source includes its `thirdparty` directory. To rebuild PyMuPDF from dependency source, read upstream `setup.py`, set `PYMUPDF_SETUP_MUPDF_BUILD` to the matching extracted MuPDF tree and use the required Visual Studio C++ toolchain. The ordinary build uses pinned official wheels; wheels do not replace the included source archives. CPython's `PCbuild/` contains Windows build and external-dependency scripts.

The Node MCP entrypoint uses Node.js built-in modules only. Node.js 20 or later is needed for the JavaScript tests. The Windows companion embeds PDF dependencies and all `skills/` folders; future skills require no installer code changes. Each skill needs `SKILL.md`; optional `SKILL.en.md` and `agents/openai.en.yaml` provide English entrypoints. The skill installer discovers folders, hashes managed files and preserves local edits. Tests exercise first installation, updates, future additions, conflicts and language selection using temporary directories.

## Release and automatic updates

1. Increment plugin, package, MCP and bridge versions; rebuild the companion and run checks.
2. Create a matching `vVERSION` Git tag. Create a GitHub release draft and upload all four generated artifacts: XPI, complete source ZIP, checksum file and update feed.
3. Publish only after uploads and hashes are verified. Mark the completed stable release as Latest. Do not make an incomplete draft or prerelease the update source.
4. Verify the feed's version, compatibility range, fixed-version download URL and XPI hash against the actual attachment. The build generates the feed from the final XPI; do not hand-edit hashes or modify the XPI afterwards.

The stable feed URL is `https://github.com/Antonalia/PaperBridge/releases/latest/download/updates.json`. Changing the repository or feed address can break installed clients. The online feed is not embedded inside the XPI, avoiding a circular hash dependency. `tools/build_local.py --output <directory>` creates a local development XPI without an update feed or publication.

## Python external components and Windows runtime

The release environment uses OpenSSL 3.5.8 and zlib 1.3.2; their source archives and original licenses accompany the release. libffi 3.4.4, xz 5.2.5 and bzip2 1.0.8 archives come from CPython's source dependencies, based on upstream `PCbuild/get_externals.bat`. The DLLs do not expose independent version information, so the manifest states this source basis rather than claiming binary version verification. CPython's default scripts may use different OpenSSL/zlib versions; consult the actual manifest for a source rebuild. The project uses an installed CPython 3.12.14 and does not claim that the archived defaults reproduce every build-environment detail.

Microsoft C++ runtime DLLs are system prerequisites, not bundled or relicensed under AGPL. The build excludes `VCRUNTIME140.dll`, `VCRUNTIME140_1.dll` and `MSVCP140.dll` from the PyInstaller binary list. Users install a compatible x64 runtime from Microsoft. Packaged tests use only the Windows system search path.
