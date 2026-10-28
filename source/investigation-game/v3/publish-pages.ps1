param([switch]$Publish)
$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
& $node (Join-Path $PSScriptRoot 'build-pages.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Public build failed.' }
& $node --test (Join-Path $PSScriptRoot 'test-pages-update.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Update checks failed.' }
& $node (Join-Path $PSScriptRoot 'browser-pages.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Public browser checks failed.' }
if ($Publish) {
    & $node (Join-Path $PSScriptRoot 'publish-pages.cjs') --publish
} else {
    & $node (Join-Path $PSScriptRoot 'publish-pages.cjs')
}
if ($LASTEXITCODE -ne 0) { throw 'Publication failed.' }
