const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const REPO_DIR = __dirname;
const IMG_DIR = path.join(REPO_DIR, 'immagini-sito');
const CREDS_PATH = path.join(REPO_DIR, 'passweb-credentials.json');
const AUTH_PATH = path.join(REPO_DIR, 'passweb-auth.json');

const CANONICAL = {
  '02': '02-luned-pranzo',
  '03': '03-luned-cena',
  '04': '04-marted-pranzo',
  '05': '05-marted-cena',
  '06': '06-mercoled-pranzo',
  '07': '07-mercoled-cena',
  '08': '08-gioved-pranzo',
  '09': '09-gioved-cena',
  '10': '10-venerd-pranzo',
  '11': '11-venerd-cena',
  '12': '12-sabato-pranzo',
  '13': '13-sabato-cena',
  '14': '14-domenica-pranzo',
  '15': '15-domenica-cena',
};

async function ensureLoggedIn(context, page) {
  await page.goto('https://www.ilciliegio.com/Wizard', { waitUntil: 'networkidle', timeout: 30000 });
  if (page.url().includes('/Login')) {
    console.log('Sessione scaduta, rifaccio login...');
    const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));
    await page.goto('https://www.ilciliegio.com/Wizard/Login', { waitUntil: 'networkidle' });
    await page.fill('#username', creds.username);
    await page.fill('#password', creds.password);
    await page.click('#submit');
    await page.waitForTimeout(3000);
    if (page.url().includes('Login2FA') || (await page.locator('#codice2fa').count()) > 0) {
      throw new Error('Richiesto codice 2FA: la sessione salvata (passweb-auth.json) e\' scaduta e serve un nuovo codice a 6 cifre manuale.');
    }
    await context.storageState({ path: AUTH_PATH });
    console.log('Login OK, sessione salvata.');
  } else {
    console.log('Sessione valida, nessun login necessario.');
  }
}

async function openResourceManager(page) {
  await page.goto('https://www.ilciliegio.com/Wizard/Site/LivePreview/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.click('#menu-variant-themes a[title="Temi"]');
  await page.waitForTimeout(1000);
  await page.click('text=Gestisci Temi');
  await page.waitForTimeout(2000);
  await page.click('a.page[data-href="#themes-attributes"]:has-text("2")');
  await page.waitForTimeout(1500);
  await page.click('#themes-attributes tbody tr.datagridRow');
  await page.waitForTimeout(500);
  await page.click('#editThemesAttributes');
  await page.waitForTimeout(1000);
  await page.click('#themes-edit-attribute-resource');
  await page.waitForTimeout(2000);
}

async function goToMenuFolder(page) {
  await page.click('.treeNode.resourcesFolder:has-text("Menu"):not(:has-text("speciali"))');
  await page.waitForTimeout(1500);
}

async function goToMenuEngFolder(page) {
  await page.evaluate(() => {
    const spans = document.querySelectorAll('#dialogWndRes .treeNode.resourcesFolder');
    for (const s of spans) {
      if (s.textContent.trim() === 'Menu') {
        const li = s.closest('li');
        const a = li.querySelector(':scope > a.expandNode, :scope > a.expandNode-empty');
        if (a) a.click();
      }
    }
  });
  await page.waitForTimeout(1000);
  await page.click('#dialogWndRes .treeNode.resourcesFolder:text-is("Menu-Eng")');
  await page.waitForTimeout(1500);
}

async function deleteIfExists(page, targetName) {
  const rows = await page.locator('#resourcesContainer .datagridRow').all();
  let anyChecked = false;
  for (const row of rows) {
    const text = (await row.locator('td').nth(1).innerText()).trim();
    if (text === targetName || text.startsWith(targetName + '.')) {
      await row.locator('a.datagridCheck').click();
      anyChecked = true;
    }
  }
  if (anyChecked) {
    await page.click('#deleteFile');
    await page.waitForTimeout(800);
    await page.click('.ui-dialog-buttonpane .btn-success:has-text("Conferma")');
    await page.waitForTimeout(1200);
  }
  return anyChecked;
}

async function uploadOne(page, localFilePath, targetName) {
  await deleteIfExists(page, targetName);
  await page.click('#uploadFile');
  await page.waitForTimeout(800);
  await page.fill('#namefile', targetName);
  await page.setInputFiles('#file', localFilePath);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('AjaxUpload'), { timeout: 20000 }),
    page.click('#dialog_Upload .btn-success:has-text("Conferma")'),
  ]);
  const body = await response.json().catch(() => null);
  await page.waitForTimeout(800);
  return { targetName, status: response.status(), body };
}

module.exports = { ensureLoggedIn, openResourceManager, goToMenuFolder, goToMenuEngFolder, uploadOne, deleteIfExists, CANONICAL, IMG_DIR, AUTH_PATH };
