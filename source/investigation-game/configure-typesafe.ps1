$ErrorActionPreference = 'Stop'
$configurationPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '.env'))
if ([IO.Path]::GetDirectoryName($configurationPath) -ne [IO.Path]::GetFullPath($PSScriptRoot)) { throw 'Invalid configuration path.' }
$secureValue = Read-Host 'TypeSafe API key (hidden input)' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
try {
    $typesafeValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
    if ([string]::IsNullOrWhiteSpace($typesafeValue) -or $typesafeValue.Length -gt 2048 -or $typesafeValue -match '\s') { throw 'The key must be a non-empty single token.' }
    $configurationText = if ([IO.File]::Exists($configurationPath)) { [IO.File]::ReadAllText($configurationPath) } else { '' }
    $lines = @($configurationText -split '\r?\n' | Where-Object { $_ -notmatch '^\s*TYPESAFE_API_KEY\s*=' })
    $updatedConfiguration = ($lines -join "`r`n").TrimEnd("`r", "`n") + "`r`nTYPESAFE_API_KEY=" + $typesafeValue + "`r`n"
    [IO.File]::WriteAllText($configurationPath, $updatedConfiguration, (New-Object Text.UTF8Encoding($false)))
    Write-Output 'TypeSafe key saved locally. The key was not printed. Existing provider settings were preserved.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    $typesafeValue = $null
    $configurationText = $null
    $updatedConfiguration = $null
    $secureValue.Dispose()
}
