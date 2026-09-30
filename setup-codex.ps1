# SPDX-License-Identifier: AGPL-3.0-or-later
[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$Port = 23119,
    [string]$PythonPath,
    [switch]$ConfigureOnly
)
$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Node.js 20+ is required. Install Node.js, then run this script again.' }
$codexCommand = Get-Command codex -ErrorAction SilentlyContinue
if (-not $codexCommand) { throw 'Codex CLI was not found. Use the manual MCP configuration in README.md.' }
if (-not $PythonPath) {
    $bundledPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
    if (Test-Path -LiteralPath $bundledPython) { $PythonPath = $bundledPython }
    else {
        $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
        if (-not $pythonCommand) { throw 'Python 3.11+ is required. Supply -PythonPath with its full path.' }
        $PythonPath = $pythonCommand.Source
    }
}
if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) { throw 'PythonPath does not exist.' }
$configPath = Join-Path $projectPath 'bridge-config.json'
if (-not $ConfigureOnly) {
    # Read the token locally; do not put it in command arguments or print it.
    $localToken = (Get-Clipboard -Raw).Trim()
    if ($localToken -notmatch '^[a-f0-9]{64}$') {
        throw 'Copy the connection token in Zotero Settings > 文献桥 · PaperBridge, then run this script again.'
    }
    $localConfig = @{ token = $localToken; port = $Port; python = $PythonPath }
    [System.IO.File]::WriteAllText($configPath, ($localConfig | ConvertTo-Json), $utf8)
    # This per-user secret stays on this computer. Only the current user receives
    # explicit file access; the containing output directory is unchanged.
    $currentSID = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $configPath /inheritance:r /grant:r "*$($currentSID):(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict access to bridge-config.json.' }
    $localToken = $null
    Write-Host 'Local token saved. No account login is required.'
}
& $codexCommand.Source mcp add zotero_local -- $nodeCommand.Source (Join-Path $projectPath 'server.mjs')
if ($LASTEXITCODE -ne 0) {
    # Older CLI builds do not accept desktop's service_tier="default".
    # The override is only for this configuration command, not a model run.
    & $codexCommand.Source -c 'service_tier="fast"' mcp add zotero_local -- $nodeCommand.Source (Join-Path $projectPath 'server.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Codex MCP configuration failed.' }
}
Write-Host 'MCP configuration saved. Restart Codex and keep Zotero running.'
