import { BAHT_SILVER_G, OZT, VAT } from './config';
import type {
  Instrument,
  MarketContext,
  NormalizedRow,
  RawQuote,
} from './types';

/**
 * แปลงราคาดิบ 1 ค่า → ฐานเดียว: บาทต่อกรัมเนื้อเงินบริสุทธิ์ (B)
 * (ยังไม่รวม VAT — VAT จัดการภายหลังตามฝั่ง)
 */
export function toBase(
  price: number,
  inst: Instrument,
  ctx: { fx: number },
): number {
  switch (inst.unit) {
    case 'thb_kg':
      // บาท/กก. ของน้ำหนักรวม → หารด้วย (1000g × ความบริสุทธิ์)
      return price / (1000 * inst.purity);
    case 'thb_baht':
      // บาท/แท่ง "1 บาท" → หารด้วย (น้ำหนักบาท × ความบริสุทธิ์)
      return price / (BAHT_SILVER_G * inst.purity);
    case 'thb_gram':
      // บาท/กรัม (น้ำหนักจริง) → หารความบริสุทธิ์เพื่อเทียบเนื้อเงินบริสุทธิ์
      return price / inst.purity;
    case 'usd_oz':
      // USD/oz เนื้อบริสุทธิ์อยู่แล้ว → บาท/กรัม
      return (price * ctx.fx) / OZT;
    case 'etf_usd_share': {
      // ราคาหุ้น USD ต่อ (เงิน ozPerShare ออนซ์) → บาทต่อกรัมเนื้อเงินที่ถือจริง
      if (!inst.ozPerShare || inst.ozPerShare <= 0) {
        throw new Error(`ETF ${inst.id} ต้องมี ozPerShare`);
      }
      return (price * ctx.fx) / (inst.ozPerShare * OZT);
    }
    default:
      throw new Error(`ไม่รู้จักหน่วย ${inst.unit as string}`);
  }
}

/** ปัดทศนิยม n ตำแหน่งแบบปลอดภัย */
function round(n: number | null, d = 4): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/**
 * เติม bid/ask:
 * - มี bid/ask จริง (ร้านฟิสิคัล + TFEX) → ใช้เลย (mid=false, มีสเปรดจริง)
 * - มีแต่ last (spot/ETF/COMEX) → ราคาตลาดค่าเดียว bid=ask=last (mid=true, ไม่มีสเปรดปลอม)
 */
function resolveBidAsk(
  q: RawQuote,
): { bid: number | null; ask: number | null; mid: boolean } {
  if (q.bid != null && q.ask != null) {
    return { bid: q.bid, ask: q.ask, mid: false };
  }
  if (q.last != null) {
    return { bid: q.last, ask: q.last, mid: true };
  }
  return { bid: null, ask: null, mid: false };
}

/**
 * normalize instrument 1 ตัว → NormalizedRow (ทุกค่าเป็น B = บาท/กรัมเนื้อเงินบริสุทธิ์)
 * @param includeVat เปิด VAT 7% กับฟิสิคัลหรือไม่ (ตาม toggle หน้าจอ)
 */
export function normalizeOne(
  inst: Instrument,
  q: RawQuote,
  market: MarketContext,
  includeVat: boolean,
): NormalizedRow {
  const base: NormalizedRow = {
    id: inst.id,
    name: inst.name,
    type: inst.type,
    url: inst.url,
    note: inst.note,
    bidBase: null,
    askBase: null,
    askBaseEff: null,
    bidBaseEff: null,
    vatApplicable: inst.vatApplicable,
    premiumBuy: null,
    premiumSell: null,
    spreadPct: null,
    mid: false,
    native: q,
  };

  if (!q.ok) return base;

  const { bid, ask, mid } = resolveBidAsk(q);
  const ctx = { fx: market.fx };

  const bidBase = bid != null ? toBase(bid, inst, ctx) : null;
  const askBase = ask != null ? toBase(ask, inst, ctx) : null;

  // VAT: ใช้กับฟิสิคัลเมื่อ toggle เปิด (ฝั่งซื้อจ่าย VAT; ฝั่งรับซื้อคืนโดยทั่วไปไม่บวก VAT)
  const vatMult = includeVat && inst.vatApplicable ? 1 + VAT : 1;
  const askBaseEff = askBase != null ? askBase * vatMult : null;
  const bidBaseEff = bidBase; // ฝั่งขาย (ร้านรับซื้อ) ไม่บวก VAT ให้ผู้ขาย

  base.bidBase = round(bidBase);
  base.askBase = round(askBase);
  base.askBaseEff = round(askBaseEff);
  base.bidBaseEff = round(bidBaseEff);
  base.premiumBuy =
    askBaseEff != null && market.spotBase > 0
      ? round(askBaseEff / market.spotBase - 1, 4)
      : null;
  base.premiumSell =
    bidBaseEff != null && market.spotBase > 0
      ? round(bidBaseEff / market.spotBase - 1, 4)
      : null;
  base.spreadPct =
    !mid && bidBase != null && askBase != null && bidBase > 0
      ? round((askBase - bidBase) / bidBase, 4)
      : null;
  base.mid = mid;

  return base;
}

/** คำนวณ market context จาก spot(USD/oz) + fx(USDTHB) */
export function buildMarketContext(
  spotUsdOz: number,
  fx: number,
  ts: number,
  flags: Partial<
    Omit<MarketContext, 'spotUsdOz' | 'fx' | 'spotBase' | 'ts'>
  > = {},
): MarketContext {
  return {
    spotUsdOz,
    fx,
    spotBase: (spotUsdOz * fx) / OZT,
    ts,
    ...flags,
  };
}
