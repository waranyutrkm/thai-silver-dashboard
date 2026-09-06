import express from 'express';
import cron from 'node-cron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT, REFRESH_MINUTES } from './config';
import { getSnapshot, hasData, refresh } from './refresh';
import { simulate, type Side } from './simulate';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

const wantVat = (v: unknown) => v === '1' || v === 'true';

app.get('/api/prices', (req, res) => {
  if (!hasData()) return res.status(503).json({ error: 'ยังไม่มีข้อมูล กำลังโหลด…' });
  res.json(getSnapshot(wantVat(req.query.vat)));
});

app.get('/api/simulate', (req, res) => {
  if (!hasData()) return res.status(503).json({ error: 'ยังไม่มีข้อมูล กำลังโหลด…' });
  const side = (req.query.side === 'sell' ? 'sell' : 'buy') as Side;
  const budgetThb = req.query.budget ? Number(req.query.budget) : undefined;
  const weightG = req.query.weight ? Number(req.query.weight) : undefined;
  const types = req.query.types
    ? String(req.query.types).split(',').filter(Boolean)
    : undefined;
  const snap = getSnapshot(wantVat(req.query.vat));
  res.json({
    input: { side, budgetThb, weightG, types },
    market: snap.market,
    results: simulate(snap, { side, budgetThb, weightG, types }),
  });
});

app.get('/api/refresh', async (_req, res) => {
  try {
    await refresh();
    res.json({ ok: true, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

app.use(express.static(join(__dirname, '..', 'public')));

app.listen(PORT, async () => {
  console.log(`▶ Silver dashboard: http://localhost:${PORT}`);
  try {
    await refresh();
    console.log('✔ โหลดราคาครั้งแรกเรียบร้อย');
  } catch (e) {
    console.error('✖ โหลดครั้งแรกล้มเหลว:', (e as Error).message);
  }
  cron.schedule(`*/${REFRESH_MINUTES} * * * *`, () => {
    refresh()
      .then(() => console.log(`↻ รีเฟรช ${new Date().toLocaleTimeString('th-TH')}`))
      .catch((e) => console.error('รีเฟรชล้มเหลว:', e.message));
  });
});
