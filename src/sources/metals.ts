// แหล่งราคา spot เนื้อเงิน (USD/oz) — keyless, ดึงได้จาก Node
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface SpotResult {
  usdOz: number;
  ts: number;
  changePct?: number; // เปลี่ยนแปลงจากราคาปิดก่อนหน้า (%)
  prevClose?: number;
  source: string;
}

async function getJson(url: string, headers: Record<string, string> = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** primary: goldprice.org (ให้ราคา + %เปลี่ยนแปลง) ; fallback: gold-api.com */
export async function fetchSilverSpot(): Promise<SpotResult> {
  // 1) goldprice.org
  try {
    const j: any = await getJson('https://data-asg.goldprice.org/dbXRates/USD', {
      Referer: 'https://goldprice.org/',
      Origin: 'https://goldprice.org',
    });
    const it = j?.items?.[0];
    if (it && Number.isFinite(it.xagPrice) && it.xagPrice > 0) {
      return {
        usdOz: it.xagPrice,
        ts: j.tsj ?? Date.now(),
        changePct: Number.isFinite(it.pcXag) ? it.pcXag / 100 : undefined,
        prevClose: Number.isFinite(it.xagClose) ? it.xagClose : undefined,
        source: 'goldprice.org',
      };
    }
  } catch {
    /* ลอง fallback */
  }
  // 2) gold-api.com
  const j: any = await getJson('https://api.gold-api.com/price/XAG');
  if (!Number.isFinite(j?.price) || j.price <= 0) {
    throw new Error('ไม่พบราคา silver spot จากทุกแหล่ง');
  }
  return {
    usdOz: j.price,
    ts: j.updatedAt ? Date.parse(j.updatedAt) : Date.now(),
    source: 'gold-api.com',
  };
}
