$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$output = Join-Path $PSScriptRoot 'TinyBeeConsole.exe'
& $compiler /nologo /target:winexe /utf8output /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /out:$output (Join-Path $PSScriptRoot 'TinyBeeConsole.cs')
if ($LASTEXITCODE -ne 0) { throw 'Compilation failed' }
Write-Output $output
