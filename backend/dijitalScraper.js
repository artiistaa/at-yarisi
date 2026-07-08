'use strict';
const puppeteer = require('puppeteer');

const BASE     = 'https://www.dijitalanaliz.com';
const ASPXAUTH = '18F8713A40DB11EF295BB569198FAEC3BE325C71D1E3DA7776307FA746469A0DCBACED7175944A9D17B907CB88AAAE6FB79BEBABDDA3DD5A012797AF35013DC16AB87E39B08DECB98AC5B0A4BA39D9EE4DC3A5FBBAB3EF00F0F06D7FED2C1864BE1D7E506142D48651B937B691D8A5CF4A7A8DE5E0A7B7319DF0323196751A04FF9990F7';

const CITY_MAP = {
  istanbul:'İstanbul', ankara:'Ankara', izmir:'İzmir', bursa:'Bursa',
  adana:'Adana', kocaeli:'Kocaeli', elazig:'Elazığ', antalya:'Antalya',
  diyarbakir:'Diyarbakır', sanliurfa:'Şanlıurfa',
};

const cache = {};

// DOM'dan direkt oku - column index bilinen
function parseGridDOM(rows, key) {
  // Format: [0]=SıraNo [1]=AtAdı [2]=Genel [3]=Şehir [4]=Pist [5]=Mesafe [6]=Form
  //         [7]=Kilo [8]=PistMes [9]=BabaPist [10]=AnnePist [11]=KardeşPist
  //         [12]=BabaMes [13]=AnneMes [14]=AtBin [15]=AtAntr [16]=AtSahip [17]=Rating
  
  // Jokey: [0]=No [1]=Ad [2]=Jokey [3]=JokeyAt [4]=Genel [5]=Şehir [6]=Form [7]=JokeyAntr [8]=JokeySahip [9]=Rating
  // Antrenör: [0]=No [1]=Ad [2]=Antr [3]=AntrAt [4]=Genel [5]=Şehir [6]=AntrBin [7]=AntrSahip [8]=Rating
  // Sahip: [0]=No [1]=Ad [2]=Sahip [3]=SahipAt [4]=Genel [5]=Şehir [6]=SahipBin [7]=SahipAntr [8]=Rating

  const g = (row, i) => parseInt(row[i]) || 0;

  return rows.map(row => {
    const no = parseInt(row[0]);
    const name = (row[1]||'').trim();
    if (!no || !name || name.length < 2) return null;

    // Koşu Analiz ek veriler - dijital_derece, galop vb.
    // Bu veriler main gridAnaliz'den geliyor, ayrıca çekilecek
    if (key === 'at') return {
      horse_no: no, horse_name: name,
      da_genel:    g(row, 2),  da_sehir:    g(row, 3),
      da_pist:     g(row, 4),  da_mesafe:   g(row, 5),
      da_form:     g(row, 6),  da_kilo:     g(row, 7),
      da_pist_mes: g(row, 8),  da_baba_pist:g(row, 9),
      da_anne_pist:g(row,10),  da_k_pist:   g(row,11),
      da_baba_mes: g(row,12),  da_anne_mes: g(row,13),
      da_at_bin:   g(row,14),  da_at_antr:  g(row,15),
      da_at_sahip: g(row,16),  da_rating:   g(row,18),
    };
    if (key === 'jokey') return {
      // 0=No 1=Ad 2=Jokey 3=JokeyAt 4=Genel 5=Şehir 6=Form 7=JokeyAntr 8=JokeySahip 9=Rating
      horse_no: no, horse_name: name,
      da_jokey:       row[2]||'',
      da_jokey_at:    g(row,3),  da_genel:        g(row,4),
      da_sehir:       g(row,5),  da_form:         g(row,6),
      da_jokey_antr:  g(row,7),  da_jokey_sahip:  g(row,8),
      da_rating:      g(row,9),
    };
    if (key === 'antrenor') return {
      // 0=No 1=Ad 2=Antrenör 3=AntrAt 4=Genel 5=Şehir 6=AntrBin 7=AntrSahip 8=Rating
      horse_no: no, horse_name: name,
      da_antrenor:    row[2]||'',
      da_antr_at:     g(row,3),  da_genel:       g(row,4),
      da_sehir:       g(row,5),  da_antr_bin:    g(row,6),
      da_antr_sahip:  g(row,7),  da_rating:      g(row,8),
    };
    if (key === 'sahip') return {
      // 0=No 1=Ad 2=Sahip 3=SahipAt 4=Genel 5=Şehir 6=SahipBin 7=SahipAntr 8=Rating
      horse_no: no, horse_name: name,
      da_sahip:       row[2]||'',
      da_sahip_at:    g(row,3),  da_genel:        g(row,4),
      da_sehir:       g(row,5),  da_sahip_bin:    g(row,6),
      da_sahip_antr:  g(row,7),  da_rating:       g(row,8),
    };
    return null;
  }).filter(Boolean);
}

