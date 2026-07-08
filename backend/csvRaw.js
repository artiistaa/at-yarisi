// backend/csvRaw.js
'use strict';
const axios = require('axios');

async function main() {
  const date = process.argv[2] || '05.07.2026';
  const city = process.argv[3] || 'İstanbul';
  const [dd,mm,yyyy] = date.split('.');
  const url = `https://medya-cdn.tjk.org/raporftp/TJKPDF/${yyyy}/${yyyy}-${mm}-${dd}/CSV/GunlukYarisProgrami/${date}-${city}-GunlukYarisProgrami-TR.csv`;

  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tjk.org/' },
    responseType: 'arraybuffer', timeout: 15000,
  });

  const text = Buffer.from(res.data).toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split('\n').map((l,i) => ({ i, l: l.replace(/\r/,'').trim() }));

  // Koşu başlıklarını bul
  const kosuLines = lines.filter(x => x.l.match(/\d+\.\s*Ko[şs]u/i));
  console.log('=== KOŞU SATIRLARI ===');
  kosuLines.forEach(x => console.log(`Satır ${x.i}: ${x.l.slice(0,80)}`));

  // 5. ve 6. koşu arasını göster
  const k5 = kosuLines.find(x => x.l.match(/^5\.\s*Ko[şs]u/i));
  const k6 = kosuLines.find(x => x.l.match(/^6\.\s*Ko[şs]u/i));
  
  if (k5) {
    const start = k5.i;
    const end   = k6 ? k6.i : Math.min(k5.i + 30, lines.length);
    console.log(`\n=== 5.KOŞU SATIRLARI (${start}-${end}) ===`);
    lines.slice(start, end).forEach(x => console.log(`${x.i}: ${x.l.slice(0,120)}`));
  }

  if (k6) {
    console.log(`\n=== 6.KOŞU SATIRLARI (${k6.i}-${k6.i+5}) ===`);
    lines.slice(k6.i, k6.i+5).forEach(x => console.log(`${x.i}: ${x.l.slice(0,120)}`));
  } else {
    console.log('\n❌ 6.Koşu bulunamadı!');
    // 5.koşunun başından 20 satır sonrasını göster
    if (k5) {
      console.log(`\n=== 5.KOŞU'DAN 20 SATIR SONRA ===`);
      lines.slice(k5.i + 20, k5.i + 40).forEach(x => console.log(`${x.i}: ${x.l.slice(0,120)}`));
    }
  }
}

main().catch(e => console.error('Hata:', e.message));
