# Stock MP

台股籌碼分析系統第一版，目標是用券商分點、法人與資券結構去篩選做多與做空候選股，並提供策略型進出場價格。

## 架構

- frontend: Bun + Next.js App Router + React + Tailwind CSS
- vercel deployment path: Next.js 同站 API Routes
- backend reference: ASP.NET Core Web API 保留作為原型與未來獨立服務參考
- 核心能力: 雙向籌碼評分、候選股排序、交易計畫輸出

## 目前已完成

- Next API 端點: /api/chip-analysis/opportunities
- Next API 端點: /api/chip-analysis/data-sources
- Next API 端點: /api/chip-analysis/backtest-summary
- 最新可用 TWSE 公開資料串接: 日成交、三大法人、資券
- 做多 / 做空分數、信心分數、建議進場、停損、停利
- 產業化評分權重，讓不同族群採用不同訊號邏輯
- 資料來源狀態 API 與回測停用狀態提示
- API 回傳明確標示 TWSE_ONLY 與股票池規則
- 前端儀表板顯示同站 API 結果，並支援日間 / 夜間切換

## 啟動方式

### Frontend

```powershell
Set-Location frontend
bun run dev
```

預設前端位址: http://localhost:3000

預設會直接使用同站的 Next API route，不需要另外啟後端。

若之後要改接外部 API，可設定環境變數:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:5273"
```

## Vercel 部署

這個版本已可單獨部署到 Vercel。建議在 Vercel 專案設定中：

- Repository 指向目前 repo
- Root Directory 可直接用 repo 根目錄；若你偏好也可手動設為 frontend
- Install Command 使用 bun install
- Build Command 使用 bun run build

部署後前端與 API 會同站運作，`NEXT_PUBLIC_API_BASE_URL` 可以留空。

若要調整可分析的上市股票條件，請修改 [frontend/src/lib/chip-analysis.ts](frontend/src/lib/chip-analysis.ts) 的篩選規則與 [frontend/src/lib/twse-live.ts](frontend/src/lib/twse-live.ts) 的資料整理流程。

## 重要說明

- 目前首頁資料來自 TWSE 公開資料，系統每次重整都會重新抓取最新可用交易日資料。
- 券商分點明細目前沒有免費公開來源，畫面中的主力/分點欄位是以公開法人流向代理，不是商用分點逐筆資料。
- 高勝率不能保證，必須以真實資料源、歷史回測、風控與滑價模型持續迭代。
- 若未來需要獨立擴充資料管線或權限控管，可再把 [backend/StockMP.Api](backend/StockMP.Api) 作為獨立服務重啟。