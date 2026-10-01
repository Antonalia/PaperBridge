// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PaperBridge contributors.
/* global Zotero, Services, Components, IOUtils, ChromeUtils, APP_SHUTDOWN */
var bridgeContext;
function install() {}
function uninstall() {}
async function startup(data) {
    await Zotero.initializationPromise;
    // Zotero owns update checks and the user's Default/On/Off preference.
    const root = data.rootURI || data.resourceURI.spec;
    bridgeContext = { Zotero, Services, Components, IOUtils, PathUtils, ChromeUtils, TextEncoder, atob, Blob };
    Services.scriptloader.loadSubScript(root + "content/i18n.js", bridgeContext);
    Zotero.PaperBridgeI18n = bridgeContext.PaperBridgeI18n;
    Services.scriptloader.loadSubScript(root + "content/installer.js", bridgeContext);
    bridgeContext.CodexBridgeInstaller.initialize(root);
    Zotero.CodexPDFBridgeInstaller = bridgeContext.CodexBridgeInstaller;
    Services.scriptloader.loadSubScript(root + "content/metadata.js", bridgeContext);
    Services.scriptloader.loadSubScript(root + "content/bridge.js", bridgeContext);
    await bridgeContext.CodexZoteroBridge.start(root);
    await bridgeContext.CodexBridgeInstaller.upgradeConfigured(data.version);
}
async function shutdown() {
    if (bridgeContext) await bridgeContext.CodexZoteroBridge.stop();
    if (bridgeContext && Zotero.CodexPDFBridgeInstaller === bridgeContext.CodexBridgeInstaller) delete Zotero.CodexPDFBridgeInstaller;
    if (bridgeContext && Zotero.PaperBridgeI18n === bridgeContext.PaperBridgeI18n) delete Zotero.PaperBridgeI18n;
    bridgeContext = undefined;
}
