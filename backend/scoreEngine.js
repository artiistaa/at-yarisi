// backend/scoreEngine.js — v3
// TJK verisinden DijitalAnaliz benzeri skorlar hesaplar
'use strict';

// Son 6 yarış string'inden form skoru
function calcFormScore(last6) {
  if (!last6 || last6 === '-') return 0;
  const pts = { 1:100, 2:80, 3:60, 4:40, 5:30, 6:20 };
  const chars = [...last6].filter(c => /[0-9]/.test(c)).map(Number);
  if (!chars.length) return 0;
  let total = 0, weight = 1.0;
  for (let i = chars.length - 1; i >= 0; i--) {
    total += (pts[chars[i]] || (chars[i] === 0 ? 0 : 10)) * weight;
    weight *= 0.85;
  }
  const max = 100 * (1 - Math.pow(0.85, chars.length)) / (1 - 0.85);
  return Math.min(100, Math.round((total / max) * 100));
}

// HC skoru (0-99 → 0-100)
function calcHCScore(hc) {
  const n = parseInt(hc);
  if (isNaN(n) || n <= 0) return 0;
  return Math.min(100, n);
}

// KGS skoru (düşük = iyi)
function calcKGSScore(kgs) {
  const n = parseInt(kgs);
  if (isNaN(n) || n <= 0) return 50;
  if (n <= 5)   return 100;
  if (n <= 10)  return 90;
  if (n <= 20)  return 80;
  if (n <= 30)  return 70;
  if (n <= 50)  return 55;
  if (n <= 80)  return 40;
  if (n <= 120) return 25;
  return 10;
}

// AGF skoru (düşük % = favori = iyi)
function calcAGFScore(agf) {
  if (!agf) return 50;
  const n = parseFloat(String(agf).replace('%','').replace(',','.').split('(')[0]);
  if (isNaN(n) || n <= 0) return 50;
  if (n <= 5)   return 100;
  if (n <= 10)  return 88;
  if (n <= 15)  return 78;
  if (n <= 20)  return 68;
  if (n <= 30)  return 55;
  if (n <= 50)  return 40;
  if (n <= 75)  return 28;
  return 15;
}

// S20 skoru (düşük = iyi)
function calcS20Score(s20) {
  const n = parseInt(s20);
  if (isNaN(n) || n <= 0) return 50;
  if (n <= 3)  return 100;
  if (n <= 5)  return 88;
  if (n <= 8)  return 75;
  if (n <= 10) return 62;
  if (n <= 13) return 50;
  if (n <= 16) return 35;
  return 20;
}

// Yarış stili - KGS ve Son6'dan hesapla
function calcYarisStili(horse) {
  const kgs    = parseInt(horse.kgs) || 99;
  const last6  = horse.last_6 || '';
  const startsK = (last6.match(/K/g) || []).length; // Kaçak
  const startsS = (last6.match(/S/g) || []).length; // Sprinter

  if (kgs <= 15 || startsK >= 2) return 'Kaçak';
  if (kgs <= 30 || startsS >= 2) return 'Sprinter';
  if (kgs <= 50)                 return 'Orta';
  return 'En Takipçi';
}

// Yaş bonusu
function calcAgeBonus(age) {
  const m = String(age || '').match(/^(\d+)/);
  if (!m) return 0;
  const a = parseInt(m[1]);
  if (a === 4 || a === 5) return 10;
  if (a === 6)            return 5;
  if (a === 3)            return 2;
  if (a === 2)            return -5;
  return -8; // 7+
}

// Kilo bonusu (hafif = avantaj)
function calcWeightBonus(weight) {
  const w = parseFloat(String(weight || '0').replace(',','.'));
  if (!w) return 0;
  if (w <= 54) return 8;
  if (w <= 56) return 5;
  if (w <= 58) return 2;
  if (w <= 60) return 0;
  if (w <= 62) return -3;
  return -6;
}

// Ana fonksiyon - tek at skoru
function scoreHorse(horse, raceCtx = {}) {
  const form   = calcFormScore(horse.last_6 || horse.last_results);
  const hc     = calcHCScore(horse.handicap);
  const kgs    = calcKGSScore(horse.kgs);
  const agf    = calcAGFScore(horse.agf);
  const s20    = calcS20Score(horse.s20);
  const ageB   = calcAgeBonus(horse.age);
  const wtB    = calcWeightBonus(horse.weight);

  // Genel = DijitalAnaliz benzeri
  // DA'da Form en ağırlıklı faktör
  const genel = Math.round(
    form  * 0.40 +   // Form en önemli (DA'da da böyle)
    hc    * 0.20 +   // Handikap
    kgs   * 0.20 +   // KGS
    agf   * 0.10 +   // AGF
    s20   * 0.10     // S20
  );

  // Şehir, Pist, Mesafe = şimdilik genel'e yakın
  // (ileride tarihsel veri ile gerçek hesap yapılacak)
  const sehir  = Math.max(0, Math.min(100, genel + Math.round((Math.random()-0.5)*10)));
  const pist   = Math.max(0, Math.min(100, genel + Math.round((Math.random()-0.5)*10)));
  const mesafe = Math.max(0, Math.min(100, genel + Math.round((Math.random()-0.5)*10)));

  // Rating = DijitalAnaliz benzeri (100-999 arası)
  const rating = Math.max(0, Math.round(
    genel  * 4.0 +
    form   * 2.0 +
    ageB   * 3.0 +
    wtB    * 2.0 +
    hc     * 0.5
  ));

  // Pist Mesafe kombinasyon
  const pistMesafe = Math.round((pist + mesafe) / 2);

  return {
    ...horse,
    scores: {
      genel,
      sehir,
      pist,
      mesafe,
      form,
      hc,
      kgs:     Math.round(kgs),
      s20:     Math.round(s20),
      agf:     Math.round(agf),
      pist_mesafe: pistMesafe,
      baba_pist:   0, // tarihsel veri lazım
      anne_pist:   0,
      kardes_pist: 0,
      baba_mesafe: 0,
      anne_mesafe: 0,
      at_binici:   0,
      at_antrenor: 0,
      at_sahip:    0,
      rating,
    },
    yaris_stili: calcYarisStili(horse),
  };
}

// Tüm koşu atlarını skorla
function scoreRace(horses, raceCtx = {}) {
  if (!Array.isArray(horses) || !horses.length) return [];
  return horses
    .map(h => scoreHorse(h, raceCtx))
    .sort((a, b) => b.scores.rating - a.scores.rating)
    .map((h, i) => ({ ...h, rank: i + 1 }));
}

// Kazanma olasılığı
function calcWinProbabilities(scoredHorses) {
  const total = scoredHorses.reduce((s, h) => s + Math.max(1, h.scores.rating), 0) || 1;
  return scoredHorses.map(h => ({
    horse_no:   h.horse_no,
    horse_name: h.horse_name,
    prob:       Math.round((Math.max(1, h.scores.rating) / total) * 100),
    scores:     h.scores,
    rank:       h.rank,
  }));
}

module.exports = { scoreHorse, scoreRace, calcWinProbabilities, calcFormScore, calcYarisStili };
