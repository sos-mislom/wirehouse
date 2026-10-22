param(
    [Parameter(Mandatory = $true)][string]$EnvFile,
    [string]$PythonPath = "python",
    [string]$TaskName = "Wirehouse-OneC-Exchange"
)
$ErrorActionPreference = "Stop"
$privateFile = (Resolve-Path -LiteralPath $EnvFile).Path
$pythonExecutable = (Get-Command $PythonPath -ErrorAction Stop).Source
$runnerPath = Join-Path $PSScriptRoot "Run-OneCBridge.ps1"
$powershellExecutable = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $runnerPath + '" -PythonPath "' + $pythonExecutable + '" -EnvFile "' + $privateFile + '"'
$action = New-ScheduledTaskAction -Execute $powershellExecutable -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -Hidden
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Wirehouse 1C exchange. Runs while this Windows account is logged in; 1C UI may be closed." -Force | Select-Object TaskName, State
