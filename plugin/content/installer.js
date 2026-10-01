// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PaperBridge contributors.
/* global Zotero, Services, Components, IOUtils, PathUtils, ChromeUtils */
var CodexBridgeInstaller = {
    root: null,
    busy: false,
    initialize(root) { this.root = root; },
    async digest(file) {
        const bytes = await IOUtils.read(file);
        const hash = Components.classes["@mozilla.org/security/hash;1"].createInstance(Components.interfaces.nsICryptoHash);
        hash.init(hash.SHA256);
        hash.update(bytes, bytes.length);
        return Array.from(hash.finish(false), char => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    },
    async deploy() {
        if (!Zotero.isWin) throw new Error("当前独立程序只支持 Windows x64。");
        // Packaged jar: resources have no username/password URI fields. Zotero
        // 10's HTTP helper assumes those fields, so use its local-resource reader.
        const resource = this.root + "runtime/manifest.json";
        const manifest = JSON.parse(Zotero.File.getResourceAsync
            ? await Zotero.File.getResourceAsync(resource) : Zotero.File.getResource(resource));
        if (manifest.platform !== "windows-x64" || !/^\d+\.\d+\.\d+$/.test(manifest.version)
            || manifest.filename !== "codex-zotero-mcp.exe" || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error("内置程序清单无效，请重新安装插件。");
        const directory = PathUtils.join(Zotero.Profile.dir, "codex-pdf-bridge", manifest.version);
        await IOUtils.makeDirectory(directory, { createAncestors: true, ignoreExisting: true });
        const executable = PathUtils.join(directory, manifest.filename);
        if (!await IOUtils.exists(executable) || await this.digest(executable) !== manifest.sha256) {
            const temporary = executable + ".tmp";
            const uri = Services.io.newURI(this.root + "runtime/" + manifest.filename);
            if (uri.scheme === "jar") {
                const jar = uri.QueryInterface(Components.interfaces.nsIJARURI);
                const reader = Components.classes["@mozilla.org/libjar/zip-reader;1"].createInstance(Components.interfaces.nsIZipReader);
                reader.open(jar.JARFile.QueryInterface(Components.interfaces.nsIFileURL).file);
                try {
                    if (await IOUtils.exists(temporary)) await IOUtils.remove(temporary);
                    reader.extract(jar.JAREntry, Zotero.File.pathToFile(temporary));
                } finally { reader.close(); }
            } else if (uri.scheme === "file") {
                await IOUtils.copy(uri.QueryInterface(Components.interfaces.nsIFileURL).file.path, temporary);
            } else {
                throw new Error("不支持的插件资源地址，请使用正式 XPI 安装。");
            }
            if (await this.digest(temporary) !== manifest.sha256) {
                await IOUtils.remove(temporary);
                throw new Error("内置程序校验失败，请重新安装插件。");
            }
            await IOUtils.move(temporary, executable, { noOverwrite: false });
        }
        return { executable, config: PathUtils.join(Zotero.Profile.dir, "codex-pdf-bridge", "bridge-config.json") };
    },
    async upgradeConfigured(version) {
        const prefix = "extensions.zotero.codexPdfBridge.";
        const configured = Zotero.Prefs.get(prefix + "configuredVersion", true);
        if (!configured || configured === version) return;
        try {
            await this.configure({ upgradeExisting: true });
        } catch (error) {
            // A companion upgrade must not prevent Zotero or the bridge from starting.
            Zotero.Prefs.set(prefix + "upgradeStatus", JSON.stringify({ state: "failed", version,
                message: "配套程序升级未完成，请在文献桥设置中重试配置。" }), true);
            Zotero.logError(error);
        }
    },
    async configure({ upgradeExisting = false } = {}) {
        if (this.busy) throw new Error("正在配置，请稍候。");
        this.busy = true;
        try {
            const paths = await this.deploy();
            const { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs");
            const prefix = "extensions.zotero.codexPdfBridge.";
            const token = Zotero.Prefs.get(prefix + "token", true);
            const port = Zotero.Prefs.get("httpServer.port") || 23119;
            // Send secrets over stdin; never put them in process arguments or logs.
            const process = await Subprocess.call({ command: paths.executable,
                arguments: [upgradeExisting ? "--upgrade-existing" : "--configure", "--config", paths.config], stderr: "pipe" });
            await process.stdin.write(JSON.stringify({ token, port }));
            process.stdin.close();
            let output = "", chunk;
            const stderr = (async () => { while (await process.stderr.readString()) { /* drain without logging private data */ } })();
            while (chunk = await process.stdout.readString()) {
                output += chunk;
                if (output.length > 65536) { process.kill(); throw new Error("配置程序输出异常。"); }
            }
            await stderr;
            const { exitCode } = await process.wait();
            let result;
            try { result = JSON.parse(output); } catch (_) { throw new Error("配置程序未能启动或未返回结果。请确认已安装 Microsoft Visual C++ x64 运行库，并检查 Windows 是否阻止了该程序。"); }
            if (exitCode || !result.ok) throw new Error(result.error || "Codex 配置失败。");
            if (!result.skipped) Zotero.Prefs.set(prefix + "configuredVersion", result.version, true);
            Zotero.Prefs.set(prefix + "upgradeStatus", JSON.stringify({ state: result.skipped ? "skipped" : "updated",
                version: result.version, automatic: upgradeExisting, reason: result.reason || null }), true);
            return result;
        } finally { this.busy = false; }
    }
};
