'use strict';
const cheerio = require('cheerio');
const fs = require('fs');

const file = process.argv[2] || 'da_ist_diyarbakir_1.html';
const html = fs.readFileSync(file, 'utf-8');
const $ = cheerio.load(html);

// Tüm header kolonlarını göster
console.log('=== TÜM HEADER KOLONLARI ===');
$('tr[id*="HeadersRow"] td[id]').each((i, td) => {
  const id  = $(td).attr('id');
  const txt = $(td).text().replace(/\s+/g,' ').trim();
  if (txt) console.log(`  ${id} = "${txt}"`);
});

// İlk data row'un TÜM kolonlarını göster
console.log('\n=== İLK AT - TÜM KOLONLAR ===');
$('tr[id*="DXDataRow0"]').first().find('td').each((i, td) => {
  const id  = $(td).attr('id') || `pos_${i}`;
  const txt = $(td).text().replace(/\s+/g,' ').trim();
  console.log(`  [${i}] id="${id}" val="${txt}"`);
});
