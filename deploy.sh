#!/bin/bash
# 部署腳本：複製 production 設定並上傳靜態檔案

set -e

# 若本機有 config.js，先備份
if [ -f js/config.js ]; then
  cp js/config.js js/config.local.js
fi
cp js/config.prod.js js/config.js
scp -r index.html css js root@128.199.91.82:/var/www/project/snippyvault/
# 還原本機 config.js
if [ -f js/config.local.js ]; then
  mv js/config.local.js js/config.js
fi
echo "部署完成！"
