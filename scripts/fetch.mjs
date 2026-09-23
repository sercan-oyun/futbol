// Futbol: veriyi GitHub Actions içinde çeker, data/all.json dosyasına yazar.
// Anahtarlar ortam değişkeninden gelir, tarayıcıya hiç inmez.
//   FD_TOKEN -> football-data.org (Premier Lig, La Liga, Bundesliga, Serie A, Ligue 1, Şampiyonlar Ligi)
//   AF_KEY   -> api-football     (Süper Lig, Avrupa Ligi)
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const OUT = 'data/all.json';
const TV = JSON.parse(await readFile('config/tv.json', 'utf8').catch(() => '{}'));
const FD_TOKEN = process.env.FD_TOKEN || '';
const AF_KEY = process.env.AF_KEY || '';
const DAYS_BACK = 14, DAYS_FWD = 28;

const FD_LEAGUES = [
  { code: 'SL',  name: 'Süper Lig',        short: 'Süper Lig', src: 'af', af: 203, kind: 'league' },
  { code: 'CL',  name: 'Şampiyonlar Ligi', short: 'Ş. Ligi',   src: 'fd', fd: 'CL', kind: 'cup' },
  { code: 'EL',  name: 'Avrupa Ligi',      short: 'Avr. Ligi', src: 'af', af: 3,   kind: 'cup' },
  { code: 'PL',  name: 'Premier Lig',      short: 'Premier',   src: 'fd', fd: 'PL', kind: 'league' },
  { code: 'PD',  name: 'La Liga',          short: 'La Liga',   src: 'fd', fd: 'PD', kind: 'league' },
  { code: 'SA',  name: 'Serie A',          short: 'Serie A',   src: 'fd', fd: 'SA', kind: 'league' },
  { code: 'BL1', name: 'Bundesliga',       short: 'Bundesliga',src: 'fd', fd: 'BL1',kind: 'league' },
  { code: 'FL1', name: 'Ligue 1',          short: 'Ligue 1',   src: 'fd', fd: 'FL1',kind: 'league' },
];

const iso = d => d.toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = new Date();
const from = iso(new Date(today.getTime() - DAYS_BACK * 864e5));
const to   = iso(new Date(today.getTime() + DAYS_FWD  * 864e5));
// api-football sezon numarası: Ağustos'ta başlayan sezon başlangıç yılıyla anılır
const AF_SEASON = today.getMonth() + 1 >= 7 ? today.getFullYear() : today.getFullYear() - 1;

async function getJSON(url, headers, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers });
      if (r.status === 429) { await sleep(20000); continue; }
      if (!r.ok) {
        const body = (await r.text().catch(() => '')).slice(0, 300);
        throw new Error(`${r.status} ${r.statusText} — ${url.replace(/\?.*/, '')} — cevap: ${body}`);
      }
      return await r.json();
    } catch (e) {
      if (i === tries) throw e;
      await sleep(3000 * i);
    }
  }
}

// ---------- football-data.org ----------
const FD_STATUS = { FINISHED: 'bitti', IN_PLAY: 'oynaniyor', PAUSED: 'oynaniyor', TIMED: 'bekliyor',
  SCHEDULED: 'bekliyor', POSTPONED: 'ertelendi', SUSPENDED: 'ertelendi', CANCELLED: 'iptal', AWARDED: 'bitti' };

async function fdLeague(L) {
  const H = { 'X-Auth-Token': FD_TOKEN };
  const base = `https://api.football-data.org/v4/competitions/${L.fd}`;
  // takımların ev sahibi stadyumları (maç cevabında stat gelmiyor)
  const venues = {};
  try {
    const tj = await getJSON(`${base}/teams`, H);
    for (const t of (tj.teams || [])) { if (t.venue) { venues[t.id] = t.venue; } }
    await sleep(7000);
  } catch { /* stat bilgisi olmasa da olur */ }
  const mj = await getJSON(`${base}/matches?season=${AF_SEASON}`, H);
  await sleep(7000);
  const sj = await getJSON(`${base}/standings`, H);
  await sleep(7000);
  let scorers = [];
  try {
    const cj = await getJSON(`${base}/scorers?limit=10`, H);
    scorers = (cj.scorers || []).map(s => ({ name: s.player?.name, team: s.team?.shortName || s.team?.name, goals: s.goals ?? 0 }));
  } catch { /* gol krallığı yoksa sorun değil */ }

  const matches = (mj.matches || []).filter(m => m.utcDate >= from && m.utcDate <= to + 'T23:59').map(m => ({
    id: 'fd' + m.id,
    utc: m.utcDate,
    status: FD_STATUS[m.status] || 'bekliyor',
    round: m.matchday ? `${m.matchday}. hafta` : (m.stage ? stageTR(m.stage) : ''),
    home: m.homeTeam?.name || m.homeTeam?.shortName || '?',
    away: m.awayTeam?.name || m.awayTeam?.shortName || '?',
    hc: m.homeTeam?.crest || '', ac: m.awayTeam?.crest || '',
    hs: m.score?.fullTime?.home ?? null, as: m.score?.fullTime?.away ?? null,
    venue: m.venue || venues[m.homeTeam?.id] || '',
    tv: TV[L.code] || '',
  }));

  const groups = (sj.standings || []).filter(s => s.type === 'TOTAL').map(s => ({
    title: s.group ? s.group.replace(/_/g, ' ') : '',
    rows: (s.table || []).map(t => ({
      pos: t.position, team: t.team?.name || t.team?.shortName, crest: t.team?.crest || '',
      p: t.playedGames, w: t.won, d: t.draw, l: t.lost, gf: t.goalsFor, ga: t.goalsAgainst,
      gd: t.goalDifference, pts: t.points, form: t.form || '',
    })),
  }));
  return { matches, groups, scorers, season: sj.season?.startDate?.slice(0, 4) || '' };
}

