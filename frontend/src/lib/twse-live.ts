import { get as httpsGet } from "node:https";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

type BrokerFlow = {
  broker: string;
  netLots: number;
  fiveDayNetLots: number;
  followThroughRate: number;
  aggressionScore: number;
};

type InstitutionalFlow = {
  foreignNetLots: number;
  investmentTrustNetLots: number;
  dealerNetLots: number;
  foreignStreakDays: number;
  marginBalanceChangeRate: number;
  shortInterestChangeRate: number;
};

type PriceAction = {
  lastClose: number;
  dayChangePercent: number;
  fiveDayChangePercent: number;
  twentyDayChangePercent: number;
  distanceFromTwentyDayHighPercent: number;
  distanceFromTwentyDayLowPercent: number;
  estimatedAtrPercent: number;
};

type StockChipSnapshot = {
  symbol: string;
  name: string;
  sector: string;
  brokerFlows: BrokerFlow[];
  institutionalFlow: InstitutionalFlow;
  priceAction: PriceAction;
};

type DataSourceStatus = {
  name: string;
  category: string;
  status: string;
  lastUpdatedAt: string;
  coverage: string;
  notes: string;
};

type PriceRow = {
  symbol: string;
  name: string;
  tradeVolume: number;
  transactionCount: number;
  tradeValue: number;
  open: number;
  high: number;
  low: number;
  close: number;
  changeAmount: number;
};

type InstitutionalRow = {
  symbol: string;
  name: string;
  foreignNetLots: number;
  investmentTrustNetLots: number;
  dealerNetLots: number;
};

type MarginRow = {
  symbol: string;
  name: string;
  previousMarginBalance: number;
  currentMarginBalance: number;
  previousShortBalance: number;
  currentShortBalance: number;
};

type MarketTable = {
  date: string;
  rows: Map<string, PriceRow>;
};

type InstitutionalTable = {
  date: string;
  rows: Map<string, InstitutionalRow>;
};

type MarginTable = {
  date: string;
  rows: Map<string, MarginRow>;
};

type CompanyMeta = {
  symbol: string;
  name: string;
  sector: string;
};

export type LiveAnalysisDataset = {
  generatedAt: string;
  methodology: string[];
  snapshots: StockChipSnapshot[];
  dataSources: DataSourceStatus[];
};

const twseBaseUrl = "https://www.twse.com.tw/rwd/zh";
const twseOpenDataBaseUrl = "https://openapi.twse.com.tw/v1";
const historicalMarketDays = 20;
const historicalSearchDays = 45;
const institutionalWindowDays = 5;
const institutionalSearchDays = 10;
const marginSearchDays = 10;
const twseRequestTimeoutMs = 10_000;
const liveAnalysisCachePath = join(tmpdir(), "stock-mp-live-analysis.json");
const liveDataSourcesCachePath = join(tmpdir(), "stock-mp-live-data-sources.json");

let lastSuccessfulDataset: LiveAnalysisDataset | null = null;
let lastSuccessfulDataSources: DataSourceStatus[] | null = null;

