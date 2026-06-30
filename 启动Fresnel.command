#!/bin/zsh
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js。请先安装 Node.js 18 或更高版本。"
  echo "下载地址：https://nodejs.org/"
  read -k 1 "?按任意键退出..."
  exit 1
fi

open "http://127.0.0.1:8788/" >/dev/null 2>&1 &
node server.js
