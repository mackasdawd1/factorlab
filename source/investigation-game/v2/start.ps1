param([ValidateRange(1024,65535)][int]$Port=8878,[switch]$OpenBrowser)
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot '../start.ps1') -Port $Port
$url="http://127.0.0.1:$Port/v2/"
$response=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
if ($response.StatusCode -ne 200 -or $response.Content -notmatch 'FactorLab 2.0') { throw 'The current server does not provide FactorLab 2.0. Use an unused port or restart only its verified process.' }
Write-Output "FactorLab 2.0: $url"
if ($OpenBrowser) { Start-Process $url -WindowStyle Hidden }