export async function buildLiveAnalysisDataset(): Promise<LiveAnalysisDataset> {
  try {
    const [companyMetaMap, marketTables, institutionalTables, marginTables] = await Promise.all([
      fetchCompanyMetaMap(),
      fetchRecentMarketTables(historicalMarketDays, historicalSearchDays),
      fetchRecentInstitutionalTables(institutionalWindowDays, institutionalSearchDays),
      fetchRecentMarginTables(2, marginSearchDays),
    ]);

    if (marketTables.length === 0) {
      throw new Error("目前無法取得 TWSE 上市收盤資料。");
    }

    const latestMarketTable = marketTables[0];
    const latestInstitutionalTable = institutionalTables[0] ?? null;
    const latestMarginTable = marginTables[0] ?? null;
    const previousMarginTable = marginTables[1] ?? null;
    const snapshots = buildSnapshots(
      companyMetaMap,
      marketTables,
      institutionalTables,
      latestInstitutionalTable,
      latestMarginTable,
      previousMarginTable,
    );

    const dataset = {
      generatedAt: new Date().toISOString(),
      methodology: [
        `每次請求都即時抓取 TWSE 上市收盤資料，最新可用日為 ${formatDateLabel(latestMarketTable.date)}。`,
        latestInstitutionalTable
          ? `法人買賣超使用 TWSE T86 最近可用公告日 ${formatDateLabel(latestInstitutionalTable.date)}。`
          : "法人買賣超今日尚無可用資料，暫不納入。",
        latestMarginTable
          ? `融資融券使用 TWSE 最近可用公告日 ${formatDateLabel(latestMarginTable.date)}，並與前一可用日比較變化率。`
          : "融資融券今日尚無可用資料，暫不納入。",
        "公開資料不含券商分點明細，現以外資、投信、自營商近五日真實流向作為公開籌碼代理。",
        "所有數值均來自最新可用公開資料；若交易所當日尚未更新，系統會自動回退到最近可用交易日。",
      ],
      snapshots,
      dataSources: buildDataSources(latestMarketTable, latestInstitutionalTable, latestMarginTable),
    } satisfies LiveAnalysisDataset;

    lastSuccessfulDataset = dataset;
    lastSuccessfulDataSources = dataset.dataSources;
    void writeJsonCache(liveAnalysisCachePath, dataset);
    void writeJsonCache(liveDataSourcesCachePath, dataset.dataSources);
    return dataset;
  } catch (error) {
    if (lastSuccessfulDataset) {
      return {
        ...lastSuccessfulDataset,
        methodology: [
          ...lastSuccessfulDataset.methodology,
          `本次更新因 TWSE 暫時拒絕回應而回退到最近一次成功抓取的真實資料：${formatIsoTimestamp(lastSuccessfulDataset.generatedAt)}。`,
        ],
      };
    }

    const cachedDataset = await readJsonCache<LiveAnalysisDataset>(liveAnalysisCachePath);

    if (cachedDataset) {
      lastSuccessfulDataset = cachedDataset;
      lastSuccessfulDataSources = cachedDataset.dataSources;

      return {
        ...cachedDataset,
        methodology: [
          ...cachedDataset.methodology,
          `本次更新因 TWSE 暫時拒絕回應而回退到最近一次成功抓取的真實資料：${formatIsoTimestamp(cachedDataset.generatedAt)}。`,
        ],
      };
    }

    throw error;
  }
}

export async function getLiveDataSources(): Promise<DataSourceStatus[]> {
  try {
    const [marketTables, institutionalTables, marginTables] = await Promise.all([
      fetchRecentMarketTables(1, 7),
      fetchRecentInstitutionalTables(1, institutionalSearchDays),
      fetchRecentMarginTables(1, marginSearchDays),
    ]);

    const dataSources = buildDataSources(marketTables[0] ?? null, institutionalTables[0] ?? null, marginTables[0] ?? null);
    lastSuccessfulDataSources = dataSources;
    void writeJsonCache(liveDataSourcesCachePath, dataSources);
    return dataSources;
  } catch (error) {
    if (lastSuccessfulDataSources) {
      return lastSuccessfulDataSources.map((source) => ({
        ...source,
        notes: `${source.notes} TWSE 本次暫時無法回應，已保留最近一次成功抓取的真實資料狀態。`,
      }));
    }

    const cachedDataSources = await readJsonCache<DataSourceStatus[]>(liveDataSourcesCachePath);

    if (cachedDataSources) {
      lastSuccessfulDataSources = cachedDataSources;
      return cachedDataSources.map((source) => ({
        ...source,
        notes: `${source.notes} TWSE 本次暫時無法回應，已保留最近一次成功抓取的真實資料狀態。`,
      }));
    }

    throw error;
  }
}

function buildSnapshots(
  companyMetaMap: Map<string, CompanyMeta>,
  marketTables: MarketTable[],
  institutionalTables: InstitutionalTable[],
  latestInstitutionalTable: InstitutionalTable | null,
  latestMarginTable: MarginTable | null,
  previousMarginTable: MarginTable | null,
): StockChipSnapshot[] {
  const latestSymbols = [...marketTables[0].rows.keys()].filter((symbol) => companyMetaMap.has(symbol));

  return latestSymbols
    .map((symbol) => {
      const companyMeta = companyMetaMap.get(symbol);
      const latestPriceRow = marketTables[0].rows.get(symbol);

      if (!companyMeta || !latestPriceRow || latestPriceRow.close <= 0 || latestPriceRow.tradeVolume <= 0) {
        return null;
      }

      const priceHistory = marketTables
        .map((table) => table.rows.get(symbol))
        .filter((row): row is PriceRow => Boolean(row));
      const institutionalHistory = institutionalTables
        .map((table) => table.rows.get(symbol) ?? emptyInstitutionalRow(symbol, companyMeta.name))
        .slice(0, institutionalWindowDays);
      const latestInstitutionalRow = latestInstitutionalTable?.rows.get(symbol) ?? emptyInstitutionalRow(symbol, companyMeta.name);
      const latestMarginRow = latestMarginTable?.rows.get(symbol) ?? emptyMarginRow(symbol, companyMeta.name);
      const previousMarginRow = previousMarginTable?.rows.get(symbol) ?? emptyMarginRow(symbol, companyMeta.name);

      return {
        symbol,
        name: companyMeta.name,
        sector: companyMeta.sector,
        brokerFlows: buildPublicProxyBrokerFlows(institutionalHistory),
        institutionalFlow: buildInstitutionalFlow(latestInstitutionalRow, institutionalHistory, latestMarginRow, previousMarginRow),
        priceAction: buildPriceAction(priceHistory),
      } satisfies StockChipSnapshot;
    })
    .filter((snapshot): snapshot is StockChipSnapshot => Boolean(snapshot));
}