// Column mapping for DA sort
const DA_SORT_COLS = {
  at: {
    'genel':2,'sehir':3,'pist':4,'mesafe':5,'form':6,'kilo':7,
    'pist_mes':8,'baba_pist':9,'anne_pist':10,'k_pist':11,
    'baba_mes':12,'anne_mes':13,'at_bin':14,'at_antr':15,'at_sahip':16,'rating':18,
  },
  jokey: { 'jokey_at':3,'genel':4,'sehir':5,'form':6,'jokey_antr':7,'jokey_sahip':8,'rating':9 },
  antrenor: { 'antr_at':3,'genel':4,'sehir':5,'antr_bin':6,'antr_sahip':7,'rating':8 },
  sahip: { 'sahip_at':3,'genel':4,'sehir':5,'sahip_bin':6,'sahip_antr':7,'rating':8 },
};

const GRID_NAMES = {
  at:'gridIstatistikAt', jokey:'gridIstatistikJokey',
  antrenor:'gridIstatistikAntrenor', sahip:'gridIstatistikSahip',
};

async function fetchSorted(date, cityKey, raceNo, tabKey, colKey, dir='desc') {
  const cityName = CITY_MAP[cityKey] || cityKey;
  const colIdx = DA_SORT_COLS[tabKey]?.[colKey];
  if (colIdx === undefined) return null;

  const ck = `${date}_${cityKey}_${raceNo}`;
  const browser = await puppeteer.launch({ headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
  const p = await browser.newPage();
  p.setDefaultTimeout(20000);

  try {
    await p.goto(BASE, { waitUntil:'domcontentloaded' });
    await p.setCookie({ name:'.ASPXAUTH', value:ASPXAUTH, domain:'www.dijitalanaliz.com', path:'/', httpOnly:true, secure:true });
    await p.goto(`${BASE}/AtYarisi/AnalizPaneli`, { waitUntil:'networkidle2' });

    // Set date & city
    await p.click('#analizTarih_I', { clickCount:3 });
    await p.type('#analizTarih_I', date, { delay:30 });
    await p.keyboard.press('Tab');
    await new Promise(r => setTimeout(r,500));
    await p.click('#analizHipodrom_I', { clickCount:3 });
    await p.type('#analizHipodrom_I', cityName, { delay:30 });
    await new Promise(r => setTimeout(r,800));
    await p.evaluate((city) => {
      document.querySelectorAll('[class*="dxeListBoxItem"]').forEach(el => {
        if (el.textContent.trim()===city) el.click();
      });
    }, cityName);
    await new Promise(r => setTimeout(r,2000));

    // Click koşu tab
    await p.evaluate((rno) => {
      Array.from(document.querySelectorAll('span.dx-vam'))
        .filter(s => { const r=s.getBoundingClientRect(); return r.width>0 && s.textContent.trim()===`${rno}.Koşu`; })
        .forEach(s => s.click());
    }, raceNo);
    await new Promise(r => setTimeout(r,1500));

    // Click İstatistik tab
    await p.evaluate(() => {
      Array.from(document.querySelectorAll('span.dx-vam'))
        .filter(s => { const r=s.getBoundingClientRect(); return r.width>0 && s.textContent.trim()==='Koşu İstatistik'; })
        .forEach(s => s.click());
    });
    await new Promise(r => setTimeout(r,1500));

    // Click on column header to sort
    const gridId = GRID_NAMES[tabKey];
    const sorted = await p.evaluate((gid, colIdx, dir) => {
      // Find the header cell for this column and click it
      const ht = document.getElementById(`${gid}_DXHeaderTable`);
      if (!ht) return null;
      
      // Find all header rows, get the one with most columns
      let best = null, bestLen = 0;
      ht.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > bestLen) { bestLen = cells.length; best = row; }
      });
      
      if (best) {
        const cells = best.querySelectorAll('td');
        if (cells[colIdx]) {
          cells[colIdx].click();
          // If desc, click again
          if (dir === 'desc') cells[colIdx].click();
        }
      }

      // Wait a bit then read sorted data
      return new Promise(resolve => {
        setTimeout(() => {
          const mt = document.getElementById(`${gid}_DXMainTable`);
          const rows = [];
          if (mt) mt.querySelectorAll('tr').forEach(row => {
            const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.replace(/\s+/g,' ').trim());
            const no = parseInt(cells[0]);
            if (no >= 1 && no <= 30 && cells[1]?.length > 1) rows.push(cells);
          });
          resolve(rows);
        }, 1500);
      });
    }, gridId, colIdx, dir);

    return sorted;
  } finally {
    await browser.close();
  }
}

