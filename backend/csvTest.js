// backend/csvTest.js
'use strict';
const { getCityData, fmtDate } = require('./tjkCSV');
const city = process.argv[2] || 'istanbul';
const date = process.argv[3] || fmtDate(new Date());

getCityData(city, date).then(d => {
  console.log(`${d.cityName} | ${d.date} | ${d.races.length} koşu | ${d.totalHorses} at`);
  d.races.forEach(r => {
    console.log(`  ${r.label} ${r.time} ${r.dist}m ${r.surf} — ${r.horses.length} at`);
  });
}).catch(e => console.error('Hata:', e.message));
