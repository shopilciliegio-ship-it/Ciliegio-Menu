// ciliegio-menu-timer.js — timer esterno (Cloudflare Worker) per la pubblicazione
// automatica del menù della settimana. Stesso identico schema di
// CiliegioSocialMedia/timer-cloudflare/worker.js e di
// crm-importatori/timer-cloudflare/crm-importatori-timer.js — un Worker dedicato per
// repo (token/permessi separati), perché il cron `schedule` di GitHub Actions parte
// con ore di ritardo (vedi memoria "github-actions-cron-unreliable-external-timer").
//
// Un solo job: la domenica sera guarda l'ora vera di Roma e, quando sono le 21:00,
// lancia workflow_dispatch su promuovi-menu-settimana.yml (repo Ciliegio-Menu). Quel
// workflow non fa nulla se Luca non ha segnato una bozza "pronta" nell'app — quindi
// lanciarlo anche a vuoto (es. doppio trigger nella stessa finestra) è innocuo.
//
// Cron trigger da impostare nel pannello Cloudflare (Triggers): "0 19,20 * * 0"
// (UTC, solo domenica). Copre sia l'ora legale (21:00 Roma = 19 UTC) sia l'ora
// solare (21:00 Roma = 20 UTC) senza bisogno di aggiornarlo il giorno del cambio ora.
//
// Segreti (Worker → Settings → Variables and Secrets, tipo "Secret"):
//   GITHUB_TOKEN  token fine-grained GitHub, SOLO repo Ciliegio-Menu, permesso Actions: Read and write
//   TEST_KEY      una stringa a caso, per la pagina di prova /test/<TEST_KEY>
// Pagina /status: dice se il Worker è attivo e se i segreti gli sono arrivati (mai i valori).

const segreto = v => (typeof v === 'string' ? v.trim() : '');

const OWNER = 'shopilciliegio-ship-it';
const REPO  = 'Ciliegio-Menu';
const BRANCH = 'main';
const WORKFLOW = 'promuovi-menu-settimana.yml';

function romeNow(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(date).map(p => [p.type, p.value])
  );
  return { weekday: parts.weekday, hour: parseInt(parts.hour, 10) % 24, minute: parseInt(parts.minute, 10) };
}

function daLanciare(r) {
  return r.weekday === 'Sun' && r.hour === 21 && r.minute < 15;
}

async function dispatch(env) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${segreto(env.GITHUB_TOKEN)}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ciliegio-menu-timer',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ref: BRANCH, inputs: {} })
    });
    if (res.status === 204) return `OK: lanciato ${WORKFLOW}, tentativo ${tentativo}`;
    const testo = (await res.text()).slice(0, 300);
    if (res.status < 500 && res.status !== 429) throw new Error(`GitHub ha risposto ${res.status} per ${WORKFLOW}: ${testo}`);
    await new Promise(r => setTimeout(r, 2000 * tentativo));
  }
  throw new Error(`GitHub non raggiungibile per ${WORKFLOW} dopo 3 tentativi`);
}

export default {
  async scheduled(event, env) {
    const r = romeNow(new Date(event.scheduledTime));
    if (!daLanciare(r)) {
      console.log(`Niente da lanciare: a Roma sono ${r.weekday} ${r.hour}:${String(r.minute).padStart(2, '0')}.`);
      return;
    }
    console.log(await dispatch(env));
  },

  async fetch(request, env) {
    const [, sezione, chiave] = new URL(request.url).pathname.split('/');
    if (sezione === 'status') {
      const r = romeNow(new Date());
      return new Response([
        'Worker attivo.',
        `GITHUB_TOKEN: ${segreto(env.GITHUB_TOKEN) ? 'impostato' : 'MANCANTE'}`,
        `TEST_KEY: ${segreto(env.TEST_KEY) ? 'impostata' : 'MANCANTE'}`,
        `Ora a Roma: ${r.weekday} ${r.hour}:${String(r.minute).padStart(2, '0')}`,
        'Lancia promuovi-menu-settimana.yml la domenica alle 21:00 Roma.'
      ].join('\n') + '\n');
    }
    if (sezione !== 'test' || !segreto(env.TEST_KEY) || chiave !== segreto(env.TEST_KEY)) return new Response('Not found', { status: 404 });
    try {
      return new Response(await dispatch(env) + '\n');
    } catch (err) {
      return new Response(`ERRORE: ${err.message}\n`, { status: 502 });
    }
  }
};
