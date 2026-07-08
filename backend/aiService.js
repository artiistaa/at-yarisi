// backend/aiService.js — v2
// تمام اطلاعات واقعی at را تحلیل می‌کند
'use strict';

const https = require('https');
const MODEL = 'claude-sonnet-4-6';

function buildPrompt(race, horses) {
  const horseLines = horses.map(h => {
    const parts = [
      `#${h.horse_no} ${h.horse_name}`,
      h.age        ? `Yas:${h.age}`            : null,
      h.jockey     ? `Jokey:${h.jockey}`        : null,
      h.weight     ? `Kilo:${h.weight}kg`       : null,
      h.start_no   ? `Start:${h.start_no}`      : null,
      h.handicap   ? `HC:${h.handicap}`         : null,
      h.last_results||h.last_6 ? `Son6:${h.last_results||h.last_6}` : null,
      h.kgs        ? `KGS:${h.kgs}`             : null,
      h.s20        ? `S20:${h.s20}`             : null,
      h.agf        ? `AGF:${h.agf}`             : null,
      h.father     ? `Baba:${h.father.split('/')[0].trim()}` : null,
    ].filter(Boolean);
    return parts.join(' | ');
  }).join('\n');

  return `Sen bir at yarisi analiz uzmanisisin. Asagidaki yaris verilerini analiz et ve en guclu atlari belirle.

YARIS BILGILERI:
- Pist: ${race.track || race.tjk_city_name || 'Bilinmiyor'}
- Tarih: ${race.race_date || race.date || 'Bugun'}
- Koso No: ${race.race_no || 1}
- Mesafe: ${race.distance || 0}m
- Pist Durumu: ${race.surface || 'kuru'}
- Hava: ${race.weather || 'Bilinmiyor'}

ATLAR (${horses.length} at):
${horseLines}

ANALIZ KRITERLERI:
- HC (Handikap): Yuksek HC = guclu at gecmisi
- Son6: Son 6 yaristin derece sirasi (1=birinci, 0=kosmayon/iptal)
- KGS: Kumulatif guc skoru (dusuk = daha guclu)
- S20: Son 20 yaristaki ortalama siralama
- AGF: Tahmini kazanma yuzdesi (dusuk oran = favori)
- Yas/Cinsiyet: k=kisirak, a=aygin, d=dis at
- Baba: Irk gecmisi (mesafe/pist uymuna etkisi)

ONEMLI: 
- Son6 analizi: art arda 1-2 derece = form zirvesi
- HC ve KGS birlikte degerlendir
- Pist durumu (kum/cim/sentetik) ile Baba bilgisini eslestir
- Jokey performansi da goz onunde bulundur

SADECE JSON don, baska hicbir sey yazma:
{
  "ranking": [
    {"horse_no": 1, "horse_name": "AT ADI", "prob": 35, "reason": "kisa Turkce aciklama (max 80 karakter)"}
  ],
  "summary": "2-3 cumle genel degerlendirme Turkce",
  "confidence": 72
}

Kurallar:
- prob degerleri TOPLAMI tam 100 olmali
- Tum atlari sirala
- Kesin kazanma iddiasinda bulunma
- confidence: veri kalitesine gore 50-90 arasi`;
}

function callAnthropic(prompt) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) return reject(new Error('AI_API_KEY set edilmemis'));

    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length':  Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed);
        } catch(e) {
          reject(new Error('API yaniti parse edilemedi'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function analyzeRace(race, horses, sources = []) {
  const rawPrompt = buildPrompt(race, horses);
  const apiResponse = await callAnthropic(rawPrompt);

  const rawText = apiResponse.content
    .map(c => c.text || '')
    .join('')
    .replace(/```json|```/g, '')
    .trim();

  let result;
  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error('AI yaniti gecerli JSON degil: ' + rawText.slice(0, 200));
  }

  if (!Array.isArray(result.ranking) || result.ranking.length === 0)
    throw new Error('AI yanitinda ranking eksik');

  // Normalize probs to exactly 100
  const total = result.ranking.reduce((s, r) => s + (r.prob || 0), 0);
  if (total > 0 && Math.abs(total - 100) > 5) {
    const factor = 100 / total;
    result.ranking = result.ranking.map((r, i) => ({
      ...r,
      prob: i === result.ranking.length - 1
        ? 100 - result.ranking.slice(0, -1).reduce((s, x) => s + Math.round(x.prob * factor), 0)
        : Math.round(r.prob * factor),
    }));
  }

  // Add horse_name if missing
  result.ranking = result.ranking.map(r => {
    if (!r.horse_name) {
      const h = horses.find(x => x.horse_no === r.horse_no);
      r.horse_name = h ? h.horse_name : `At #${r.horse_no}`;
    }
    return r;
  });

  return {
    ranking:     result.ranking.sort((a, b) => b.prob - a.prob),
    summary:     result.summary || '',
    confidence:  Math.min(90, Math.max(50, result.confidence || 70)),
    rawPrompt,
    rawResponse: rawText,
  };
}

module.exports = { analyzeRace };
