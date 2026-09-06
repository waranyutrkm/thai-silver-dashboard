import type { NormalizedRow, Snapshot } from './types';

export type Side = 'buy' | 'sell';

export interface SimInput {
  side: Side;
  budgetThb?: number; // ฝั่งซื้อ: มีงบเท่านี้ → ได้เนื้อเงินกี่กรัม
  weightG?: number; // น้ำหนักเนื้อเงินบริสุทธิ์ (กรัม) — ใช้ได้ทั้งซื้อ/ขาย
  types?: string[]; // กรองเฉพาะบางประเภท asset (ว่าง = ทุกประเภท)
}

export interface SimResultRow {
  id: string;
  name: string;
  type: string;
  unitBase: number; // B ที่ใช้ (askBaseEff ถ้าซื้อ, bidBaseEff ถ้าขาย)
  gramsFine: number | null; // ฝั่งซื้อ: ได้กี่กรัม (เมื่อใส่งบ)
  costThb: number | null; // ฝั่งซื้อ: จ่ายเท่าไร (เมื่อใส่น้ำหนัก)
  proceedsThb: number | null; // ฝั่งขาย: ได้เท่าไร (เมื่อใส่น้ำหนัก)
  premium: number | null;
  spreadPct: number | null;
  rank: number;
}

/**
 * simulator "มูลค่าเทียบฐานเดียว":
 * เทียบทุก instrument บนฐาน B (บาท/กรัมเนื้อเงินบริสุทธิ์)
 * - ซื้อ: จัดอันดับ B_ask (รวม VAT) ต่ำสุดก่อน = ถูกที่สุด
 * - ขาย: จัดอันดับ B_bid สูงสุดก่อน = ได้เงินมากสุด
 */
export function simulate(snap: Snapshot, input: SimInput): SimResultRow[] {
  const { side, budgetThb, weightG, types } = input;

  const rows = snap.rows.filter((r) => {
    if (types && types.length && !types.includes(r.type)) return false;
    const b = side === 'buy' ? r.askBaseEff : r.bidBaseEff;
    return b != null && b > 0;
  });

  const mapped: SimResultRow[] = rows.map((r) => {
    const unitBase = (side === 'buy' ? r.askBaseEff : r.bidBaseEff) as number;
    let gramsFine: number | null = null;
    let costThb: number | null = null;
    let proceedsThb: number | null = null;

    if (side === 'buy') {
      if (budgetThb != null) gramsFine = budgetThb / unitBase;
      if (weightG != null) costThb = weightG * unitBase;
    } else {
      if (weightG != null) proceedsThb = weightG * unitBase;
    }

    return {
      id: r.id,
      name: r.name,
      type: r.type,
      unitBase: r2(unitBase),
      gramsFine: gramsFine != null ? r3(gramsFine) : null,
      costThb: costThb != null ? r2(costThb) : null,
      proceedsThb: proceedsThb != null ? r2(proceedsThb) : null,
      premium: side === 'buy' ? r.premiumBuy : r.premiumSell,
      spreadPct: r.spreadPct,
      rank: 0,
    };
  });

  // เรียง: ซื้อ = ถูกสุดก่อน (unitBase น้อย→มาก) ; ขาย = ได้มากสุดก่อน (unitBase มาก→น้อย)
  mapped.sort((a, b) =>
    side === 'buy' ? a.unitBase - b.unitBase : b.unitBase - a.unitBase,
  );
  mapped.forEach((r, i) => (r.rank = i + 1));
  return mapped;
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}
function r3(n: number) {
  return Math.round(n * 1000) / 1000;
}
