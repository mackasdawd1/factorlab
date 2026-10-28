param(
    [ValidateRange(1024, 65535)][int]$Port = 8877,
    [switch]$OpenBrowser
)
$ErrorActionPreference = 'Stop'
$serverFile = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'server.cjs'))
$runtimeDir = Join-Path $PSScriptRoot '.local'
$url = "http://127.0.0.1:$Port/"
$mutex = New-Object Threading.Mutex($false, "Local\InvestigationGamePort$Port")
if (-not $mutex.WaitOne(0)) { throw 'Another launcher is starting this port. Retry shortly.' }
try {
    $portIsInUse = @([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object { $_.Port -eq $Port }).Count -gt 0
    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($portIsInUse -and $listeners.Count -eq 0) { throw "Port $Port is occupied by another process or its owner cannot be verified. Nothing was stopped." }
    if ($listeners.Count -gt 0) {
        foreach ($listener in $listeners) {
            $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
            $expectedArgs = '"' + $serverFile + '" --port ' + $Port
            if (-not $existing -or $existing.Name -ne 'node.exe' -or -not $existing.CommandLine.TrimEnd().EndsWith($expectedArgs, [StringComparison]::OrdinalIgnoreCase) -or $listener.LocalAddress -ne '127.0.0.1') {
                throw "Port $Port is occupied by another process. Nothing was stopped."
            }
        }
        $status = Invoke-RestMethod -Uri ($url + 'api/status') -TimeoutSec 2
        if ($null -eq $status.configured -or $status.mode -notin @('live', 'example')) { throw 'Existing process did not return a valid game status.' }
        Write-Output "Already running: $url"
    } else {
        $node = (Get-Command node -ErrorAction Stop).Source
        $null = New-Item -ItemType Directory -Path $runtimeDir -Force
        $arguments = '"' + $serverFile + '" --port ' + $Port
        $process = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir "server-$Port.out.log") -RedirectStandardError (Join-Path $runtimeDir "server-$Port.err.log")
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 100
            $process.Refresh()
            if ($process.HasExited) { throw 'Local server exited; inspect investigation-game/.local logs.' }
            try {
                $status = Invoke-RestMethod -Uri ($url + 'api/status') -TimeoutSec 1
                if ($null -ne $status.configured -and $status.mode -in @('live', 'example')) { $ready = $true; break }
            } catch {}
        }
        if (-not $ready) { throw 'Server readiness was not confirmed; inspect investigation-game/.local logs.' }
        Write-Output "Started: $url (PID $($process.Id))"
    }
    if ($OpenBrowser) { Start-Process $url -WindowStyle Hidden }
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
