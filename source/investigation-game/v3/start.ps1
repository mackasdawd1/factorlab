param([ValidateRange(1024,65535)][int]$Port=8879,[switch]$OpenBrowser)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'environment.ps1')
& (Join-Path $PSScriptRoot '../start.ps1') -Port $Port
$url="http://127.0.0.1:$Port/v3/"
$response=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
if ($response.StatusCode -ne 200 -or $response.Content -notmatch 'workspace.js') { throw 'This port serves an older process. Choose an unused port to preserve existing sessions.' }
Write-Output "FactorLab Research Studio: $url"
if ($OpenBrowser) { Start-Process $url -WindowStyle Hidden }
