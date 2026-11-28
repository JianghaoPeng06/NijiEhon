$ErrorActionPreference = 'Stop'
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
