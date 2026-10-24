$ErrorActionPreference = 'Stop'
$dist = 'C:\Users\Administrator\.zcode\workspace\default\YCFS-Client\dist'
$node = 'C:\Users\Administrator\ycfs-tools\node\node.exe'
$checker = 'C:\Users\Administrator\.zcode\workspace\default\YCFS-Client\build\check_fuses.js'

Write-Output '=== dist contents ==='
Get-ChildItem $dist | ForEach-Object { Write-Output ("{0}  {1}" -f $_.Length, $_.Name) }

Write-Output '=== local sha256 of mac zips ==='
Get-ChildItem "$dist\*mac*.zip" | ForEach-Object {
  $h = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
  Write-Output ("{0}  {1}" -f $h, $_.Name)
}

Write-Output '=== extract mac main binaries ==='
foreach ($arch in @('x64','arm64')) {
  $zip = Get-ChildItem "$dist\*mac-$arch.zip" | Select-Object -First 1
  $ex = Join-Path $dist ("ex-$arch")
  if (Test-Path $ex) { Remove-Item $ex -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $ex | Out-Null
  & tar.exe -xf $zip.FullName -C $ex '*.app/Contents/MacOS/*' 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Output "--- $arch tar extract failed, fallback full extract"; & tar.exe -xf $zip.FullName -C $ex }
  $bin = Get-ChildItem $ex -Recurse -File | Where-Object { $_.FullName -like '*\Contents\MacOS\*' } | Select-Object -First 1
  if ($bin) {
    Write-Output ("--- $arch binary: " + $bin.FullName + " (" + $bin.Length + " bytes)")
    & $node $checker $bin.FullName
  } else {
    Write-Output "--- $arch binary NOT FOUND in zip"
  }
}
