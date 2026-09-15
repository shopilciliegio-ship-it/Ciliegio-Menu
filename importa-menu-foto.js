// Legge le foto dell'agenda di Marco in "Menù Settimana\", le manda a Claude
// (stesso lavoro di lettura/abbinamento che farebbe Claude Code in chat) e
// scrive il risultato in DB.importPending dentro menu-data.json.
// Dopo aver lanciato questo script, apri Ciliegio-Menu.html e clicca
// "📥 Importa Menù Settimana" per rivedere/confermare le bozze.

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const ROOT = __dirname;
const FOTO_DIR = path.join(ROOT, 'Menù Settimana');
const MENU_DATA_PATH = path.join(ROOT, 'menu-data.json');
const HTML_PATH = path.join(ROOT, 'Ciliegio-Menu.html');
const KEY_PATH = path.join(ROOT, 'claude-api-key.json');

const MODEL = 'claude-sonnet-5';
const PORTATE = ['antipasto', 'primo', 'secondo', 'contorno', 'dolce'];
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function fail(msg) { console.error('ERRORE: ' + msg); process.exit(1); }

if (!fs.existsSync(KEY_PATH)) fail(`manca ${KEY_PATH} — creane uno con {"apiKey":"sk-ant-..."}`);
const { apiKey } = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
if (!apiKey || apiKey.includes('INCOLLA_QUI')) fail('claude-api-key.json non contiene una chiave valida');

if (!fs.existsSync(FOTO_DIR)) fail(`cartella non trovata: ${FOTO_DIR}`);
const files = fs.readdirSync(FOTO_DIR, { withFileTypes: true })
  .filter(e => e.isFile())
  .map(e => e.name)
  .filter(n => MIME[path.extname(n).toLowerCase()]);

if (!files.length) fail(`nessuna foto trovata direttamente in "${FOTO_DIR}" (le foto vanno lì, non in sottocartelle)`);

console.log(`Trovate ${files.length} foto:`);
files.forEach(f => console.log('  - ' + f));

const menuData = JSON.parse(fs.readFileSync(MENU_DATA_PATH, 'utf8'));

const piattiList = menuData.piatti
  .map(p => `${p.id}|${p.portata}|${p.nome}`)
  .join('\n');

const oggi = new Date();
const oggiStr = oggi.toISOString().slice(0, 10);

const SYSTEM_PROMPT = `Sei l'assistente che ogni settimana trascrive il menù del ristorante "Il Ciliegio" dalle foto dell'agenda cartacea scritta a mano da Marco.

Il quaderno contiene per ogni giorno: prenotazioni, gruppi, eventi privati, e — quando presente — una sezione etichettata "SITO" (o comunque l'ultimo blocco di piatti della pagina, spesso con un prezzo totale a fine elenco) che è il menù pubblico del giorno, quello che va sul sito del ristorante.

REGOLE IMPORTANTI (frutto di sessioni precedenti, seguile alla lettera):
1. Trascrivi SOLO il menù "SITO" (pubblico) di ogni pranzo/cena, NON le liste piatti scritte per gruppi/comitive specifiche (es. menù degustazione "Michelangelo", liste con nome di un gruppo accanto, ecc.) — quelle sono per prenotazioni private, non per il sito.
2. Se un servizio (pranzo o cena di un giorno) è chiaramente un evento privato/esclusivo che chiude il ristorante (parole come "ESCLUSIVA", "COMPLETO" riferito a tutto il locale, matrimoni, eventi aziendali che occupano "tutta una sala"/"tutto il ristorante") NON includerlo affatto nel risultato — nessuna voce per quel giorno/servizio. Il sistema userà automaticamente un'immagine generica "al completo" per quei casi, quindi ometterli è la scelta corretta.
3. Se il blocco "SITO" di un giorno è incompleto (es. scritto solo l'antipasto, o manca il prezzo) NON inventare i piatti mancanti. Includi solo quello che è scritto, e aggiungi una voce con portata "primo" (o quella più sensata), stato "incerto", suggestedMatchId null, nome "⚠ MANCA IL RESTO DEL MENU", e una nota che spiega esattamente cosa manca e da dove viene la foto (giorno/servizio).
4. Se per una portata ci sono scritte esplicitamente più opzioni alternative (es. due primi entrambi elencati per lo stesso giorno), includile entrambe con stato "incerto" e una nota che spiega che erano entrambe scritte, così chi rivede può cancellare quella che non serve.
5. Se l'antipasto (o altra portata) del sito non è scritto esplicitamente ma c'è un blocco piatti ambiguo vicino (es. per un gruppo specifico) che potrebbe essere condiviso, puoi usarlo come ipotesi MA sempre con stato "incerto" e una nota che spiega l'incertezza.
6. Se una parola è illeggibile/coperta nella foto, trascrivi la tua migliore lettura e aggiungi una nota che segnala il dubbio.
7. Non includere MAI il lunedì se non c'è una foto per quel giorno (il ristorante è normalmente chiuso di lunedì).

ABBINAMENTO AI PIATTI ESISTENTI:
Ti viene fornito sotto l'elenco completo dei piatti già presenti nel database, in formato "id|portata|nome" (uno per riga). Per ogni piatto che leggi nella foto:
- Se il nome scritto corrisponde ESATTAMENTE (o quasi, es. solo abbreviato) a un piatto della lista con la stessa portata: stato "match", matchId = quell'id, nome = il nome ESATTO come appare nella lista (non come scritto a mano).
- Se assomiglia molto a un piatto della lista ma non sei sicuro sia lo stesso (nome diverso, ingrediente diverso, o abbreviazione ambigua): stato "incerto", suggestedMatchId = l'id più probabile, nome = come letto dalla foto, nota = spiega il dubbio.
- Se non c'è nulla di simile nella lista: stato "nuovo", nome = come letto dalla foto, traduzione = traduzione inglese breve e naturale del piatto, nota facoltativa.
- NON inventare MAI un id che non è nell'elenco fornito.

DATE: oggi è ${oggiStr}. Le date scritte sulle foto (es. "Martedì 15 Settembre") vanno risolte nell'anno corretto in base a oggi, in formato ISO "YYYY-MM-DD". servizio è "pranzo" o "cena" (minuscolo).

FORMATO OUTPUT — rispondi SOLO con un array JSON valido, nessun testo prima o dopo, nessun blocco markdown \`\`\`, di oggetti fatti così:
[
  {
    "data": "YYYY-MM-DD",
    "servizio": "pranzo",
    "prezzo": 32,
    "piatti": [
      { "portata": "antipasto", "nome": "...", "stato": "match", "matchId": "..." },
      { "portata": "primo", "nome": "...", "stato": "incerto", "suggestedMatchId": "...", "nota": "..." },
      { "portata": "secondo", "nome": "...", "stato": "nuovo", "traduzione": "...", "nota": "..." }
    ]
  }
]

Se una foto non contiene nessun menù SITO utilizzabile (es. solo prenotazioni/eventi privati), semplicemente non generare nessuna voce per quel giorno/servizio — non è un errore.`;

