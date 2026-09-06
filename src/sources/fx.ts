// แหล่งอัตราแลกเปลี่ยน USD/THB — keyless (อัปเดตรายวัน เพียงพอสำหรับ dashboard เนื้อเงิน)
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface FxResult {
  rate: number; // 1 USD = rate THB
  ts: number;
  date?: string;
  source: string;
}

async function getJson(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** primary: frankfurter.app ; fallback: open.er-api.com */
export async function fetchUsdThb(): Promise<FxResult> {
  try {
    const j: any = await getJson(
      'https://api.frankfurter.app/latest?from=USD&to=THB',
    );
    const rate = j?.rates?.THB;
    if (Number.isFinite(rate) && rate > 0) {
      return {
        rate,
        ts: j.date ? Date.parse(j.date) : Date.now(),
        date: j.date,
        source: 'frankfurter.app',
      };
    }
  } catch {
    /* ลอง fallback */
  }
  const j: any = await getJson('https://open.er-api.com/v6/latest/USD');
  const rate = j?.rates?.THB;
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('ไม่พบอัตรา USD/THB จากทุกแหล่ง');
  }
  return {
    rate,
    ts: (j.time_last_update_unix ?? 0) * 1000 || Date.now(),
    source: 'open.er-api.com',
  };
}
