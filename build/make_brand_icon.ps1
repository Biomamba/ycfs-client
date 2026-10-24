Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$build = 'C:\Users\Administrator\.zcode\workspace\default\YCFS-Client\build'

# 1) load brand logo and report size
$src = [System.Drawing.Bitmap]::FromFile((Join-Path $build 'brand_logo.jpg'))
Write-Output ("logo size: " + $src.Width + " x " + $src.Height)

# 2) crop the snake region (left part of the logo)
# analysis said snake occupies the left side; crop left 36% width, full height
$cropW = [int]($src.Width * 0.36)
$cropH = $src.Height
$crop = [System.Drawing.Bitmap]::new($cropW, $cropH)
$g0 = [System.Drawing.Graphics]::FromImage($crop)
$g0.DrawImage($src, [System.Drawing.Rectangle]::new(0, 0, $cropW, $cropH), [System.Drawing.Rectangle]::new(0, 0, $cropW, $cropH), [System.Drawing.GraphicsUnit]::Pixel)
$g0.Dispose()
$crop.Save((Join-Path $build 'snake_crop.png'), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output ("cropped: " + $cropW + " x " + $cropH)

# 3) trim near-white margins of the crop and report the ink bounding box
$white = 235
$minX = $cropW; $minY = $cropH; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $cropH; $y++) {
  for ($x = 0; $x -lt $cropW; $x++) {
    $c = $crop.GetPixel($x, $y)
    if (-not ($c.R -ge $white -and $c.G -ge $white -and $c.B -ge $white)) {
      if ($x -lt $minX) { $minX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
Write-Output ("ink bbox: ($minX,$minY)-($maxX,$maxY)")

# 4) extract snake with white -> transparent, tight to bbox, margin 4%
$pad = [int](($maxX - $minX + $maxY - $minY) / 2 * 0.04)
$ex0 = [Math]::Max(0, $minX - $pad); $ey0 = [Math]::Max(0, $minY - $pad)
$ex1 = [Math]::Min($cropW - 1, $maxX + $pad); $ey1 = [Math]::Min($cropH - 1, $maxY + $pad)
$ew = $ex1 - $ex0 + 1; $eh = $ey1 - $ey0 + 1
$snake = [System.Drawing.Bitmap]::new($ew, $eh)
for ($y = 0; $y -lt $eh; $y++) {
  for ($x = 0; $x -lt $ew; $x++) {
    $c = $crop.GetPixel($ex0 + $x, $ey0 + $y)
    $alpha = 255
    if ($c.R -ge $white -and $c.G -ge $white -and $c.B -ge $white) { $alpha = 0 }
    elseif ($c.R -ge 215 -and $c.G -ge 215 -and $c.B -ge 215) { $alpha = [int](255 * (235 - $c.R) / 20); if ($alpha -lt 0) { $alpha = 0 } }
    $snake.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $c.R, $c.G, $c.B))
  }
}
$snake.Save((Join-Path $build 'snake_rgba.png'), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output ("snake rgba: " + $ew + " x " + $eh)

# 5) compose 512x512 icon: green gradient rounded square + snake centered at ~76% width
$size = 512
$bmp = [System.Drawing.Bitmap]::new($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

function New-RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

$rect = New-RoundRect 12 12 488 488 108
$bgBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(0, 0, $size, $size),
  [System.Drawing.Color]::FromArgb(255, 11, 77, 61),
  [System.Drawing.Color]::FromArgb(255, 21, 158, 120),
  90)
$g.FillPath($bgBrush, $rect)

$targetW = 330.0
$scale = $targetW / $ew
$targetH = $eh * $scale
if ($targetH -gt 380) { $scale = 380.0 / $eh }
$dw = [int]($ew * $scale); $dh = [int]($eh * $scale)
$dx = [int](($size - $dw) / 2); $dy = [int](($size - $dh) / 2)
$g.DrawImage($snake, [System.Drawing.Rectangle]::new($dx, $dy, $dw, $dh), [System.Drawing.Rectangle]::new(0, 0, $ew, $eh), [System.Drawing.GraphicsUnit]::Pixel)

$g.Dispose()
$bmp.Save((Join-Path $build 'icon_draft.png'), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output ("icon draft saved, snake drawn at ${dw}x${dh} at (${dx},${dy})")
$src.Dispose(); $crop.Dispose(); $snake.Dispose(); $bmp.Dispose()