async function fetchAllStats(date, cityKey, raceNo) {
  const ck = `${date}_${cityKey}_${raceNo}`;
  if (cache[ck]) return cache[ck];

  const cityName = CITY_MAP[cityKey] || cityKey;
  console.log(`[DA] ${date} ${cityName} ${raceNo}.Koşu`);

  const browser = await puppeteer.launch({ headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
  const p = await browser.newPage();
  p.setDefaultTimeout(30000);

  try {
    await p.goto(BASE, { waitUntil:'domcontentloaded' });
    await p.setCookie({ name:'.ASPXAUTH', value:ASPXAUTH, domain:'www.dijitalanaliz.com', path:'/', httpOnly:true, secure:true });
    await p.goto(`${BASE}/AtYarisi/AnalizPaneli`, { waitUntil:'networkidle2' });

    // Tarih - triple click
    await p.click('#analizTarih_I', { clickCount: 3 });
    await p.type('#analizTarih_I', date, { delay: 50 });
    await p.keyboard.press('Tab');
    await new Promise(r => setTimeout(r, 500));

    // Şehir
    await p.click('#analizHipodrom_I', { clickCount: 3 });
    await p.type('#analizHipodrom_I', cityName, { delay: 50 });
    await new Promise(r => setTimeout(r, 800));
    await p.evaluate((city) => {
      document.querySelectorAll('[class*="dxeListBoxItem"]').forEach(el => {
        if (el.textContent.trim() === city) el.click();
      });
    }, cityName);
    await new Promise(r => setTimeout(r, 2000));

    // Form kontrol
    const fv = await p.evaluate(() => ({
      t: document.getElementById('analizTarih_I')?.value,
      h: document.getElementById('analizHipodrom_I')?.value,
    }));
    console.log('[DA] Form:', fv.t, fv.h);

    // Koşu tab
    await p.evaluate((rno) => {
      Array.from(document.querySelectorAll('span.dx-vam'))
        .filter(s => { const r=s.getBoundingClientRect(); return r.width>0 && s.textContent.trim()===`${rno}.Koşu`; })
        .forEach(s => s.click());
    }, raceNo);
    await new Promise(r => setTimeout(r, 2000));

    // gridAnaliz yüklenene kadar bekle
    await p.waitForFunction(() => {
      return document.querySelectorAll('[id^="gridAnaliz_DXDataRow"]').length > 0;
    }, { timeout: 10000 }).catch(() => console.log('[DA] DXDataRow timeout'));

    const gridRowCount = await p.evaluate(() => document.querySelectorAll('[id^="gridAnaliz_DXDataRow"]').length);
    console.log('[DA] gridAnaliz DXDataRows:', gridRowCount);

    // ÖNCE Koşu Analiz grid'den dijital veriler - pGalop window objects
    const analizRows = await p.evaluate(() => {
      const rows = [];
      for (let i = 1; i <= 20; i++) {
        const galop = window['pGalop_' + i + '_MC'];
        if (!galop) continue;
        
        // DXDataRow'dan diğer verileri al
        const row = document.getElementById('gridAnaliz_DXDataRow' + (i-1));
        let rating = 0, dijital_derece = null, sart_uyumu = 0, hp = 0, yaris_stili = '';
        
        if (row) {
          // Sadece anlamlı metni al - JS kodu içeren td'leri atla
          const allCells = Array.from(row.querySelectorAll('td'))
            .map(td => td.textContent.replace(/\s+/g,' ').trim());
          
          // HP ve Şart Uyumu her zaman son 2 td'de
          const last = allCells.length - 1;
          hp         = parseInt(allCells[last]) || 0;
          
          // Şart Uyumu: "- 6 Hp" veya "-6 Hp" formatında
          const sartRaw = allCells[last-1] || '';
          sart_uyumu = parseInt(sartRaw.replace(/[^\d-]/g,'').replace(/^-?(\d+).*/, (m,n,o) => sartRaw.includes('-') ? '-'+n : n)) || 0;
          
          // Rating, Derece, Yarış Stili - filtrelenmiş hali
          const filtered = allCells.filter(s => s && !s.includes('aspxAdd') && !s.includes('window[') && s.length < 50);
          if (filtered.length >= 24) {
            yaris_stili    = filtered[20] || '';
            dijital_derece = filtered[21] || null;
            rating         = parseInt(filtered[22]) || 0;
          }
        }
        
        rows.push({
          no: i,
          dijital_galop:     parseFloat(galop.customDisplayFormat?.replace(',','.')) || galop.position || 0,
          dijital_derece,
          rating,
          sart_uyumu,
          hp,
          yaris_stili,
        });
      }
      return { rows, count: rows.length };
    });
    console.log('[DA] Analiz grid:', analizRows.count, 'at');
    if (analizRows.rows?.[0]) console.log('[DA] Analiz[0]:', JSON.stringify(analizRows.rows[0]));

    // SONRA Koşu İstatistik tab
    await p.evaluate(() => {
      Array.from(document.querySelectorAll('span.dx-vam'))
        .filter(s => { const r=s.getBoundingClientRect(); return r.width>0 && s.textContent.trim()==='Koşu İstatistik'; })
        .forEach(s => s.click());
    });
    await new Promise(r => setTimeout(r, 2000));

    // Grid'leri oku - bilinen column indexleri ile
    const grids = await p.evaluate(() => {
      const read = (id) => {
        const mt = document.getElementById(id+'_DXMainTable');
        if (!mt) return [];
        return [...mt.querySelectorAll('tr')].map(row =>
          [...row.querySelectorAll('td')].map(td => td.textContent.replace(/\s+/g,' ').trim())
        ).filter(cells => parseInt(cells[0]) >= 1 && parseInt(cells[0]) <= 30);
      };
      return {
        at:      read('gridIstatistikAt'),
        jokey:   read('gridIstatistikJokey'),
        antrenor:read('gridIstatistikAntrenor'),
        sahip:   read('gridIstatistikSahip'),
      };
    });

    const result = {
      at:      parseGridDOM(grids.at,      'at'),
      jokey:   parseGridDOM(grids.jokey,   'jokey'),
      antrenor:parseGridDOM(grids.antrenor,'antrenor'),
      sahip:   parseGridDOM(grids.sahip,   'sahip'),
      analiz:  analizRows.rows || [],
    };

    console.log(`[DA] at:${result.at.length} jokey:${result.jokey.length} antr:${result.antrenor.length} sahip:${result.sahip.length}`);
    if (result.at[0]) console.log('[DA] at[0]:', JSON.stringify(result.at[0]));

    if (result.at.length > 0) {
      cache[ck] = result;
      setTimeout(() => delete cache[ck], 30*60*1000);
    }
    return result;

  } finally {
    await browser.close();
  }
}

async function closeBrowser() {}
module.exports = { fetchAllStats, closeBrowser, CITY_MAP };

if (require.main === module) {
  const [,,date='08.07.2026',city='istanbul',race='1'] = process.argv;
  fetchAllStats(date, city, parseInt(race))
    .then(r => {
      console.log('\n=== SONUÇ ===');
      r.at.forEach(h => console.log(`#${h.horse_no} ${(h.horse_name||'').padEnd(22)} G:${h.da_genel} F:${h.da_form} R:${h.da_rating}`));
    }).catch(e => { console.error('Fatal:', e.message); process.exit(1); });
}