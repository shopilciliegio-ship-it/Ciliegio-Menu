// promuovi-settimana.js — pubblicazione automatica settimanale (domenica sera).
//
// Fa in automatico quello che Luca fa a mano col bat dopo aver generato i JPG in
// "bozza prossima settimana" dall'app: sposta le immagini da immagini-sito-prossima/
// (dove non le legge nessuno) a immagini-sito/ (letta da pubblica-stories.js e dal
// sito ilciliegio.com), poi le carica anche su Passweb (sito live).
//
// Gira SOLO se Luca ha cliccato "Segna come pronta" nell'app (manifest
// immagini-sito-prossima/settimana.json con pronta:true) — altrimenti esce senza
// fare nulla (nessun errore, è la situazione normale nei giorni in cui non c'è
// niente da promuovere). Lanciato dal workflow promuovi-menu-settimana.yml, di
// domenica sera Europe/Rome (timer Cloudflare, vedi timer-cloudflare/).
//
// Sicurezza: la data "settimana" nel manifest deve combaciare col lunedì che sta per
// arrivare — un manifest vecchio/sbagliato non viene mai promosso, fallisce e basta.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const STAGING_DIR = path.join(ROOT, 'immagini-sito-prossima');
const LIVE_DIR = path.join(ROOT, 'immagini-sito');
const MANIFEST_PATH = path.join(STAGING_DIR, 'settimana.json');
const HTML_PATH = path.join(ROOT, 'Ciliegio-Menu.html');
const CREDS_PATH = path.join(ROOT, 'passweb-credentials.json');
const AUTH_PATH = path.join(ROOT, 'passweb-auth.json');

const CANONICAL_NUMS = ['02','03','04','05','06','07','08','09','10','11','12','13','14','15'];

function log(msg) { console.log(msg); }
function fail(msg) { console.error('ERRORE: ' + msg); process.exitCode = 1; throw new Error(msg); }

function prossimoLunediRoma() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  }).formatToParts(new Date());
  const map = {}; parts.forEach(p => map[p.type] = p.value);
  const dowMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  const dow = dowMap[map.weekday];
  const oggi = new Date(`${map.year}-${map.month}-${map.day}T00:00:00Z`);
  const diffToNextMonday = dow === 0 ? 1 : (dow === 1 ? 0 : 8 - dow);
  return new Date(oggi.getTime() + diffToNextMonday * 86400000).toISOString().slice(0, 10);
}

async function inviaEmail(oggetto, testo) {
  const key = process.env.BREVO_API_KEY;
  if (!key) { log('(BREVO_API_KEY non impostata, salto email di notifica)'); return; }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        sender: { email: 'luca@sienawine.it', name: 'Il Ciliegio — Automazione Menù' },
        to: [{ email: 'luca@ilciliegio.com' }],
        subject: oggetto,
        textContent: testo
      })
    });
    if (!res.ok) log(`⚠️ Invio email fallito: HTTP ${res.status} ${await res.text()}`);
    else log('📧 Email di notifica inviata.');
  } catch (e) { log(`⚠️ Invio email fallito: ${e.message}`); }
}

function bumpVersione() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const m = html.match(/font-family:'Cinzel',serif">v(\d+)<\/div>/);
  if (!m) return;
  const next = parseInt(m[1], 10) + 1;
  fs.writeFileSync(HTML_PATH, html.replace(`>v${m[1]}<`, `>v${next}<`), 'utf8');
  log(`Versione app aggiornata a v${next}.`);
}

