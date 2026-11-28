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
    $icon = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\assets\favicon.ico'))
    $shortcut.IconLocation = "$icon,0"
    $shortcut.Description = 'NijiEhon website administration'
    $shortcut.Save()
    Write-Output $shortcutPath
    return
}

$adminPort = if ($env:NIJIEHON_ADMIN_PORT) { [int]$env:NIJIEHON_ADMIN_PORT } else { 5621 }
$url = "http://127.0.0.1:$adminPort/"

function Test-Admin {
    try {
        $result = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1
        return $result.Content -match 'id="generate"'
    }
    catch { return $false }
}

try {
    $locations = @(${env:ProgramFiles(x86)}, $env:ProgramFiles, $env:LOCALAPPDATA) | Where-Object { $_ }
    $browser = foreach ($executable in 'Microsoft\Edge\Application\msedge.exe', 'Google\Chrome\Application\chrome.exe') {
        foreach ($location in $locations) {
            $candidate = Join-Path $location $executable
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { $candidate }
        }
    }
    $appBrowser = $browser | Select-Object -First 1
    if (-not $appBrowser) { throw 'Install Microsoft Edge or Google Chrome to open the desktop window.' }

    if (-not (Test-Admin)) {
        $node = Get-Command node.exe -ErrorAction SilentlyContinue
        if (-not $node) { throw 'Install Node.js 22 LTS or later to run NijiEhon Admin.' }
        $server = Start-Process -FilePath $node.Source -ArgumentList 'server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
        for ($i = 0; $i -lt 30; $i++) {
            if (Test-Admin) { break }
            if ($server.HasExited) { throw 'Could not start the admin server. Run node tools/admin/server.mjs for details.' }
            Start-Sleep -Milliseconds 150
        }
        if (-not (Test-Admin)) { throw 'The admin server did not respond. Run node tools/admin/server.mjs for details.' }
    }

    Start-Process -FilePath $appBrowser -ArgumentList "--app=$url", '--window-size=1500,960'
}
catch {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($_.Exception.Message, 'NijiEhon Admin') | Out-Null
    exit 1
}
