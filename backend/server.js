// backend/server.js — GallopAI v5 Clean
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const tjkCSV    = require('./tjkCSV');
const daScrap   = require('./dijitalScraper');
const { scoreRace, calcWinProbabilities } = require('./scoreEngine');
const { analyzeRace } = require('./aiService');
const { generateAll, verify } = require('./couponEngine');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── TJK CSV ───────────────────────────────────────────────────────────────────

// GET /api/program?city=bursa&date=03.07.2026
// Şehir programını CSV'den çek, skorla ve döndür
app.get('/api/program', async (req, res) => {
  const city = (req.query.city || '').toLowerCase().trim();
  const date = (req.query.date || tjkCSV.fmtDate(new Date())).replace(/\//g, '.');

  if (!city) return res.status(400).json({ ok: false, error: 'city gerekli' });

  try {
    const data = await tjkCSV.getCityData(city, date);

    // Her koşunun atlarını skorla
    const racesWithScores = data.races.map(race => ({
      ...race,
      horses: scoreRace(race.horses, { distance: race.dist, surface: race.surf }),
    }));

    res.json({
      ok:          true,
      cityName:    data.cityName,
      date:        data.date,
      fetchedAt:   data.fetchedAt,
      fromCache:   data.fromCache || false,
      races:       racesWithScores,
      totalRaces:  racesWithScores.length,
      totalHorses: racesWithScores.reduce((s, r) => s + r.horses.length, 0),
      error:       data.error || null,
    });
  } catch (e) {
    console.error('[/api/program]', e.message);
    res.status(503).json({ ok: false, error: e.message });
  }
});

// GET /api/cities?date=03.07.2026
// Verilen tarih için hangi şehirlerin CSV'si var?
// Gelecek tarihler de desteklenir
app.get('/api/cities', async (req, res) => {
  const axios = require('axios');
  const date = (req.query.date || tjkCSV.fmtDate(new Date())).replace(/\//g, '.');
  const [dd, mm, yyyy] = date.split('.');
  const folder = `${yyyy}/${yyyy}-${mm}-${dd}`;
  const available = [];

  // Tüm şehirleri paralel olarak kontrol et (daha hızlı)
  const checks = Object.entries(tjkCSV.CITY_NAMES).map(async ([key, name]) => {
    const url = `https://medya-cdn.tjk.org/raporftp/TJKPDF/${folder}/CSV/GunlukYarisProgrami/${date}-${name}-GunlukYarisProgrami-TR.csv`;
    try {
      const r = await axios.head(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tjk.org/' },
        timeout: 6000,
      });
      if (r.status === 200) return { key, name };
    } catch {}
    return null;
  });

  const results = await Promise.all(checks);
  results.forEach(r => { if (r) available.push(r); });

  res.json({ ok: true, date, cities: available });
});

// GET /api/da/stats?city=istanbul&date=05.07.2026&race=1
app.get('/api/da/stats', async (req, res) => {
  const city   = (req.query.city || '').toLowerCase().trim();
  const date   = (req.query.date || tjkCSV.fmtDate(new Date())).replace(/\//g,'.');
  const raceNo = parseInt(req.query.race || '1');
  if (!city) return res.status(400).json({ ok:false, error:'city gerekli' });
  try {
    const data = await daScrap.fetchAllStats(date, city, raceNo);
    res.json({ ok:true, date, city, raceNo, ...data });
  } catch(e) {
    res.status(503).json({ ok:false, error: e.message });
  }
});

// GET /api/da/sort?city=istanbul&date=08.07.2026&race=1&tab=at&col=genel&dir=desc
app.get('/api/da/sort', async (req, res) => {
  const { city='', date='', race='1', tab='at', col='rating', dir='desc' } = req.query;
  if (!city || !date) return res.status(400).json({ ok:false, error:'city ve date gerekli' });
  try {
    const rows = await daScrap.fetchSorted(
      date.replace(/\//g,'.'), city.toLowerCase(),
      parseInt(race), tab, col, dir
    );
    res.json({ ok:true, rows, count: rows?.length || 0 });
  } catch(e) {
    res.status(503).json({ ok:false, error: e.message });
  }
});

// GET /api/da/analiz?city=istanbul&date=08.07.2026&race=1
// Doğrudan DA HTML'den Koşu Analiz verilerini çek (Puppeteer olmadan)
app.get('/api/da/analiz', async (req, res) => {
  const { city='', date='', race='1' } = req.query;
  if (!city || !date) return res.status(400).json({ ok:false, error:'eksik parametre' });
  
  const ASPXAUTH = '18F8713A40DB11EF295BB569198FAEC3BE325C71D1E3DA7776307FA746469A0DCBACED7175944A9D17B907CB88AAAE6FB79BEBABDDA3DD5A012797AF35013DC16AB87E39B08DECB98AC5B0A4BA39D9EE4DC3A5FBBAB3EF00F0F06D7FED2C1864BE1D7E506142D48651B937B691D8A5CF4A7A8DE5E0A7B7319DF0323196751A04FF9990F7';
  
  try {
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    const r = await axios.post('https://www.dijitalanaliz.com/AtYarisi/CallBackAnalizGrid', 
      new URLSearchParams({
        DXCallbackName: 'gridAnaliz',
        DXCallbackArgument: `c0:KV|7;['1','2','3','4','5','6','7'];GB|22;${race}|SORT1|20|3|ASC4|true;`,
        reset: 'true',
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': `.ASPXAUTH=${ASPXAUTH}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Referer': 'https://www.dijitalanaliz.com/AtYarisi/AnalizPaneli',
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 15000,
      }
    );
    
    const $ = cheerio.load(r.data);
    const rows = [];
    console.log('[DA Analiz] Response size:', r.data.length);
    // Check for data rows
    const trCount = $('tr').length;
    console.log('[DA Analiz] TR count:', trCount);
    // First tr cells
    const firstTr = $('tr').first();
    console.log('[DA Analiz] First TR cells:', firstTr.find('td').map((i,td)=>$(td).text().trim().slice(0,15)).get().slice(0,5));
    
    $('tr').each((i, row) => {
      const cells = $(row).find('td').map((j, td) => $(td).text().replace(/\s+/g,' ').trim()).get();
      const no = parseInt(cells[0]);
      if (!no || no < 1 || no > 30 || cells.length < 12) return;
      const rating = parseInt(cells[11]);
      if (isNaN(rating)) return;
      
      rows.push({
        no,
        rating,
        dijital_derece: cells[12] !== '-' ? cells[12] : null,
        dijital_galop:  cells[13] !== '-' ? parseFloat((cells[13]||'').replace(',','.')) || 0 : 0,
        sart_uyumu:     cells[10] !== '-' ? parseInt((cells[10]||'').replace(/[^-\d]/g,'')) || 0 : 0,
        hp:             cells[14] !== '-' ? parseInt(cells[14]) || 0 : 0,
      });
    });
    
    res.json({ ok:true, rows, count: rows.length });
  } catch(e) {
    res.status(503).json({ ok:false, error: e.message });
  }
});

// POST /api/analyze
// Bir koşunun atlarını AI ile analiz et
app.post('/api/analyze', async (req, res) => {
  const { race, horses } = req.body;
  if (!horses || horses.length < 2)
    return res.status(400).json({ ok: false, error: 'En az 2 at gerekli' });

  if (!process.env.AI_API_KEY)
    return res.status(503).json({ ok: false, error: 'AI_API_KEY ayarlı değil' });

  try {
    const raceData = {
      track:     race?.cityName || 'Bilinmiyor',
      race_date: race?.date || tjkCSV.fmtDate(new Date()),
      race_no:   race?.no || 1,
      distance:  race?.dist || 0,
      surface:   race?.surf || 'kuru',
      weather:   race?.weather || null,
    };

    const analysis = await analyzeRace(raceData, horses);

    res.json({
      ok:         true,
      ranking:    analysis.ranking,
      summary:    analysis.summary,
      confidence: analysis.confidence,
    });
  } catch (e) {
    console.error('[/api/analyze]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/coupon
// Kupon hesapla
app.post('/api/coupon', (req, res) => {
  const { ranking } = req.body;
  if (!ranking || ranking.length < 6)
    return res.status(400).json({ ok: false, error: 'En az 6 at gerekli' });

  try {
    const coupons = generateAll(ranking);
    res.json({ ok: true, coupons });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🐎 GallopAI v5 → http://localhost:${PORT}`);
  console.log(`   AI: ${process.env.AI_API_KEY ? '✓ Hazır' : '✗ API key yok'}\n`);
});