function gitRun(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    log('Nessuna bozza in attesa (manca immagini-sito-prossima/settimana.json) — nessuna azione.');
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  if (!manifest.pronta) {
    log(`Bozza presente per la settimana ${manifest.settimana} ma NON segnata "pronta" — nessuna azione. (Segnala nell'app, modal "Genera JPG per Sito".)`);
    return;
  }

  const lunedi = prossimoLunediRoma();
  if (manifest.settimana !== lunedi) {
    await inviaEmail(
      '⚠️ Pubblicazione automatica menù NON eseguita',
      `La bozza pronta in immagini-sito-prossima/ è per la settimana del ${manifest.settimana}, ma il prossimo lunedì è il ${lunedi}.\n\nPer sicurezza non ho promosso nulla — la bozza potrebbe essere vecchia o sbagliata. Controlla l'app e rigenera/segna pronta la bozza corretta.`
    );
    fail(`la bozza è per la settimana ${manifest.settimana}, ma il prossimo lunedì è ${lunedi} — non promuovo per sicurezza.`);
  }

  const mancanti = [];
  for (const num of CANONICAL_NUMS) {
    const files = fs.readdirSync(STAGING_DIR);
    if (!files.some(f => f.startsWith(num + '-') && f.endsWith('.jpg') && !f.includes('-en'))) mancanti.push(`${num} (IT)`);
    if (!files.some(f => f.startsWith(num + '-') && f.endsWith('-en.jpg'))) mancanti.push(`${num} (EN)`);
  }
  if (mancanti.length) {
    await inviaEmail(
      '⚠️ Pubblicazione automatica menù NON eseguita',
      `La bozza per la settimana del ${manifest.settimana} è incompleta, mancano: ${mancanti.join(', ')}.\n\nNon ho promosso nulla. Rigenera i JPG mancanti dall'app e segna di nuovo "pronta".`
    );
    fail(`bozza incompleta, mancano: ${mancanti.join(', ')}`);
  }

  log(`Promuovo la bozza della settimana ${manifest.settimana} (${manifest.chiavi.length} menù) da immagini-sito-prossima/ a immagini-sito/…`);
  fs.mkdirSync(LIVE_DIR, { recursive: true });
  const stagedFiles = fs.readdirSync(STAGING_DIR).filter(f => f.endsWith('.jpg'));
  for (const f of stagedFiles) {
    fs.copyFileSync(path.join(STAGING_DIR, f), path.join(LIVE_DIR, f));
    fs.unlinkSync(path.join(STAGING_DIR, f));
  }
  fs.unlinkSync(MANIFEST_PATH);
  bumpVersione();

  gitRun('git config user.name "ciliegio-menu-bot"');
  gitRun('git config user.email "actions@users.noreply.github.com"');
  gitRun('git add -- immagini-sito immagini-sito-prossima Ciliegio-Menu.html');
  gitRun(`git commit -m "Pubblicazione automatica settimana ${manifest.settimana}: bozza -> immagini-sito/"`);
  gitRun('git push');
  log('✅ immagini-sito/ aggiornata e pubblicata su GitHub (le stories la leggono da qui).');

  // ── Caricamento sul sito live (Passweb) ──
  const user = process.env.PASSWEB_USER, pass = process.env.PASSWEB_PASS, authJson = process.env.PASSWEB_AUTH_JSON;
  if (!user || !pass) {
    await inviaEmail(
      '⚠️ Menù su GitHub OK, ma NON caricato sul sito',
      `La settimana del ${manifest.settimana} è stata pubblicata su GitHub (immagini-sito/) — le stories la useranno.\n\nMa mancano i secret PASSWEB_USER/PASSWEB_PASS: NON ho caricato le immagini su ilciliegio.com. Carica a mano con "## 2 -Aggiorna Immagini Locali##.bat" oppure configura i secret nel repo.`
    );
    fail('mancano PASSWEB_USER/PASSWEB_PASS — sito NON aggiornato (GitHub sì).');
  }
  fs.writeFileSync(CREDS_PATH, JSON.stringify({ username: user, password: pass }), 'utf8');
  if (authJson) fs.writeFileSync(AUTH_PATH, authJson, 'utf8');

  const { chromium } = require('playwright');
  const { ensureLoggedIn, openResourceManager, goToMenuFolder, goToMenuEngFolder, uploadOne, CANONICAL, IMG_DIR, AUTH_PATH: AUTH_PATH2 } = require('./carica-menu-sito.js');
  const browser = await chromium.launch();
  const risultati = [];
  try {
    const context = await browser.newContext(fs.existsSync(AUTH_PATH2) ? { storageState: AUTH_PATH2 } : {});
    const page = await context.newPage();
    await ensureLoggedIn(context, page);
    await openResourceManager(page);

    await goToMenuFolder(page);
    log('=== CARICAMENTO ITALIANO (Menu) ===');
    for (const [num, base] of Object.entries(CANONICAL)) {
      const localFile = fs.readdirSync(IMG_DIR).find(f => f.startsWith(num + '-') && f.endsWith('.jpg') && !f.includes('-en'));
      if (!localFile) { risultati.push({ num, skipped: true }); continue; }
      const r = await uploadOne(page, path.join(IMG_DIR, localFile), base);
      const ok = r.body && r.body.message && r.body.message.success;
      log(`[${ok ? 'OK' : 'ERRORE'}] ${localFile} -> ${base}.jpg`);
      risultati.push({ num, localFile, ok, body: r.body });
    }

    await goToMenuEngFolder(page);
    log('=== CARICAMENTO INGLESE (Menu-Eng) ===');
    for (const [num, base] of Object.entries(CANONICAL)) {
      const target = base + '-en';
      const localFile = fs.readdirSync(IMG_DIR).find(f => f.startsWith(num + '-') && f.endsWith('-en.jpg'));
      if (!localFile) { risultati.push({ num, skipped: true }); continue; }
      const r = await uploadOne(page, path.join(IMG_DIR, localFile), target);
      const ok = r.body && r.body.message && r.body.message.success;
      log(`[${ok ? 'OK' : 'ERRORE'}] ${localFile} -> ${target}.jpg`);
      risultati.push({ num, localFile, ok, body: r.body });
    }
  } finally {
    await browser.close();
    // Pulizia credenziali dal filesystem del runner (best-effort, il runner è comunque effimero)
    try { fs.unlinkSync(CREDS_PATH); } catch (e) {}
  }

  const falliti = risultati.filter(r => !r.ok && !r.skipped);
  if (falliti.length) {
    await inviaEmail(
      '⚠️ Menù su GitHub OK, ma con errori sul sito',
      `Settimana del ${manifest.settimana}: GitHub aggiornato correttamente. Sul sito ilciliegio.com ${falliti.length} immagine/i su ${risultati.length} NON caricate: ${falliti.map(f => f.num).join(', ')}.\n\nControlla e ricarica a mano quelle mancanti col bat.`
    );
    fail(`${falliti.length} immagini non caricate sul sito: ${falliti.map(f => f.num).join(', ')}`);
  }

  await inviaEmail(
    '✅ Menù della settimana pubblicato automaticamente',
    `Settimana del ${manifest.settimana} pubblicata: GitHub (immagini-sito/, usata dalle stories) e sito ilciliegio.com aggiornati, tutte le ${risultati.length} immagini OK.`
  );
  log('✅ Tutto fatto: GitHub e sito live aggiornati.');
}

main().catch(err => {
  console.error('❌ Errore:', err.message);
  process.exitCode = 1;
});
