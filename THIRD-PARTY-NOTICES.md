# Third-party notices — PaperBridge 1.0.1

Project-authored code and resources: Copyright (C) 2026 PaperBridge contributors.
Project license: AGPL-3.0-or-later; see LICENSE. Upstream copyrights and licenses remain with their respective authors.

## Beaver for Zotero — reference

Native Zotero annotation API usage was studied in Beaver 0.25.3, particularly
src/services/annotations/createAnnotation.ts. This reference relationship is acknowledged;
it does not make PaperBridge an official Beaver release or claim Beaver affiliation.
Upstream: https://github.com/jlegewie/beaver-zotero
License: AGPL-3.0-or-later (upstream package metadata).
PaperBridge implements its own local protocol, configuration, preparation plans and Obsidian import workflow.
No Beaver login, cloud service, React UI, or Beaver logo is included in this XPI.

## Zotero — host API documentation/reference

Zotero runtime/API sources were consulted for lifecycle, preference panes, local endpoints and native items.
Zotero is installed separately, not included here.
Upstream: https://github.com/zotero/zotero
Copyright: Corporation for Digital Scholarship and contributors.
License: AGPL-3.0-or-later except where upstream states otherwise.

## PyMuPDF / MuPDF — bundled PDF engine

Exact versions: PyMuPDF 1.28.2 and MuPDF 1.28.2, verified from the runtime.
Copyright: Artifex Software, Inc. and upstream contributors.
License used here: AGPL v3 distribution, NOT an Artifex commercial license.
Upstreams: https://github.com/pymupdf/PyMuPDF and https://github.com/ArtifexSoftware/mupdf
Source distributions, including MuPDF thirdparty sources, are in the matching source ZIP.
Their own copyrights, exceptions and component licenses are preserved inside those archives.

## CPython, TOML Kit and PyInstaller

CPython 3.12.14: Python Software Foundation License and included third-party notices.
https://www.python.org/downloads/source/
TOML Kit 0.15.1: MIT license, upstream authors.
https://github.com/python-poetry/tomlkit
PyInstaller 6.22.3: GPL-2.0-or-later with bootloader exception; see its original COPYING and source.
https://github.com/pyinstaller/pyinstaller

## Build environment

Pinned build packages: altgraph 0.17.5, packaging 26.3, pefile 2024.8.26,
pyinstaller-hooks-contrib 2026.7, pywin32-ctypes 0.2.3 and setuptools 84.0.0.
Their source distributions and original notices are included in the source ZIP.
Build-tool licenses do not override this project's license; the PyInstaller bootloader exception is preserved.

## Corresponding source and build instructions

Distribute paperbridge-1.0.1-source.zip and SHA256SUMS.txt beside paperbridge-1.0.1.xpi.
See SOURCE-CODE.md, BUILD.md and third_party/source-manifest.json.
Original license texts are in LICENSES/ and plugin/runtime/licenses/; full dependency sources retain their notices.

## Python external libraries and Windows runtime

OpenSSL 3.5.8: Apache-2.0, OpenSSL Project contributors.
zlib 1.3.2: zlib license, Jean-loup Gailly and Mark Adler.
libffi, xz and bzip2: original component licenses in LICENSES/ and source archives.
Their exact source-version basis is recorded in third_party/source-manifest.json; see BUILD.md.
Microsoft C++ runtime DLLs are NOT included. Users install a compatible x64 runtime from Microsoft:
https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist
