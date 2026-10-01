// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 PaperBridge contributors.
/* global Zotero, Services, Components, IOUtils, ChromeUtils, APP_SHUTDOWN */
var bridgeContext;
function install() {}
function uninstall() {}
async function startup(data) {
    await Zotero.initializationPromise;
    // Zotero requires an HTTPS update_url even for manually installed local
    // plugins. Disable this add-on's background updates, leaving Zotero's
    // global update security preference untouched.
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    const addon = await AddonManager.getAddonByID(data.id);
    if (addon) addon.applyBackgroundUpdates = AddonManager.AUTOUPDATE_DISABLE;
    const root = data.rootURI || data.resourceURI.spec;
    bridgeContext = { Zotero, Services, Components, IOUtils, PathUtils, ChromeUtils, TextEncoder, atob, Blob };
    Services.scriptloader.loadSubScript(root + "content/installer.js", bridgeContext);
    bridgeContext.CodexBridgeInstaller.initialize(root);
    Zotero.CodexPDFBridgeInstaller = bridgeContext.CodexBridgeInstaller;
    Services.scriptloader.loadSubScript(root + "content/metadata.js", bridgeContext);
    Services.scriptloader.loadSubScript(root + "content/bridge.js", bridgeContext);
    await bridgeContext.CodexZoteroBridge.start(root);
}
async function shutdown() {
    if (bridgeContext) await bridgeContext.CodexZoteroBridge.stop();
    if (bridgeContext && Zotero.CodexPDFBridgeInstaller === bridgeContext.CodexBridgeInstaller) delete Zotero.CodexPDFBridgeInstaller;
    bridgeContext = undefined;
}
