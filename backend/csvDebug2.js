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

  const text = Buffer.from(res.data).toString('utf8').replace(/^\uFEFF/,'');
  const lines = text.split('\n').map(l => l.replace(/\r/,'').trim());

  // Koşu başlıklarını bul
  console.log('=== KOŞU BAŞLIKLARI ===');
  lines.forEach((l, i) => {
    if (l.match(/^\d+\.\s*Kosu\s*:/i)) {
      console.log(`Satır ${i}: ${l}`);
    }
  });

  // At No header'larını bul
  console.log('\n=== AT NO HEADER\'LARI ===');
  lines.forEach((l, i) => {
    if (l.match(/^At\s*No/i) || l.match(/^SiraNo/i)) {
      console.log(`Satır ${i}: ${l}`);
    }
  });

  // Tüm satırları göster (500-600 arası)
  console.log('\n=== SATIRLAR 40-80 ===');
  lines.slice(40, 80).forEach((l, i) => {
    console.log(`${i+40}: ${l.slice(0,100)}`);
  });
}

main().catch(e => console.error('Hata:', e.message));