function stageTR(s) {
  const m = { LEAGUE_STAGE: 'Lig aşaması', GROUP_STAGE: 'Grup aşaması', LAST_16: 'Son 16', QUARTER_FINALS: 'Çeyrek final',
    SEMI_FINALS: 'Yarı final', FINAL: 'Final', PLAYOFFS: 'Playoff', PLAYOFF_ROUND_OF_16: 'Playoff' };
  return m[s] || s.replace(/_/g, ' ').toLowerCase();
}

// ---------- api-football ----------
const AF_SHORT = { 'FINISHED': 'bitti' };
function afStatus(s) {
  if (['FT', 'AET', 'PEN'].includes(s)) return 'bitti';
  if (['1H', '2H', 'HT', 'ET', 'P', 'LIVE', 'BT'].includes(s)) return 'oynaniyor';
  if (['PST', 'SUSP', 'INT'].includes(s)) return 'ertelendi';
  if (['CANC', 'ABD', 'AWD', 'WO'].includes(s)) return 'iptal';
  return 'bekliyor';
}
async function afLeague(L) {
  const H = { 'x-apisports-key': AF_KEY };
  const base = 'https://v3.football.api-sports.io';
  const fj = await getJSON(`${base}/fixtures?league=${L.af}&season=${AF_SEASON}&from=${from}&to=${to}`, H);
  const afErr = j => { const e = j?.errors; if (e && (Array.isArray(e) ? e.length : Object.keys(e).length)) throw new Error('api-football: ' + JSON.stringify(e).slice(0, 220)); };
  afErr(fj);
  const sj = await getJSON(`${base}/standings?league=${L.af}&season=${AF_SEASON}`, H);
  afErr(sj);
  let scorers = [];
  try {
    const tj = await getJSON(`${base}/players/topscorers?league=${L.af}&season=${AF_SEASON}`, H);
    scorers = (tj.response || []).slice(0, 10).map(x => ({
      name: x.player?.name, team: x.statistics?.[0]?.team?.name, goals: x.statistics?.[0]?.goals?.total ?? 0 }));
  } catch { /* olmasa da olur */ }

  const matches = (fj.response || []).map(f => ({
    id: 'af' + f.fixture?.id,
    utc: f.fixture?.date,
    status: afStatus(f.fixture?.status?.short),
    round: (f.league?.round || '').replace('Regular Season - ', '').replace(/^(\d+)$/, '$1. hafta'),
    home: f.teams?.home?.name || '?', away: f.teams?.away?.name || '?',
    hc: f.teams?.home?.logo || '', ac: f.teams?.away?.logo || '',
    hs: f.goals?.home ?? null, as: f.goals?.away ?? null,
    venue: [f.fixture?.venue?.name, f.fixture?.venue?.city].filter(Boolean).join(', '),
    tv: TV[L.code] || '',
  }));

  const groups = [];
  for (const table of (sj.response?.[0]?.league?.standings || [])) {
    groups.push({
      title: table[0]?.group && !/regular season/i.test(table[0].group) ? table[0].group : '',
      rows: table.map(t => ({
        pos: t.rank, team: t.team?.name, crest: t.team?.logo || '',
        p: t.all?.played, w: t.all?.win, d: t.all?.draw, l: t.all?.lose,
        gf: t.all?.goals?.for, ga: t.all?.goals?.against, gd: t.goalsDiff, pts: t.points,
        form: (t.form || '').split('').join(','),
      })),
    });
  }
  return { matches, groups, scorers, season: String(AF_SEASON) };
}

// ---------- ana akış ----------
let prev = { leagues: {} };
try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* ilk çalıştırma */ }
const prevLeagues = Object.fromEntries((prev.leagues || []).map ? (prev.leagues || []).map(l => [l.code, l]) : Object.entries(prev.leagues || {}));

const out = { updated: new Date().toISOString(), demo: false, leagues: [], errors: [] };
for (const L of FD_LEAGUES) {
  const useFd = L.src === 'fd' && FD_TOKEN, useAf = L.src === 'af' && AF_KEY;
  try {
    if (!useFd && !useAf) throw new Error(`anahtar yok (${L.src.toUpperCase()})`);
    const d = useFd ? await fdLeague(L) : await afLeague(L);
    if (!d.matches.length && !d.groups.length) throw new Error('boş cevap');
    out.leagues.push({ code: L.code, name: L.name, short: L.short, kind: L.kind, stale: false, ...d });
    console.log(`✓ ${L.name}: ${d.matches.length} maç, ${d.groups.reduce((a, g) => a + g.rows.length, 0)} sıra, ${d.scorers.length} golcü`);
  } catch (e) {
    const old = prevLeagues[L.code];
    console.error(`✗ ${L.name}: ${e.message}`);
    out.errors.push(`${L.name}: ${e.message}`);
    if (old) out.leagues.push({ ...old, stale: true });   // eski veriyi koru
    else out.leagues.push({ code: L.code, name: L.name, short: L.short, kind: L.kind, stale: true, matches: [], groups: [], scorers: [], season: '' });
  }
}
await mkdir('data', { recursive: true });
await writeFile(OUT, JSON.stringify(out));
console.log(`\ndata/all.json yazıldı (${(JSON.stringify(out).length / 1024).toFixed(0)} KB), hata: ${out.errors.length}`);
if (out.leagues.every(l => l.stale)) process.exit(1);
