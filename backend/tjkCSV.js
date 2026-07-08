// backend/tjkCSV.js v4 — Robust CSV Parser
'use strict';

const axios = require('axios');
const cron  = require('node-cron');

const CDN = 'https://medya-cdn.tjk.org/raporftp/TJKPDF';

const CITY_NAMES = {
  istanbul:   'İstanbul',
  bursa:      'Bursa',
  ankara:     'Ankara',
  izmir:      'İzmir',
  adana:      'Adana',
  kocaeli:    'Kocaeli',
  elazig:     'Elazığ',
  antalya:    'Antalya',
  diyarbakir: 'Diyarbakır',
  sanliurfa:  'Şanlıurfa',
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer':    'https://www.tjk.org/',
};

const CSV_CACHE = {};

function fmtDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return [String(dt.getDate()).padStart(2,'0'), String(dt.getMonth()+1).padStart(2,'0'), dt.getFullYear()].join('.');
}

async function downloadCSV(cityKey, dateStr) {
  const cityName = CITY_NAMES[cityKey] || cityKey;
  const [dd, mm, yyyy] = dateStr.split('.');
  const folder = `${yyyy}/${yyyy}-${mm}-${dd}`;
  const url = `${CDN}/${folder}/CSV/GunlukYarisProgrami/${dateStr}-${cityName}-GunlukYarisProgrami-TR.csv`;
  console.log('[CSV] URL:', url);
  const res = await axios.get(url, {
    headers: HEADERS, timeout: 15000, responseType: 'arraybuffer',
  });
  return Buffer.from(res.data).toString('utf8').replace(/^\uFEFF/, '');
}

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.replace(/\r/g, ''));
  const races = [];
  let currentRace = null;
  let headerLine = null;
  let headerCols = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(';');

    // ── Koşu başlık satırı ──────────────────────────────────────────────────
    // Format 1: "1. Kosu :   13.30;..."  (normal)
    // Format 2: "6. Kosu :  TSYD KOŞUSU 16.00;..."  (isimli koşu)
    const kosuMatch = cols[0].match(/^(\d+)\.\s*[Kk]o[şs]u\s*[:\-]?\s*(?:[A-ZÇŞĞÜÖİa-zçşğüöı\s\.]*?)(\d{1,2}[:.]\d{2})/i);

    if (kosuMatch) {
      if (currentRace) races.push(currentRace);
      headerLine = null;
      headerCols = null;

      const distM = cols.find(c => c.match(/\d{3,4}\s*m/i))?.match(/(\d{3,4})\s*m/i);
      const surf  = cols.find(c => /çim|cim|kum|sentetik/i.test(c)) || '';
      const type  = cols.filter(c => c.trim() && !c.match(/^\d/) && !c.includes('kg') && !c.match(/\d{3,4}m/i) && !c.match(/çim|cim|kum|sen/i)).slice(1,3).join(' ').trim();

      // İsimli koşu adını al
      const raceNameMatch = cols[0].match(/^(\d+)\.\s*Ko[şs]u\s*[:\-]?\s*([A-ZÇŞĞÜÖİ][A-ZÇŞĞÜÖİa-zçşğüöı\s\.]+?)\s+\d{1,2}[:.]\d{2}/i);
      const raceName = raceNameMatch ? raceNameMatch[2].trim() : '';

      currentRace = {
        no:     parseInt(kosuMatch[1]),
        label:  `${kosuMatch[1]}.Koşu`,
        name:   raceName,
        time:   kosuMatch[2].replace('.',':'),
        dist:   distM ? parseInt(distM[1]) : 0,
        surf:   normalizeSurf(surf),
        type:   (raceName ? raceName + ' — ' : '') + type.slice(0, 60),
        prize:  null,
        horses: [],
      };
      continue;
    }

    if (!currentRace) continue;

    // ── İkramiye satırı ──────────────────────────────────────────────────────
    if (cols[0].match(/^[İi]kramiye|^Ikramiye/)) continue;

    // ── Para ödülü satırı ────────────────────────────────────────────────────
    if (cols[0].match(/^\d+\.\)/)) {
      currentRace.prize = cols[0];
      continue;
    }

    // ── Header satırı ────────────────────────────────────────────────────────
    if (cols[0].match(/^At\s*No/i) || cols[0].match(/^S[iı]ra\s*No/i) || cols[0].match(/^No$/i)) {
      headerCols = cols.map(c => c.trim());
      headerLine = i;
      continue;
    }

    // ── At satırı ────────────────────────────────────────────────────────────
    const noStr = cols[0].trim();
    const no    = parseInt(noStr);
    if (!no || no < 1 || no > 30) continue;
    if (noStr !== String(no)) continue; // Sadece tam sayı

    // At adı ve bilgilerini parse et
    let horse;

    if (headerCols) {
      // Header varsa mapping yap
      const row = {};
      headerCols.forEach((h, idx) => { row[h] = (cols[idx] || '').trim(); });

      horse = {
        horse_no:    no,
        horse_name:  cleanName(row['At İsmi'] || row['At Ismi'] || row['AtAdi'] || cols[1]),
        age:         (row['Yaş'] || row['Yas'] || cols[2] || '').trim(),
        father:      cleanName(row['Orijin(Baba)'] || row['Baba'] || cols[3]),
        mother:      cleanName(row['Orijin(Anne)'] || row['Anne'] || cols[4]),
        weight:      parseWeight(row['Kilo'] || cols[5]),
        jockey:      cleanName(row['Jokey Adı'] || row['Jokey Adi'] || cols[6]),
        owner:       cleanName(row['Sahip Adı'] || row['Sahip Adi'] || cols[7]),
        trainer:     cleanName(row['Antrenör Adı'] || row['Antrenor Adi'] || cols[8]),
        start_no:    parseInt((row['St'] || cols[9] || '').split('-')[0].split('+')[0]) || null,
        agf:         (row['AGF'] || cols[10] || '').trim() || null,
        handicap:    parseInt(row['H'] || row['HC'] || cols[11]) || null,
        last_6:      (row['Son 6 Yarış'] || row['Son6'] || cols[12] || '').trim() || null,
        kgs:         parseInt(row['KGS'] || cols[13]) || null,
        s20:         parseInt(row['s20'] || row['S20'] || cols[14]) || null,
        degree:      (row['EnİyiDerece'] || row['Derece'] || cols[15] || '').trim() || null,
      };
    } else {
      // Header yoksa pozisyona göre - birleşik format
      // Format: No;AtAdi Yas;Baba;Anne;Kilo+fark;Jokey;Sahip;Antrenor;...
      // veya: No;AtAdi;Yas;Baba;Anne;Kilo;Jokey;...
      
      // At adında yaş var mı? "ASİ KADIN KG SK;3y a d" formatı
      let atName = cleanName(cols[1]);
      let age    = '';
      
      // Eğer cols[2] yaş formatındaysa
      if (cols[2] && cols[2].match(/^\d+y/i)) {
        age = cols[2].trim();
        horse = {
          horse_no:  no,
          horse_name: atName,
          age:       age,
          father:    cleanName(cols[3]),
          mother:    cleanName(cols[4]),
          weight:    parseWeight(cols[5]),
          jockey:    cleanName(cols[6]),
          owner:     cleanName(cols[7]),
          trainer:   cleanName(cols[8]),
          start_no:  parseInt((cols[9]||'').split('-')[0].split('+')[0]) || null,
          agf:       (cols[10]||'').trim()||null,
          handicap:  parseInt(cols[11])||null,
          last_6:    (cols[12]||'').trim()||null,
          kgs:       parseInt(cols[13])||null,
          s20:       parseInt(cols[14])||null,
          degree:    (cols[15]||'').trim()||null,
        };
      } else {
        // Eski format - at adı + ek bilgiler birleşik
        horse = {
          horse_no:  no,
          horse_name: atName,
          age:       (cols[2]||'').trim(),
          father:    cleanName(cols[3]),
          mother:    cleanName(cols[4]),
          weight:    parseWeight(cols[5]),
          jockey:    cleanName(cols[6]),
          owner:     cleanName(cols[7]),
          trainer:   cleanName(cols[8]),
          start_no:  parseInt((cols[9]||'').split('-')[0].split('+')[0]) || null,
          agf:       (cols[10]||'').trim()||null,
          handicap:  parseInt(cols[11])||null,
          last_6:    (cols[12]||'').trim()||null,
          kgs:       parseInt(cols[13])||null,
          s20:       parseInt(cols[14])||null,
          degree:    (cols[15]||'').trim()||null,
        };
      }
    }

    // At adını temizle
    if (horse.horse_name) {
      horse.horse_name = horse.horse_name
        .replace(/\s+(DB|SK|KK|KG|GKR|SKG|SKR)\s*/g, ' ')
        .replace(/\s+$/, '')
        .trim();
    }

    if (horse.horse_name && horse.horse_name.length > 1) {
      currentRace.horses.push(horse);
    }
  }

  if (currentRace) races.push(currentRace);

  // Boş koşuları filtrele
  return races.filter(r => r.horses.length > 0);
}

