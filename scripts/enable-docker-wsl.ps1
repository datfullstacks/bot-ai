# Run as Administrator. Enables the Windows features Docker Desktop needs.
$ErrorActionPreference = "Continue"

Write-Host "Enabling WSL and Virtual Machine Platform..."
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All -NoRestart
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart

Write-Host "Setting hypervisor launch type to auto..."
bcdedit /set hypervisorlaunchtype auto

Write-Host "Updating WSL..."
wsl --update
wsl --set-default-version 2

Write-Host ""
Write-Host "Done. Restart Windows now, then open Docker Desktop again."
Read-Host "Press Enter to close"
