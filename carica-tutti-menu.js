const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const {
  ensureLoggedIn, openResourceManager, goToMenuFolder, goToMenuEngFolder, uploadOne, CANONICAL, IMG_DIR, AUTH_PATH,
} = require('./carica-menu-sito.js');

function targetsFor(isEn) {
  return Object.entries(CANONICAL).map(([num, base]) => ({
    num,
    localSuffix: isEn ? '-en.jpg' : '.jpg',
    target: isEn ? base + '-en' : base,
  }));
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  try {
    const context = await browser.newContext(fs.existsSync(AUTH_PATH) ? { storageState: AUTH_PATH } : {});
    const page = await context.newPage();
    await ensureLoggedIn(context, page);
    await openResourceManager(page);
    await goToMenuFolder(page);

    console.log('=== CARICAMENTO ITALIANO (Menu) ===');
    for (const { num, target } of targetsFor(false)) {
      const localFile = fs.readdirSync(IMG_DIR).find((f) => f.startsWith(num + '-') && f.endsWith('.jpg') && !f.includes('-en'));
      if (!localFile) {
        console.log(`[SALTATO] ${num}: nessun file locale trovato`);
        results.push({ num, target, skipped: true });
        continue;
      }
      const r = await uploadOne(page, path.join(IMG_DIR, localFile), target);
      const ok = r.body && r.body.message && r.body.message.success;
      console.log(`[${ok ? 'OK' : 'ERRORE'}] ${localFile} -> ${target}.jpg`, ok ? '' : JSON.stringify(r.body));
      results.push({ num, localFile, target, ok, body: r.body });
    }

    console.log('=== CARICAMENTO INGLESE (Menu-Eng) ===');
    await goToMenuEngFolder(page);
    for (const { num, target } of targetsFor(true)) {
      const localFile = fs.readdirSync(IMG_DIR).find((f) => f.startsWith(num + '-') && f.endsWith('-en.jpg'));
      if (!localFile) {
        console.log(`[SALTATO] ${num}-en: nessun file locale trovato`);
        results.push({ num, target, skipped: true });
        continue;
      }
      const r = await uploadOne(page, path.join(IMG_DIR, localFile), target);
      const ok = r.body && r.body.message && r.body.message.success;
      console.log(`[${ok ? 'OK' : 'ERRORE'}] ${localFile} -> ${target}.jpg`, ok ? '' : JSON.stringify(r.body));
      results.push({ num, localFile, target, ok, body: r.body });
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  console.log('\n=== RIEPILOGO ===');
  console.log(`Totale: ${results.length}, OK: ${results.length - failed.length - skipped.length}, ERRORE: ${failed.length}, SALTATI: ${skipped.length}`);
  if (failed.length) {
    console.log('File in errore:', failed.map((f) => f.localFile || f.num).join(', '));
    process.exit(1);
  }
  process.exit(0);
})();