function parseWeight(str) {
  if (!str) return null;
  // "57 +0.60" veya "57,0" veya "57.5"
  const m = String(str).match(/^(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',','.')) : null;
}

function normalizeSurf(s) {
  const t = s.toLowerCase();
  if (/çim|cim/.test(t))         return 'cim';
  if (/ıslak|islak/.test(t))     return 'islak';
  if (/yumuşak|yumusak/.test(t)) return 'yumusak';
  if (/iyi/.test(t))             return 'iyi';
  if (/sentetik/.test(t))        return 'sentetik';
  return 'kuru';
}

function cleanName(s) {
  return (s || '').replace(/"/g, '').replace(/\s+/g, ' ').trim() || null;
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────
async function getCityData(cityKey, dateStr) {
  dateStr = (dateStr || fmtDate(new Date())).replace(/\//g, '.');
  const ck = `csv:${cityKey}:${dateStr}`;

  if (CSV_CACHE[ck] && Date.now() - CSV_CACHE[ck].ts < 30*60*1000) {
    return { ...CSV_CACHE[ck].data, fromCache: true };
  }

  try {
    const text  = await downloadCSV(cityKey, dateStr);
    const races = parseCSV(text);
    const result = {
      cityKey,
      cityName:    CITY_NAMES[cityKey] || cityKey,
      date:        dateStr,
      races,
      fetchedAt:   new Date().toISOString(),
      totalHorses: races.reduce((s, r) => s + r.horses.length, 0),
    };
    CSV_CACHE[ck] = { data: result, ts: Date.now() };
    console.log(`[CSV] ${result.cityName}: ${races.length} koşu, ${result.totalHorses} at`);
    return result;
  } catch(e) {
    console.warn(`[CSV] ${cityKey} ${dateStr}:`, e.message);
    return { cityKey, cityName: CITY_NAMES[cityKey]||cityKey, date: dateStr, races: [], error: e.message };
  }
}

async function getAllCitiesCSV(dateStr) {
  dateStr = (dateStr || fmtDate(new Date())).replace(/\//g, '.');
  const results = [];
  for (const [key] of Object.entries(CITY_NAMES)) {
    await new Promise(r => setTimeout(r, 400));
    const data = await getCityData(key, dateStr);
    if (data.races?.length > 0) results.push(data);
  }
  return {
    date: dateStr,
    cities: results,
    totalRaces:  results.reduce((s,c) => s + c.races.length, 0),
    totalHorses: results.reduce((s,c) => s + c.totalHorses, 0),
    fetchedAt: new Date().toISOString(),
  };
}

function getCacheStatus() {
  return { keys: Object.keys(CSV_CACHE), count: Object.keys(CSV_CACHE).length };
}

function startCron() {
  cron.schedule('*/30 * * * *', async () => {
    const today = fmtDate(new Date());
    Object.keys(CSV_CACHE).forEach(k => delete CSV_CACHE[k]);
    await getAllCitiesCSV(today);
  });
  console.log('[CSV] Cron aktif');
}

module.exports = { getCityData, getAllCitiesCSV, getCacheStatus, fmtDate, startCron, CITY_NAMES };
