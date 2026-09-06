#!/usr/bin/env bash
# อัปเดต snapshot แบบเต็ม (มี TFEX/ETF ผ่าน headless Chrome) แล้ว push ขึ้น GitHub
# ใช้กับ cron บนเครื่อง Mac (residential IP ดึง TFEX/Yahoo ได้ชัวร์กว่า CI)
#
# ตั้ง cron:  crontab -e  แล้วเพิ่ม (ทุก 20 นาที):
#   */20 * * * * /Users/nok/Claude/silver-dashboard/scripts/update-and-push.sh >> /tmp/silver-dashboard.log 2>&1
set -euo pipefail

# cron มี PATH จำกัด — ชี้ node/npm/git ให้ชัด
export PATH="/Users/nok/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd /Users/nok/Claude/silver-dashboard

echo "==== $(date '+%F %T') รัน snapshot ===="
npm run snapshot

if git diff --quiet -- public/data/latest.json; then
  echo "ราคาไม่เปลี่ยน — ไม่ push"
  exit 0
fi

git add public/data/latest.json
git commit -m "chore(data): silver snapshot $(date '+%F %H:%M')"
git push origin main
echo "push เรียบร้อย"
