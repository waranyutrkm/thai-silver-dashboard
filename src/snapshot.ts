import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSnapshot, refresh } from './refresh';

// สร้างไฟล์ snapshot สำหรับโฮสต์แบบ static (GitHub Pages)
// ใช้: `npm run snapshot`         → ดึงครบ (มี headless browser: TFEX/ETF/COMEX)
//      `npm run snapshot -- --no-browser` → ข้าม browser (สำหรับ CI ที่ IP โดนบล็อก)
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'data', 'latest.json');

const useBrowser = !process.argv.includes('--no-browser');

console.log(`▶ สร้าง snapshot (useBrowser=${useBrowser}) …`);
await refresh({ useBrowser });
const snap = getSnapshot(false); // เก็บราคาดิบ (ก่อน VAT) — client เป็นคนคิด VAT

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(snap, null, 2));

const ok = snap.rows.filter((r) => r.native.ok).length;
console.log(
  `✔ เขียน ${OUT}\n  spot=${snap.market.spotUsdOz} fx=${snap.market.fx} base=${snap.market.spotBase?.toFixed(
    2,
  )} · แถวมีข้อมูล ${ok}/${snap.rows.length}`,
);
process.exit(0);
