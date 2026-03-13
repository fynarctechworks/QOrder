# Mantra MFS100 Helper Script
# Called by the backend's Mantra adapter via child_process
# Takes a JSON command as argument, outputs JSON result to stdout
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File mantra-helper.ps1 -Command '{"action":"info"}'
#   powershell -ExecutionPolicy Bypass -File mantra-helper.ps1 -Command '{"action":"capture","timeout":10000}'
#   powershell -ExecutionPolicy Bypass -File mantra-helper.ps1 -Command '{"action":"match","template1":"base64...","template2":"base64..."}'

param(
  [Parameter(Mandatory=$true)]
  [string]$Command
)

$ErrorActionPreference = "Stop"

function Write-JsonResult($data) {
  $json = $data | ConvertTo-Json -Compress -Depth 5
  Write-Output $json
}

function Write-JsonError($message) {
  Write-JsonResult @{ success = $false; error = $message }
}

try {
  $cmd = $Command | ConvertFrom-Json
} catch {
  Write-JsonError "Invalid JSON command: $($_.Exception.Message)"
  exit 1
}

$dllDir = "C:\Program Files\Mantra\MFS100\Driver\MFS100Test"
$dllPath = Join-Path $dllDir "MANTRA.MFS100.dll"

if (-not (Test-Path $dllPath)) {
  Write-JsonError "Mantra MFS100 SDK not found at $dllPath"
  exit 1
}

try {
  # Load the .NET DLL
  Add-Type -Path $dllPath -ErrorAction Stop
  
  # Set working directory so native DLLs (MFS100Dll.dll, iengine_ansi_iso.dll) are found
  Push-Location $dllDir

  $device = New-Object MANTRA.MFS100

  # Suppress SDK console output by redirecting the native DLL's stdout
  $oldOut = [Console]::Out
  $sw = [System.IO.StringWriter]::new()
  [Console]::SetOut($sw)

  $initResult = $device.Init()
  
  # Restore stdout for our JSON output
  [Console]::SetOut($oldOut)

  if ($initResult -ne 0) {
    $errMsg = $device.GetErrorMsg($initResult)
    Write-JsonError "Device init failed (code $initResult): $errMsg"
    Pop-Location
    exit 1
  }

  switch ($cmd.action) {
    "info" {
      $connected = $device.IsConnected()
      $sdkVersion = $device.GetSDKVersion()
      $devInfo = $null
      $serial = "N/A"
      $model = "MFS100"
      $make = "MANTRA"

      if ($connected) {
        try {
          $devInfo = $device.GetDeviceInfo()
          if ($devInfo) {
            $serial = $devInfo.SerialNo
            $model = $devInfo.Model
            $make = $devInfo.Make
          }
        } catch { }
      }

      Write-JsonResult @{
        success = $true
        data = @{
          connected = $connected
          deviceName = "$make $model"
          serialNumber = $serial
          sdkVersion = $sdkVersion
          make = $make
          model = $model
        }
      }
    }

    "capture" {
      $timeout = if ($cmd.timeout) { $cmd.timeout } else { 10000 }

      if (-not $device.IsConnected()) {
        Write-JsonError "Device not connected"
        break
      }

      $fingerData = New-Object MANTRA.FingerData
      
      # Suppress SDK debug output during capture
      $oldOut2 = [Console]::Out
      $sw2 = [System.IO.StringWriter]::new()
      [Console]::SetOut($sw2)
      
      $captureResult = $device.AutoCapture([ref]$fingerData, $timeout, $false, $true)
      
      [Console]::SetOut($oldOut2)

      if ($captureResult -ne 0) {
        $errMsg = $device.GetErrorMsg($captureResult)
        Write-JsonError "Capture failed (code $captureResult): $errMsg"
        break
      }

      $isoTemplate = $fingerData.ISOTemplate
      if ($null -eq $isoTemplate -or $isoTemplate.Length -eq 0) {
        Write-JsonError "No fingerprint data captured"
        break
      }

      $templateBase64 = [Convert]::ToBase64String($isoTemplate)
      $quality = $fingerData.Quality

      Write-JsonResult @{
        success = $true
        data = @{
          templateData = $templateBase64
          quality = $quality
          deviceType = "MANTRA_MFS100"
        }
      }
    }

    "match" {
      if (-not $cmd.template1 -or -not $cmd.template2) {
        Write-JsonError "match requires template1 and template2"
        break
      }

      $probe = [Convert]::FromBase64String($cmd.template1)
      $gallery = [Convert]::FromBase64String($cmd.template2)
      $score = 0

      $matchResult = $device.MatchISO($probe, $gallery, [ref]$score)

      if ($matchResult -ne 0) {
        $errMsg = $device.GetErrorMsg($matchResult)
        Write-JsonError "Match failed (code $matchResult): $errMsg"
        break
      }

      $threshold = if ($cmd.threshold) { $cmd.threshold } else { 40 }

      Write-JsonResult @{
        success = $true
        data = @{
          verified = ($score -ge $threshold)
          matchScore = $score
        }
      }
    }

    default {
      Write-JsonError "Unknown action: $($cmd.action). Use: info, capture, match"
    }
  }

  # Cleanup
  try { $device.Uninit() | Out-Null } catch { }
  try { $device.Dispose() } catch { }
  Pop-Location

} catch {
  Write-JsonError "Unexpected error: $($_.Exception.Message)"
  try { Pop-Location } catch { }
  exit 1
}
