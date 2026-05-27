# Stock MP

台股籌碼分析系統第一版，目標是用券商分點、法人與資券結構去篩選做多與做空候選股，並提供策略型進出場價格。

## 架構

- frontend: Bun + Next.js App Router + React + Tailwind CSS
- backend: ASP.NET Core Web API
- 核心能力: 雙向籌碼評分、候選股排序、交易計畫輸出

## 目前已完成

- API 端點: /api/chip-analysis/opportunities
- API 端點: /api/chip-analysis/data-sources
- API 端點: /api/chip-analysis/backtest-summary
- 內建示範股票池與籌碼樣本
- 做多 / 做空分數、信心分數、建議進場、停損、停利
- 產業化評分權重，讓不同族群採用不同訊號邏輯
- 回測摘要與資料來源狀態 API
- API 回傳明確標示 TWSE_ONLY 與股票池規則
- 上市股票池白名單改由 appsettings.json 的 ListedUniverse.Symbols 控制
- 前端儀表板顯示 API 結果，若 API 未啟動則顯示示範資料，並支援日間 / 夜間切換

## 啟動方式

### Backend

```powershell
Set-Location backend/StockMP.Api
dotnet run
```

預設開發位址: http://localhost:5273

### Frontend

```powershell
Set-Location frontend
bun run dev
```

預設前端位址: http://localhost:3000

若 API 位址不同，可設定環境變數:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:5273"
```

若要調整可分析的上市股票池，請修改 backend/StockMP.Api/appsettings.json 中的 ListedUniverse.Symbols。

## 重要說明

- 目前資料來源是示範樣本，不是正式即時盤後資料。
- 高勝率不能保證，必須以真實資料源、歷史回測、風控與滑價模型持續迭代。
- 下一步應優先接上上市日線、分點、法人買賣超、融資融券等真實資料管線。