function buildDataSources(
  marketTable: MarketTable | null,
  institutionalTable: InstitutionalTable | null,
  marginTable: MarginTable | null,
): DataSourceStatus[] {
  return [
    {
      name: "TWSE Daily Market",
      category: "價格與成交",
      status: marketTable ? "Live" : "Unavailable",
      lastUpdatedAt: marketTable ? toIsoDate(marketTable.date) : new Date(0).toISOString(),
      coverage: "上市日線、成交量、漲跌幅、20 日區間位置",
      notes: marketTable ? `已使用 ${formatDateLabel(marketTable.date)} 最新可用上市收盤資料。` : "目前無法取得 TWSE 收盤資料。",
    },
    {
      name: "Institutional Flow",
      category: "法人籌碼",
      status: institutionalTable ? "Live" : "Unavailable",
      lastUpdatedAt: institutionalTable ? toIsoDate(institutionalTable.date) : new Date(0).toISOString(),
      coverage: "外資、投信、自營商買賣超與五日方向延續",
      notes: institutionalTable ? `已使用 ${formatDateLabel(institutionalTable.date)} 最近可用三大法人資料。` : "今日尚無三大法人可用資料。",
    },
    {
      name: "Margin Short Interest",
      category: "資券",
      status: marginTable ? "Live" : "Unavailable",
      lastUpdatedAt: marginTable ? toIsoDate(marginTable.date) : new Date(0).toISOString(),
      coverage: "融資、融券與日變化率",
      notes: marginTable ? `已使用 ${formatDateLabel(marginTable.date)} 最近可用融資融券資料。` : "今日尚無融資融券可用資料。",
    },
    {
      name: "Public Chip Proxy",
      category: "公開籌碼代理",
      status: "Live",
      lastUpdatedAt: institutionalTable ? toIsoDate(institutionalTable.date) : new Date().toISOString(),
      coverage: "外資、投信、自營商五日淨流向代理主導籌碼",
      notes: "公開資料不含券商分點，當前版本以三大法人五日流向作為可直接使用的公開籌碼代理。",
    },
  ];
}

async function fetchRecentMarketTables(requiredCount: number, maxSearchDays: number): Promise<MarketTable[]> {
  const tables: MarketTable[] = [];

  for (let offset = 0; offset < maxSearchDays && tables.length < requiredCount; offset += 1) {
    const date = formatDateCode(addDays(new Date(), -offset));
    let table: MarketTable | null = null;

    try {
      table = await fetchMarketTable(date);
    } catch {
      continue;
    }

    if (table) {
      tables.push(table);
    }
  }

  return tables;
}

async function fetchRecentInstitutionalTables(requiredCount: number, maxSearchDays: number): Promise<InstitutionalTable[]> {
  const tables: InstitutionalTable[] = [];

  for (let offset = 0; offset < maxSearchDays && tables.length < requiredCount; offset += 1) {
    const date = formatDateCode(addDays(new Date(), -offset));
    let table: InstitutionalTable | null = null;

    try {
      table = await fetchInstitutionalTable(date);
    } catch {
      continue;
    }

    if (table) {
      tables.push(table);
    }
  }

  return tables;
}

async function fetchRecentMarginTables(requiredCount: number, maxSearchDays: number): Promise<MarginTable[]> {
  const tables: MarginTable[] = [];

  for (let offset = 0; offset < maxSearchDays && tables.length < requiredCount; offset += 1) {
    const date = formatDateCode(addDays(new Date(), -offset));
    let table: MarginTable | null = null;

    try {
      table = await fetchMarginTable(date);
    } catch {
      continue;
    }

    if (table) {
      tables.push(table);
    }
  }

  return tables;
}

