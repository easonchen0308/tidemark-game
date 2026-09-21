# 絕對傳奇：潮痕試煉靜態前台

這是明天活動可用的 GitHub Pages 單頁版。它不需要 Render、Node.js 或資料庫。

## 發布

在 GitHub 專案的 Settings → Pages，將來源設為 `Deploy from a branch`，選擇 `main` 分支與 `/docs` 資料夾。發布網址會是：

`https://easonchen0308.github.io/LocalQuestPlatform/tidemark/`

## 行為

- 首頁輸入隊名後進入遊戲。
- 進度會保留在同一支手機的瀏覽器；重新整理不會消失。
- 不會送出、收集或儲存玩家個資。
- 關卡、圖片連結、過關敘事與結局都固定在 `game-data.js`。

## 注意

這是純靜態網站，答案判斷必須放在瀏覽器中，不能視為真正保密；不同裝置之間也不會同步進度。它的優點是完全不依賴 Render，因此不會因 Render 重啟而遺失遊戲內容或本機進度。
