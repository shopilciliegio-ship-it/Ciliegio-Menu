$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fallbackDir = Join-Path $root "Menù Settimana\Ottimizzati Chiusi"
$targetDir = Join-Path $root "immagini-sito"
$menuDataPath = Join-Path $root "menu-data.json"

if (-not (Test-Path $fallbackDir)) {
    Write-Host "Cartella 'Ottimizzati Chiusi' non trovata: $fallbackDir"
    exit 1
}
if (-not (Test-Path $targetDir)) {
    Write-Host "Cartella 'immagini-sito' non trovata: $targetDir"
    exit 1
}
if (-not (Test-Path $menuDataPath)) {
    Write-Host "menu-data.json non trovato: $menuDataPath"
    exit 1
}

$menuData = Get-Content -Path $menuDataPath -Raw -Encoding UTF8 | ConvertFrom-Json

# Settimana corrente lunedì-domenica (stessa logica di apriJPGModal() nell'app)
$today = Get-Date
$dow0 = [int]$today.DayOfWeek  # 0=domenica...6=sabato, come JS getDay()
$diffToMon = if ($dow0 -eq 0) { -6 } else { 1 - $dow0 }
$monday = $today.AddDays($diffToMon).Date

$GIORNI_IT = @('domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato')

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]90)

function Copia-Fallback($destName) {
    $srcPng = Join-Path $fallbackDir ([System.IO.Path]::GetFileNameWithoutExtension($destName) + ".png")
    if (-not (Test-Path $srcPng)) { return $false }
    $destPath = Join-Path $targetDir $destName
    $img = [System.Drawing.Image]::FromFile($srcPng)
    try { $img.Save($destPath, $jpegCodec, $encParams) } finally { $img.Dispose() }
    return $true
}

Write-Host ""
Write-Host "Controllo settimana $($monday.ToString('dd/MM')) - $($monday.AddDays(6).ToString('dd/MM')):"
Write-Host "------------------------------------------------------------"

$aggiunte = @()
$daRigenerare = @()

for ($i = 0; $i -lt 7; $i++) {
    $data = $monday.AddDays($i)
    $dateStr = $data.ToString('yyyy-MM-dd')
    $dow = [int]$data.DayOfWeek
    $giorno = $GIORNI_IT[$dow]
    $idx = if ($dow -eq 0) { 6 } else { $dow - 1 }

    foreach ($serv in @('pranzo','cena')) {
        $num = $idx * 2 + $(if ($serv -eq 'pranzo') { 2 } else { 3 })
        $numStr = $num.ToString('00')
        $fnIt = "$numStr-$giorno-$serv.jpg"
        $fnEn = "$numStr-$giorno-$serv-en.jpg"
        $key = "${dateStr}_${serv}_Menù del Sito"

        $menuVoce = $menuData.menu.PSObject.Properties[$key]
        $haMenu = $null -ne $menuVoce
        $esisteIt = Test-Path (Join-Path $targetDir $fnIt)
        $esisteEn = Test-Path (Join-Path $targetDir $fnEn)
        $labelGiorno = "$giorno $($data.ToString('dd/MM')) $serv"

        if ($haMenu) {
            $prezzo = $menuVoce.Value.prezzo
            if ($esisteIt -and $esisteEn) {
                Write-Host "  OK    $labelGiorno -- menu REALE confermato (EUR $prezzo), file presenti"
            } else {
                Write-Host "  ATTN  $labelGiorno -- menu REALE confermato (EUR $prezzo) ma FILE MANCANTE (IT:$esisteIt EN:$esisteEn)"
                Write-Host "        NON lo riempio con l'immagine generica. Rigenera da 'Genera JPG per Sito' nell'app."
                $daRigenerare += $labelGiorno
            }
        } else {
            $okIt = $esisteIt -or (Copia-Fallback $fnIt)
            $okEn = $esisteEn -or (Copia-Fallback $fnEn)
            if (-not $esisteIt -and $okIt) { $aggiunte += $fnIt }
            if (-not $esisteEn -and $okEn) { $aggiunte += $fnEn }
            if ($esisteIt -and $esisteEn) {
                Write-Host "  --    $labelGiorno -- nessun menu confermato, immagine generica gia' presente"
            } else {
                Write-Host "  +++   $labelGiorno -- nessun menu confermato, aggiunta immagine generica 'al completo'"
            }
        }
    }
}

Write-Host "------------------------------------------------------------"
if ($aggiunte.Count -gt 0) {
    Write-Host "Immagini generiche aggiunte: $($aggiunte.Count)"
} else {
    Write-Host "Nessuna immagine generica da aggiungere."
}
if ($daRigenerare.Count -gt 0) {
    Write-Host ""
    Write-Host "ATTENZIONE: $($daRigenerare.Count) servizio/i con menu reale ma senza immagine:"
    $daRigenerare | ForEach-Object { Write-Host "  - $_" }
    Write-Host "Vai su 'Genera JPG per Sito' nell'app per generarle, poi rilancia questo bat."
}
Write-Host ""