async function fetchMarketTable(date: string): Promise<MarketTable | null> {
  const response = await fetchJson(`${twseBaseUrl}/afterTrading/MI_INDEX?date=${date}&type=ALLBUT0999&response=json`);
  const table = response?.tables?.find((item: { title?: string }) => item.title?.includes("每日收盤行情"));

  if (!table?.data?.length) {
    return null;
  }

  const rows = new Map<string, PriceRow>();

  for (const rawRow of table.data as unknown[]) {
    const row = normalizeRow(rawRow);
    const symbol = cleanText(row[0]);

    if (!/^\d{4}$/.test(symbol)) {
      continue;
    }

    rows.set(symbol, {
      symbol,
      name: cleanText(row[1]),
      tradeVolume: toNumber(row[2]),
      transactionCount: toNumber(row[3]),
      tradeValue: toNumber(row[4]),
      open: toNumber(row[5]),
      high: toNumber(row[6]),
      low: toNumber(row[7]),
      close: toNumber(row[8]),
      changeAmount: toSignedChange(row[9], row[10]),
    });
  }

  return rows.size > 0 ? { date, rows } : null;
}

async function fetchInstitutionalTable(date: string): Promise<InstitutionalTable | null> {
  const response = await fetchJson(`${twseBaseUrl}/fund/T86?date=${date}&selectType=ALLBUT0999&response=json`);

  if (!response?.data?.length) {
    return null;
  }

  const rows = new Map<string, InstitutionalRow>();

  for (const rawRow of response.data as unknown[]) {
    const row = normalizeRow(rawRow);
    const symbol = cleanText(row[0]);

    if (!/^\d{4}$/.test(symbol)) {
      continue;
    }

    rows.set(symbol, {
      symbol,
      name: cleanText(row[1]),
      foreignNetLots: toLots(row[4]) + toLots(row[7]),
      investmentTrustNetLots: toLots(row[10]),
      dealerNetLots: toLots(row[11]),
    });
  }

  return rows.size > 0 ? { date, rows } : null;
}

async function fetchMarginTable(date: string): Promise<MarginTable | null> {
  const response = await fetchJson(`${twseBaseUrl}/marginTrading/MI_MARGN?date=${date}&selectType=ALL&response=json`);
  const table = response?.tables?.find((item: { title?: string }) => item.title?.includes("融資融券彙總"));

  if (!table?.data?.length) {
    return null;
  }

  const rows = new Map<string, MarginRow>();

  for (const rawRow of table.data as unknown[]) {
    const row = normalizeRow(rawRow);
    const symbol = cleanText(row[0]);

    if (!/^\d{4}$/.test(symbol)) {
      continue;
    }

    rows.set(symbol, {
      symbol,
      name: cleanText(row[1]),
      previousMarginBalance: toNumber(row[5]),
      currentMarginBalance: toNumber(row[6]),
      previousShortBalance: toNumber(row[11]),
      currentShortBalance: toNumber(row[12]),
    });
  }

  return rows.size > 0 ? { date, rows } : null;
}

async function fetchCompanyMetaMap(): Promise<Map<string, CompanyMeta>> {
  const records = await fetchJson(`${twseOpenDataBaseUrl}/opendata/t187ap03_L`);

  if (!Array.isArray(records) || records.length === 0) {
    return new Map();
  }

  const sampleRecord = records[0] as Record<string, string>;
  const codeKey = detectKey(sampleRecord, ["公司代號", "證券代號"]);
  const nameKey = detectKey(sampleRecord, ["公司簡稱", "公司名稱", "證券名稱"]);
  const sectorKey = detectKey(sampleRecord, ["產業別", "產業類別", "產業"]);
  const map = new Map<string, CompanyMeta>();

  for (const record of records as Record<string, string>[]) {
    const symbol = cleanText(codeKey ? record[codeKey] : "");

    if (!/^\d{4}$/.test(symbol)) {
      continue;
    }

    const name = cleanText(nameKey ? record[nameKey] : "");
    const rawSector = cleanText(sectorKey ? record[sectorKey] : "");
    map.set(symbol, {
      symbol,
      name: name || symbol,
      sector: normalizeSector(rawSector, name || symbol),
    });
  }

  return map;
}

function buildPublicProxyBrokerFlows(history: InstitutionalRow[]): BrokerFlow[] {
  return [
    buildProxyFlow("外資", history.map((item) => item.foreignNetLots)),
    buildProxyFlow("投信", history.map((item) => item.investmentTrustNetLots)),
    buildProxyFlow("自營商", history.map((item) => item.dealerNetLots)),
  ];
}

