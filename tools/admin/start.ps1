param([switch]$CreateShortcut)

$ErrorActionPreference = 'Stop'

if ($CreateShortcut) {
    $desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
    if (-not (Test-Path -LiteralPath $desktop -PathType Container)) { throw 'Windows Desktop folder is unavailable.' }
    $shortcutPath = Join-Path $desktop "NijiEhon $([char]0x540E)$([char]0x53F0).lnk"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $PSHOME 'powershell.exe'
    $shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $PSCommandPath
    $shortcut.WorkingDirectory = $PSScriptRoot
    $shortcut.IconLocation = "$env:SystemRoot\System32\imageres.dll,14"
    $shortcut.Description = 'NijiEhon website administration'
    $shortcut.Save()
    Write-Output $shortcutPath
    return
}

$node = (Get-Command node.exe).Source
$adminPort = if ($env:NIJIEHON_ADMIN_PORT) { [int]$env:NIJIEHON_ADMIN_PORT } else { 5621 }
$url = "http://127.0.0.1:$adminPort/"

function Test-Admin {
    try {
        $result = Invoke-RestMethod -Uri ($url + 'api/state') -TimeoutSec 1
        return $null -ne $result.revision
    }
    catch { return $false }
}

if (-not (Test-Admin)) {
    $server = Start-Process -FilePath $node -ArgumentList 'server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
    for ($i = 0; $i -lt 30; $i++) {
        if (Test-Admin) { break }
        if ($server.HasExited) { throw 'Could not start the admin server. Run node tools/admin/server.mjs for details.' }
        Start-Sleep -Milliseconds 150
    }
    if (-not (Test-Admin)) { throw 'The admin server did not respond. Run node tools/admin/server.mjs for details.' }
}
Start-Process $url
