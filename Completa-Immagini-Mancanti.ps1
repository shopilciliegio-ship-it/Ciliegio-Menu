$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fallbackDir = Join-Path $root "Menù Settimana\Ottimizzati Chiusi"
$targetDir = Join-Path $root "immagini-sito"

if (-not (Test-Path $fallbackDir)) {
    Write-Host "Cartella 'Ottimizzati Chiusi' non trovata: $fallbackDir"
    exit 1
}
if (-not (Test-Path $targetDir)) {
    Write-Host "Cartella 'immagini-sito' non trovata: $targetDir"
    exit 1
}

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]90)

$added = @()

Get-ChildItem -Path $fallbackDir -Filter *.png | ForEach-Object {
    $destName = [System.IO.Path]::GetFileNameWithoutExtension($_.Name) + ".jpg"
    $destPath = Join-Path $targetDir $destName
    if (-not (Test-Path $destPath)) {
        $img = [System.Drawing.Image]::FromFile($_.FullName)
        try {
            $img.Save($destPath, $jpegCodec, $encParams)
        } finally {
            $img.Dispose()
        }
        $added += $destName
    }
}

Write-Host ""
if ($added.Count -gt 0) {
    Write-Host "Immagini generiche 'chiuso/al completo' aggiunte per i servizi senza menu:"
    $added | ForEach-Object { Write-Host "  + $_" }
} else {
    Write-Host "Nessun file mancante - tutti i giorni/servizi della settimana hanno gia' un'immagine."
}
