@echo off
chcp 65001 >nul
cd /d "D:\Società Agricola Il Ciliegio\Sito del Team - Documenti\Ciliegio CLOUD\LUCA\GitHub\Ciliegio Menu"
echo Aggiornamento cartella locale in corso...
echo.
git pull
echo.
echo ------------------------------------
echo Controllo giorni/servizi senza immagine...
powershell -NoProfile -ExecutionPolicy Bypass -File "Completa-Immagini-Mancanti.ps1"
echo.

git add -- immagini-sito\*.jpg >nul 2>nul
git diff --cached --quiet -- immagini-sito
if errorlevel 1 (
    echo ------------------------------------
    choice /M "Caricare le nuove immagini generiche su GitHub adesso"
    if errorlevel 2 goto skip_push
    git commit -m "Aggiungi immagini generiche per giorni/servizi senza menu"
    git push
    echo Caricato su GitHub.
    goto fine
    :skip_push
    git reset -- immagini-sito\*.jpg >nul 2>nul
    echo Non caricato. Le immagini restano solo in locale per ora.
)

:fine
echo.
echo ------------------------------------
choice /M "Caricare tutti i menu della settimana anche sul sito ilciliegio.com adesso"
if errorlevel 2 goto skip_site
node carica-tutti-menu.js
goto fine2
:skip_site
echo Sito non aggiornato. Puoi rilanciare il bat quando vuoi per farlo.

:fine2
echo.
echo ------------------------------------
echo Fatto! Premi un tasto per chiudere.
pause >nul