function buildProxyFlow(label: string, values: number[]): BrokerFlow {
  const latest = values[0] ?? 0;
  const fiveDayNetLots = sum(values.slice(0, institutionalWindowDays));
  const baseDirection = Math.sign(fiveDayNetLots || latest);
  const nonZeroValues = values.slice(0, institutionalWindowDays).filter((value) => value !== 0);
  const followThroughRate = nonZeroValues.length === 0
    ? 0.5
    : nonZeroValues.filter((value) => Math.sign(value) === baseDirection).length / nonZeroValues.length;
  const totalAbs = sum(nonZeroValues.map((value) => Math.abs(value)));
  const aggressionScore = totalAbs === 0 ? 0.35 : clamp(Math.abs(fiveDayNetLots) / totalAbs, 0.2, 1);

  return {
    broker: label,
    netLots: round(latest, 1),
    fiveDayNetLots: round(fiveDayNetLots, 1),
    followThroughRate: round(followThroughRate, 3),
    aggressionScore: round(aggressionScore, 3),
  };
}

function buildInstitutionalFlow(
  latestRow: InstitutionalRow,
  history: InstitutionalRow[],
  latestMarginRow: MarginRow,
  previousMarginRow: MarginRow,
): InstitutionalFlow {
  return {
    foreignNetLots: latestRow.foreignNetLots,
    investmentTrustNetLots: latestRow.investmentTrustNetLots,
    dealerNetLots: latestRow.dealerNetLots,
    foreignStreakDays: calculateDirectionalStreak(history.map((item) => item.foreignNetLots)),
    marginBalanceChangeRate: calculateChangeRate(previousMarginRow.currentMarginBalance, latestMarginRow.currentMarginBalance),
    shortInterestChangeRate: calculateChangeRate(previousMarginRow.currentShortBalance, latestMarginRow.currentShortBalance),
  };
}

function buildPriceAction(history: PriceRow[]): PriceAction {
  const latest = history[0];
  const previousClose = history[1]?.close || latest.close - latest.changeAmount || latest.close;
  const fiveDayReference = history[Math.min(4, history.length - 1)]?.close || latest.close;
  const twentyDayHistory = history.slice(0, Math.min(historicalMarketDays, history.length));
  const twentyDayReference = twentyDayHistory[twentyDayHistory.length - 1]?.close || latest.close;
  const twentyDayHigh = Math.max(...twentyDayHistory.map((item) => item.high || item.close));
  const twentyDayLow = Math.min(...twentyDayHistory.map((item) => item.low || item.close));
  const atrSample = twentyDayHistory.slice(0, Math.min(14, twentyDayHistory.length));
  const estimatedAtrPercent = average(atrSample.map((item) => ((item.high || item.close) - (item.low || item.close)) / Math.max(item.close, 0.01) * 100));

  return {
    lastClose: latest.close,
    dayChangePercent: calculateChangeRate(previousClose, latest.close),
    fiveDayChangePercent: calculateChangeRate(fiveDayReference, latest.close),
    twentyDayChangePercent: calculateChangeRate(twentyDayReference, latest.close),
    distanceFromTwentyDayHighPercent: twentyDayHigh > 0 ? round(((twentyDayHigh - latest.close) / twentyDayHigh) * 100, 1) : 0,
    distanceFromTwentyDayLowPercent: twentyDayLow > 0 ? round(((latest.close - twentyDayLow) / twentyDayLow) * 100, 1) : 0,
    estimatedAtrPercent: round(estimatedAtrPercent, 1),
  };
}

function emptyInstitutionalRow(symbol: string, name: string): InstitutionalRow {
  return { symbol, name, foreignNetLots: 0, investmentTrustNetLots: 0, dealerNetLots: 0 };
}

function emptyMarginRow(symbol: string, name: string): MarginRow {
  return { symbol, name, previousMarginBalance: 0, currentMarginBalance: 0, previousShortBalance: 0, currentShortBalance: 0 };
}

async function fetchJson(url: string): Promise<any> {
  const text = await requestText(url);
  return JSON.parse(text);
}

