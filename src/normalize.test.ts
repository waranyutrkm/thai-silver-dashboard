import assert from 'node:assert/strict';
import { BAHT_SILVER_G, OZT } from './config';
import { buildMarketContext, normalizeOne, toBase } from './normalize';
import type { Instrument, RawQuote } from './types';

let pass = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, `❌ ${name}`);
  console.log(`✔ ${name}`);
  pass++;
}
const near = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;

const FX = 34;
const SPOT_USD = 30; // USD/oz
const spotBase = (SPOT_USD * FX) / OZT; // ≈ 32.7938 THB/g fine

// 1) บาท/กก. 99.99%
const kgInst = {
  id: 'x',
  name: 'kg',
  type: 'physical_bar',
  source: 'scraper',
  unit: 'thb_kg',
  purity: 0.9999,
  vatApplicable: true,
} as Instrument;
ok(
  'thb_kg → B',
  near(toBase(69208, kgInst, { fx: FX }), 69208 / (1000 * 0.9999)),
);

// 2) บาท/แท่ง "1 บาท"
const bahtInst = { ...kgInst, unit: 'thb_baht' } as Instrument;
ok(
  'thb_baht → B',
  near(toBase(1025, bahtInst, { fx: FX }), 1025 / (BAHT_SILVER_G * 0.9999)),
);

// 3) USD/oz
const spotInst = {
  ...kgInst,
  unit: 'usd_oz',
  purity: 0.9999,
  vatApplicable: false,
} as Instrument;
ok('usd_oz → B', near(toBase(SPOT_USD, spotInst, { fx: FX }), spotBase));

// 4) ETF
const etfInst = {
  ...kgInst,
  unit: 'etf_usd_share',
  purity: 0.999,
  vatApplicable: false,
  ozPerShare: 0.906,
} as Instrument;
ok(
  'etf → B',
  near(toBase(27, etfInst, { fx: FX }), (27 * FX) / (0.906 * OZT)),
);

// 5) VAT: ฝั่งซื้อฟิสิคัลต้องบวก 7% เมื่อเปิด toggle
const market = buildMarketContext(SPOT_USD, FX, Date.now());
const q: RawQuote = { id: 'x', bid: 66000, ask: 69000, ok: true };
const noVat = normalizeOne(kgInst, q, market, false);
const withVat = normalizeOne(kgInst, q, market, true);
ok(
  'VAT off: askBaseEff = askBase',
  noVat.askBaseEff === noVat.askBase,
);
ok(
  'VAT on: askBaseEff = askBase * 1.07',
  near(withVat.askBaseEff!, withVat.askBase! * 1.07, 1e-2),
);
ok(
  'VAT on: ฝั่งขาย (bid) ไม่บวก VAT',
  withVat.bidBaseEff === withVat.bidBase,
);

// 6) paper spread จำลอง
const paperQ: RawQuote = { id: 'x', last: SPOT_USD, ok: true };
const paperRow = normalizeOne(
  { ...spotInst, modeledSpreadPct: 0.001 } as Instrument,
  paperQ,
  market,
  false,
);
ok('paper: spreadModeled = true', paperRow.spreadModeled === true);
ok('paper: ask > bid', paperRow.askBase! > paperRow.bidBase!);

console.log(`\n✅ ผ่านทั้งหมด ${pass} เคส`);
