param(
    [switch]$SkipMsi = $false
)

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$DistDir = Join-Path $ScriptDir "dist"
$StageDir = Join-Path $DistDir "stage"
$ZipOut = Join-Path $DistDir "EdgeDrop-Mod-v0.4.0-win-x64.zip"
$MsiOut = Join-Path $DistDir "EdgeDrop-Mod-Setup.msi"

Write-Host "=== EdgeDrop Mod Automated Packaging Pipeline ===" -ForegroundColor Cyan

# 1. Prepare Dist and Staging Directory
if (Test-Path $StageDir) { Remove-Item $StageDir -Recurse -Force }
New-Item -ItemType Directory -Path $StageDir -Force | Out-Null
New-Item -ItemType Directory -Path $DistDir -Force | Out-Null

# 2. Stage distribution files
Write-Host "[1/3] Staging release binaries..." -ForegroundColor Yellow
$IncludeList = @(
    "Edge-Drop mod.exe",
    "Edge-Drop_wer.dll",
    "ffmpeg.dll",
    "d3dcompiler_47.dll",
    "dxcompiler.dll",
    "vulkan-1.dll",
    "vk_swiftshader.dll",
    "vk_swiftshader_icd.json",
    "icudtl.dat",
    "snapshot_blob.bin",
    "v8_context_snapshot.bin",
    "chrome_100_percent.pak",
    "chrome_200_percent.pak",
    "resources.pak",
    "LICENSES.chromium.html",
    "README.md",
    "locales",
    "resources"
)

foreach ($name in $IncludeList) {
    $srcPath = Join-Path $ScriptDir $name
    if (Test-Path $srcPath) {
        Copy-Item -Path $srcPath -Destination (Join-Path $StageDir $name) -Recurse -Force
    }
}

# 3. Compress Portable ZIP
Write-Host "[2/3] Compressing portable ZIP package..." -ForegroundColor Yellow
if (Test-Path $ZipOut) { Remove-Item $ZipOut -Force }
Compress-Archive -Path "$StageDir\*" -DestinationPath $ZipOut -Force
$zipSize = (Get-Item $ZipOut).Length
Write-Host "  -> Portable ZIP created: $([math]::Round($zipSize / 1MB, 2)) MB" -ForegroundColor Green

# 4. Compile WiX MSI Installer
if (-not $SkipMsi) {
    Write-Host "[3/3] Compiling WiX MSI installer..." -ForegroundColor Yellow
    $WixDir = "$env:LOCALAPPDATA\Programs\WiX"
    $Heat = Join-Path $WixDir "heat.exe"
    $Candle = Join-Path $WixDir "candle.exe"
    $Light = Join-Path $WixDir "light.exe"

    if ((Test-Path $Heat) -and (Test-Path $Candle) -and (Test-Path $Light)) {
        $WxsProduct = Join-Path $DistDir "Product.wxs"
        $WxsHarvest = Join-Path $DistDir "Harvest.wxs"
        $WixObjProduct = Join-Path $DistDir "Product.wixobj"
        $WixObjHarvest = Join-Path $DistDir "Harvest.wixobj"

        # Harvest stage files into components
        & $Heat dir $StageDir -cg AppFiles -gg -scom -sreg -srd -dr INSTALLDIR -var "var.StageDir" -out $WxsHarvest

        # Generate Product.wxs definition
        $productXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" Name="EdgeDrop Mod" Language="1033" Version="0.4.0.0" Manufacturer="EdgeDrop Community" UpgradeCode="e87d0e98-29be-4318-912b-7cfa8f5a54db">
    <Package InstallerVersion="300" Compressed="yes" InstallScope="perMachine" />
    <MajorUpgrade DowngradeErrorMessage="A newer version of EdgeDrop Mod is already installed." />
    <MediaTemplate EmbedCab="yes" />

    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="ProgramFiles64Folder">
        <Directory Id="INSTALLDIR" Name="EdgeDrop Mod" />
      </Directory>
      <Directory Id="ProgramMenuFolder">
        <Directory Id="ApplicationProgramsFolder" Name="EdgeDrop Mod" />
      </Directory>
    </Directory>

    <DirectoryRef Id="ApplicationProgramsFolder">
      <Component Id="ApplicationShortcut" Guid="7abef419-5779-4bc5-a131-48e0259b5832">
        <Shortcut Id="ApplicationStartMenuShortcut"
                  Name="EdgeDrop Mod"
                  Description="Enhanced Clipboard Sidebar"
                  Target="[INSTALLDIR]Edge-Drop mod.exe"
                  WorkingDirectory="INSTALLDIR" />
        <RemoveFolder Id="CleanUpShortCut" Directory="ApplicationProgramsFolder" On="uninstall" />
        <RegistryValue Root="HKCU" Key="Software\EdgeDropMod" Name="installed" Type="integer" Value="1" KeyPath="yes" />
      </Component>
    </DirectoryRef>

    <Feature Id="MainApplication" Title="EdgeDrop Mod" Level="1">
      <ComponentGroupRef Id="AppFiles" />
      <ComponentRef Id="ApplicationShortcut" />
    </Feature>
  </Product>
</Wix>
"@
        Set-Content -Path $WxsProduct -Value $productXml -Encoding UTF8

        # Compile and link
        & $Candle -nologo -arch x64 "-dStageDir=$StageDir" -out $WixObjHarvest $WxsHarvest
        & $Candle -nologo -arch x64 -out $WixObjProduct $WxsProduct
        & $Light -nologo -sice:ICE38 -sice:ICE64 -sice:ICE91 -out $MsiOut $WixObjProduct $WixObjHarvest

        # Clean intermediate objects
        Remove-Item $WxsProduct, $WxsHarvest, $WixObjProduct, $WixObjHarvest -Force -ErrorAction SilentlyContinue

        if (Test-Path $MsiOut) {
            $msiSize = (Get-Item $MsiOut).Length
            Write-Host "  -> MSI installer created: $([math]::Round($msiSize / 1MB, 2)) MB" -ForegroundColor Green
        }
    } else {
        Write-Warning "WiX toolset not found in $WixDir. Skipping MSI packaging."
    }
}

Write-Host "`nAll release deliverables generated in: $DistDir" -ForegroundColor Cyan
