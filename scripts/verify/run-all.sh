#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# run-all.sh — Gipfel 自动化验证套件入口
#   依次运行：verify-local.js（本地 DB）→ verify-cloud.py（云端 API）
#            → verify-ui.js（UI 静态检查），最后输出 PASS/FAIL 汇总。
#
# 退出码约定：脚本退出码 0=PASS  1=FAIL  2=SKIP（云端不可达）
# run-all 退出码：全部 PASS/SKIP → 0；任一 FAIL → 1
# ─────────────────────────────────────────────────────────────────────
set -u
cd "$(dirname "$0")/../.." || { echo "无法进入项目根目录"; exit 2; }
ROOT="$(pwd)"
echo "项目根目录: $ROOT"
echo ""

node scripts/verify/verify-local.js
LOCAL=$?

python scripts/verify/verify-cloud.py
CLOUD=$?

node scripts/verify/verify-ui.js
UI=$?

echo ""
echo "══════════════════════════════════════════"
echo "  验证汇总"
echo "══════════════════════════════════════════"
declare -a NAMES=(本地数据库 verify-local 云端 API verify-cloud UI静态检查 verify-ui)
overall=0
for entry in "本地数据库|verify-local|$LOCAL" "云端 API|verify-cloud|$CLOUD" "UI 静态检查|verify-ui|$UI"; do
  IFS='|' read -r label script code <<< "$entry"
  case "$code" in
    0)  status="PASS" ;;
    2)  status="SKIP" ;;
    *)  status="FAIL"; overall=1 ;;
  esac
  printf "  %-12s %-12s %s\n" "$label" "($script)" "$status"
done
echo ""
if [ "$overall" -eq 0 ]; then
  echo "总体: PASS"
  exit 0
else
  echo "总体: FAIL（存在未通过的检查，详情见上方输出）"
  exit 1
fi
