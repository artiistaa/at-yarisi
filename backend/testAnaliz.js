const axios = require('axios');

const ASPXAUTH = '18F8713A40DB11EF295BB569198FAEC3BE325C71D1E3DA7776307FA746469A0DCBACED7175944A9D17B907CB88AAAE6FB79BEBABDDA3DD5A012797AF35013DC16AB87E39B08DECB98AC5B0A4BA39D9EE4DC3A5FBBAB3EF00F0F06D7FED2C1864BE1D7E506142D48651B937B691D8A5CF4A7A8DE5E0A7B7319DF0323196751A04FF9990F7';

async function main() {
  // Önce sayfayı yükle
  const r = await axios.get('https://www.dijitalanaliz.com/AtYarisi/AnalizPaneli', {
    headers: {
      'Cookie': `.ASPXAUTH=${ASPXAUTH}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    timeout: 15000,
  });
  console.log('Status:', r.status);
  console.log('Size:', r.data.length);
  // DXDataRow var mı?
  const matches = r.data.match(/gridAnaliz_DXDataRow/g);
  console.log('DXDataRow count:', matches?.length || 0);
  // İlk match'i göster
  if (matches) {
    const idx = r.data.indexOf('gridAnaliz_DXDataRow0');
    console.log('Around:', r.data.slice(idx, idx+200));
  }
}
main().catch(e => console.error(e.message));
