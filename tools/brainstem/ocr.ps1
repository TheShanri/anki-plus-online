# Windows.Media.Ocr over every PNG in a folder; writes JSON {file: {w, h, lines: [{text, x, y, w, h}]}} (pixels).
# Usage: powershell -NoProfile -File ocr.ps1 -Dir <folder of png> -Out <json>
param([string]$Dir, [string]$Out)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $null = $t.Wait(-1); $t.Result }
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$all = @{}
foreach ($p in Get-ChildItem -LiteralPath $Dir -Filter *.png) {
  try {
    $f = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($p.FullName)) ([Windows.Storage.StorageFile])
    $s = Await ($f.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $d = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($s)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $b = Await ($d.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $r = Await ($engine.RecognizeAsync($b)) ([Windows.Media.Ocr.OcrResult])
    $lines = @()
    foreach ($l in $r.Lines) {
      $x0 = 1e9; $y0 = 1e9; $x1 = 0; $y1 = 0; $ws = @()
      foreach ($w in $l.Words) { $q = $w.BoundingRect; $ws += @{ text = $w.Text; x = $q.X; y = $q.Y; w = $q.Width; h = $q.Height }; $x0 = [Math]::Min($x0, $q.X); $y0 = [Math]::Min($y0, $q.Y); $x1 = [Math]::Max($x1, $q.X + $q.Width); $y1 = [Math]::Max($y1, $q.Y + $q.Height) }
      $lines += @{ text = $l.Text; x = $x0; y = $y0; w = $x1 - $x0; h = $y1 - $y0; words = $ws }
    }
    $all[$p.BaseName] = @{ w = $b.PixelWidth; h = $b.PixelHeight; lines = $lines }
  } catch { Write-Error "$($p.Name): $_" }
}
$all | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Out -Encoding utf8