function requestText(url: string, redirectDepth = 0, retryCount = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = httpsGet(
      url,
      {
        headers: {
          Accept: "application/json, text/plain, */*",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
          "User-Agent": "Mozilla/5.0",
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;

        if (statusCode >= 300 && statusCode < 400) {
          const location = response.headers.location;
          response.resume();

          if (!location) {
            if (retryCount < 3) {
              resolve(retryRequest(url, redirectDepth, retryCount));
              return;
            }

            reject(new Error(`TWSE request redirected without location: ${statusCode}`));
            return;
          }

          if (redirectDepth >= 3) {
            reject(new Error(`TWSE request exceeded redirect limit: ${statusCode}`));
            return;
          }

          resolve(requestText(new URL(location, url).toString(), redirectDepth + 1, retryCount));
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();

          if (retryCount < 3 && isTransientStatus(statusCode)) {
            resolve(retryRequest(url, redirectDepth, retryCount));
            return;
          }

          reject(new Error(`TWSE request failed: ${statusCode}`));
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve(body);
        });
      },
    );

    request.setTimeout(twseRequestTimeoutMs, () => {
      request.destroy(new Error(`TWSE request timed out after ${twseRequestTimeoutMs}ms`));
    });

    request.on("error", (error) => {
      if (retryCount < 3) {
        resolve(retryRequest(url, redirectDepth, retryCount));
        return;
      }

      reject(error);
    });
  });
}

function retryRequest(url: string, redirectDepth: number, retryCount: number) {
  const delayMs = 400 * (retryCount + 1);
  return wait(delayMs).then(() => requestText(url, redirectDepth, retryCount + 1));
}

function isTransientStatus(statusCode: number) {
  return statusCode === 307 || statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function formatIsoTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const hours = `${date.getUTCHours()}`.padStart(2, "0");
  const minutes = `${date.getUTCMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

async function writeJsonCache<T>(filePath: string, value: T) {
  try {
    await writeFile(filePath, JSON.stringify(value), "utf8");
  } catch {
    // Ignore cache write failures and keep serving live responses.
  }
}

async function readJsonCache<T>(filePath: string) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function detectKey(record: Record<string, string>, candidates: string[]) {
  return Object.keys(record).find((key) => candidates.some((candidate) => key.includes(candidate)));
}

function normalizeSector(rawSector: string, name: string) {
  if (rawSector.includes("航運")) {
    return "航運";
  }

  if (rawSector.includes("半導體")) {
    return inferIcDesign(name) ? "IC 設計" : "半導體";
  }

  if (rawSector.includes("電腦及週邊設備")) {
    return "伺服器";
  }

  return rawSector || "Balanced Core";
}

function inferIcDesign(name: string) {
  return ["聯發科", "瑞昱", "聯詠", "創意", "世芯", "祥碩", "愛普", "M31", "晶心科", "矽力", "天鈺", "原相", "力旺"].some((keyword) => name.includes(keyword));
}

function normalizeRow(rawRow: unknown) {
  if (Array.isArray(rawRow)) {
    return rawRow.map((value) => String(value ?? ""));
  }

  if (rawRow && typeof rawRow === "object" && "value" in rawRow && Array.isArray((rawRow as { value: unknown[] }).value)) {
    return (rawRow as { value: unknown[] }).value.map((value) => String(value ?? ""));
  }

  return [] as string[];
}

function cleanText(value: string | undefined) {
  return String(value ?? "").replace(/<[^>]*>/g, "").replace(/,/g, "").trim();
}

function toNumber(value: string | undefined) {
  const normalized = cleanText(value).replace(/--/g, "0");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toLots(value: string | undefined) {
  return round(toNumber(value) / 1000, 1);
}

function toSignedChange(signCell: string | undefined, deltaCell: string | undefined) {
  const amount = Math.abs(toNumber(deltaCell));
  const sign = cleanText(signCell);

  if (sign.includes("-")) {
    return -amount;
  }

  if (sign.includes("+")) {
    return amount;
  }

  return amount === 0 ? 0 : amount;
}

function calculateDirectionalStreak(values: number[]) {
  const firstValue = values.find((value) => value !== 0) ?? 0;
  const direction = Math.sign(firstValue);

  if (direction === 0) {
    return 0;
  }

  let streak = 0;

  for (const value of values) {
    if (value === 0 || Math.sign(value) !== direction) {
      break;
    }

    streak += 1;
  }

  return streak * direction;
}

function calculateChangeRate(previous: number, current: number) {
  if (!previous) {
    return 0;
  }

  return round(((current - previous) / previous) * 100, 1);
}

function formatDateCode(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatDateLabel(date: string) {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function toIsoDate(date: string) {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00.000Z`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function round(value: number, digits: number) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}