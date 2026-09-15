@echo off
chcp 65001 >nul
cd /d "D:\Società Agricola Il Ciliegio\Sito del Team - Documenti\Ciliegio CLOUD\LUCA\GitHub\Ciliegio Menu"
echo Aggiornamento cartella locale in corso...
echo.
git pull
echo.
echo ------------------------------------
echo Lettura foto in "Menu Settimana\" e trascrizione con Claude...
echo (Questo passaggio usa la tua chiave Anthropic e ha un piccolo costo)
echo.
node importa-menu-foto.js
if errorlevel 1 (
    echo.
    echo ------------------------------------
    echo Qualcosa e' andato storto, vedi l'errore sopra. Nessuna modifica caricata.
    goto fine
)

echo.
echo ------------------------------------
choice /M "Caricare la bozza su GitHub adesso (poi la trovi nel popup Importa Menu Settimana dell'app)"
if errorlevel 2 goto skip_push
git add -- menu-data.json Ciliegio-Menu.html
git commit -m "Import bozza menu da foto (automatico)"
git push
echo Caricato su GitHub.
goto fine
:skip_push
git checkout -- menu-data.json Ciliegio-Menu.html
echo Non caricato. Le modifiche locali sono state annullate.

:fine
echo.
echo ------------------------------------
echo Fatto! Premi un tasto per chiudere.
pause >nul
