$ErrorActionPreference = 'Stop'
$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $sourceDir '..\..')
$outputDir = Join-Path $repoRoot 'dist\chrome-host-prototype'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The .NET Framework 4.x C# compiler was not found.' }
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$exe = Join-Path $outputDir 'ChromeHostController.exe'
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /out:$exe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $sourceDir 'ChromeHostController.cs')
if ($LASTEXITCODE -ne 0) { throw "C# compilation failed with exit code $LASTEXITCODE." }
Write-Output $exe