const imageBlocks = files.map(name => {
  const data = fs.readFileSync(path.join(FOTO_DIR, name));
  return {
    type: 'image',
    source: { type: 'base64', media_type: MIME[path.extname(name).toLowerCase()], data: data.toString('base64') }
  };
});

async function main() {
  const anthropic = new Anthropic({ apiKey });

  console.log(`\nInvio ${files.length} foto a Claude (${MODEL}) per la trascrizione...`);
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'disabled' },
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks,
        { type: 'text', text: `Ecco l'elenco dei piatti già esistenti (id|portata|nome):\n\n${piattiList}\n\nTrascrivi i menù SITO dalle foto sopra seguendo tutte le regole date nel system prompt. Rispondi solo con l'array JSON.` }
      ]
    }]
  });

  console.log(`stop_reason=${resp.stop_reason} content blocks=${resp.content.length} types=[${resp.content.map(b=>b.type).join(',')}] usage=${JSON.stringify(resp.usage)}`);

  const raw = resp.content.map(b => b.type === 'text' ? b.text : '').join('').trim();
  let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  let days;
  try {
    days = JSON.parse(cleaned);
  } catch (e) {
    const outPath = path.join(ROOT, 'ultima-risposta-import-raw.txt');
    fs.writeFileSync(outPath, raw, 'utf8');
    const debugPath = path.join(ROOT, 'ultima-risposta-import-full.json');
    fs.writeFileSync(debugPath, JSON.stringify(resp, null, 2), 'utf8');
    fail(`la risposta di Claude non è JSON valido (${e.message}). Risposta salvata in ${outPath}, risposta completa (debug) in ${debugPath}.`);
  }
  if (!Array.isArray(days)) fail('la risposta di Claude non è un array');

  console.log(`\nClaude ha trascritto ${days.length} giorno/servizio:`);
  days.forEach(d => {
    const counts = { match: 0, incerto: 0, nuovo: 0 };
    (d.piatti || []).forEach(p => { if (counts[p.stato] != null) counts[p.stato]++; });
    console.log(`  - ${d.data} ${d.servizio}: ${d.piatti.length} piatti (✅${counts.match} ❓${counts.incerto} 🆕${counts.nuovo}), prezzo €${d.prezzo}`);
  });

  menuData.importPending = menuData.importPending || [];
  for (const day of days) {
    const idx = menuData.importPending.findIndex(d => d.data === day.data && d.servizio === day.servizio);
    if (idx >= 0) {
      console.log(`  (sostituisco bozza già esistente per ${day.data} ${day.servizio})`);
      menuData.importPending[idx] = day;
    } else {
      menuData.importPending.push(day);
    }
  }

  fs.writeFileSync(MENU_DATA_PATH, JSON.stringify(menuData, null, 2) + '\n', 'utf8');

  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const m = html.match(/font-family:'Cinzel',serif">v(\d+)<\/div>/);
  if (m) {
    const next = parseInt(m[1], 10) + 1;
    fs.writeFileSync(HTML_PATH, html.replace(`>v${m[1]}<`, `>v${next}<`), 'utf8');
    console.log(`\nVersione app aggiornata a v${next}.`);
  }

  console.log(`\nFatto. ${days.length} giorno/servizio scritti in DB.importPending (${menuData.importPending.length} totali in attesa).`);
  console.log('Ora fai commit+push di menu-data.json e Ciliegio-Menu.html, poi apri l\'app e clicca "📥 Importa Menù Settimana".');
}

main().catch(e => fail(e.stack || e.message));
