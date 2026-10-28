$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if ($projectRoot -notmatch '^[dD]:\\') { throw 'This project is configured to keep its active environment on D:' }
$studioRuntime = Join-Path $projectRoot '.local/redesign-20261013'
$env:TEMP = Join-Path $studioRuntime 'tmp'
$env:TMP = $env:TEMP
$env:npm_config_cache = Join-Path $studioRuntime 'cache/npm'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $studioRuntime 'runtime/browsers'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:PYTHONPYCACHEPREFIX = Join-Path $studioRuntime 'cache/python'
$env:Path = (Join-Path $studioRuntime 'runtime/python') + ';' + $env:Path
New-Item -ItemType Directory -Force -Path $env:TEMP,$env:npm_config_cache,$env:PYTHONPYCACHEPREFIX | Out-Null
