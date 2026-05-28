"use client";

import { Suspense, startTransition, useEffect, useMemo, useRef, useState } from "react";
import { type ReadonlyURLSearchParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { InfoButton } from "./info-button";
import { ThemeToggle } from "./theme-toggle";

type InfoSpec = {
  title: string;
  description: string;
  formula?: string;
  bullets?: string[];
  risks?: string[];
};

type SortOption = "conviction" | "confidence" | "riskReward" | "dayChange" | "contextWinRate" | "contextProfitFactor";

type ContextConfidenceFilter = "all" | "high" | "midHigh" | "mid" | "low";

type ContextWinRateThreshold = "all" | "60" | "65" | "70";

type SimilarSignalCountThreshold = "all" | "30" | "50" | "70";

type ListControlState = {
  query: string;
  sector: string;
  sortBy: SortOption;
  contextConfidence: ContextConfidenceFilter;
  contextWinRateThreshold: ContextWinRateThreshold;
  similarSignalCountThreshold: SimilarSignalCountThreshold;
};

type TradeDirection = "Long" | "Short" | "Neutral";

type TradePlan = {
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  riskRewardRatio: number;
};

type BrokerFingerprintProfile = {
  dominantBroker: string;
  patternLabel: string;
  continuityScore: number;
  aggressionScore: number;
  concentrationScore: number;
  institutionalAlignmentScore: number;
  edgeScore: number;
  summary: string;
};

type ContextSignalEdge = {
  marketRegime: string;
  brokerFingerprint: string;
  fingerprintProfile: BrokerFingerprintProfile;
  similarSignalCount: number;
  historicalWinRate: number;
  historicalAverageReturnPercent: number;
  historicalProfitFactor: number;
  confidenceLabel: string;
  matchingTraits: string[];
};

function applyUltraConservativePreset(controls: ListControlState): ListControlState {
  return {
    ...controls,
    sortBy: "contextWinRate",
    contextConfidence: "high",
    contextWinRateThreshold: "70",
    similarSignalCountThreshold: "70",
  };
}

function applyHighEfficiencyPreset(controls: ListControlState): ListControlState {
  return {
    ...controls,
    sortBy: "contextProfitFactor",
    contextConfidence: "midHigh",
    contextWinRateThreshold: "60",
    similarSignalCountThreshold: "50",
  };
}

function isHighWinRatePresetActive(controls: ListControlState) {
  return controls.sortBy === "contextWinRate"
    && controls.contextConfidence === "midHigh"
    && controls.contextWinRateThreshold === "65"
    && controls.similarSignalCountThreshold === "50";
}

function isUltraConservativePresetActive(controls: ListControlState) {
  return controls.sortBy === "contextWinRate"
    && controls.contextConfidence === "high"
    && controls.contextWinRateThreshold === "70"
    && controls.similarSignalCountThreshold === "70";
}

function isHighEfficiencyPresetActive(controls: ListControlState) {
  return controls.sortBy === "contextProfitFactor"
    && controls.contextConfidence === "midHigh"
    && controls.contextWinRateThreshold === "60"
    && controls.similarSignalCountThreshold === "50";
}

function activePresetLabel(controls: ListControlState) {
  if (isUltraConservativePresetActive(controls)) {
    return "極保守模式";
  }

  if (isHighEfficiencyPresetActive(controls)) {
    return "高效率模式";
  }

  if (isHighWinRatePresetActive(controls)) {
    return "高勝率模式";
  }

  return "自訂條件";
}

function recommendationAlignment(longMode: string, shortMode: string, recommendedLongMode: string, recommendedShortMode: string) {
  const longAligned = longMode === recommendedLongMode;
  const shortAligned = shortMode === recommendedShortMode;

  if (longAligned && shortAligned) {
    return {
      label: "已與推薦一致",
      toneClass: "bg-[rgba(31,122,70,0.12)] text-[color:var(--success)]",
      info: {
        title: "推薦一致狀態",
        description: "目前做多與做空兩邊都已套用系統當前建議的推薦模式。",
        bullets: [`做多: ${longMode}`, `做空: ${shortMode}`],
      } satisfies InfoSpec,
    };
  }

  if (longAligned || shortAligned) {
    return {
      label: "部分與推薦一致",
      toneClass: "bg-[rgba(186,74,0,0.12)] text-[color:var(--accent)]",
      info: {
        title: "推薦一致狀態",
        description: "目前只有其中一邊清單與系統推薦模式一致，另一邊仍是不同設定。",
        bullets: [`做多: 目前 ${longMode} / 推薦 ${recommendedLongMode}`, `做空: 目前 ${shortMode} / 推薦 ${recommendedShortMode}`],
      } satisfies InfoSpec,
    };
  }

  return {
    label: "尚未與推薦一致",
    toneClass: "bg-chip text-muted",
    info: {
      title: "推薦一致狀態",
      description: "目前做多與做空兩邊都還沒對齊到系統建議的推薦模式。",
      bullets: [`做多: 目前 ${longMode} / 推薦 ${recommendedLongMode}`, `做空: 目前 ${shortMode} / 推薦 ${recommendedShortMode}`],
      risks: ["目前閱讀回測時，可能和系統建議的清單邏輯不一致"],
    } satisfies InfoSpec,
  };
}

type StockSignal = {
  symbol: string;
  name: string;
  sector: string;
  strategyProfile: string;
  direction: TradeDirection;
  convictionScore: number;
  accumulationScore: number;
  distributionScore: number;
  confidence: number;
  lastClose: number;
  dayChangePercent: number;
  fiveDayChangePercent: number;
  twentyDayChangePercent: number;
  primaryBrokers: string[];
  rationale: string[];
  tradePlan: TradePlan | null;
  contextEdge?: ContextSignalEdge;
};

type AnalysisResponse = {
  generatedAt: string;
  marketScope: string;
  universeRule: string;
  methodology: string[];
  longCandidates: StockSignal[];
  shortCandidates: StockSignal[];
  allSignals: StockSignal[];
};

type DataSourceStatus = {
  name: string;
  category: string;
  status: string;
  lastUpdatedAt: string;
  coverage: string;
  notes: string;
};

type BacktestPeriodMetric = {
  period: string;
  totalSignals: number;
  winRate: number | null;
  averageReturnPercent: number | null;
  maxDrawdownPercent: number | null;
  profitFactor: number | null;
};

type BacktestSummary = {
  generatedAt: string;
  periods: BacktestPeriodMetric[];
  overallWinRate: number | null;
  averageReturnPercent: number | null;
  maxDrawdownPercent: number | null;
  profitFactor: number | null;
  notes: string;
};

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
const apiBaseLabel = apiBaseUrl || "same-origin";
const dashboardRequestTimeoutMs = 90_000;
const emptyAnalysis: AnalysisResponse = {
  generatedAt: "",
  marketScope: "TWSE_ONLY",
  universeRule: "等待最新上市資料",
  methodology: [],
  longCandidates: [],
  shortCandidates: [],
  allSignals: [],
};
const emptyBacktest: BacktestSummary = {
  generatedAt: "",
  periods: [],
  overallWinRate: null,
  averageReturnPercent: null,
  maxDrawdownPercent: null,
  profitFactor: null,
  notes: "尚未提供真實歷史回測資料。",
};

function fetchWithTimeout(input: string, init?: RequestInit, timeoutMs = dashboardRequestTimeoutMs) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError"));
  }, timeoutMs);

  return fetch(input, {
    ...init,
    signal: controller.signal,
  }).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "-";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

function signalTone(direction: TradeDirection) {
  if (direction === "Long") {
    return "text-[color:var(--success)] bg-[rgba(31,122,70,0.12)]";
  }

  if (direction === "Short") {
    return "text-[color:var(--danger)] bg-[rgba(166,44,43,0.12)]";
  }

  return "text-[color:var(--accent-cool)] bg-[rgba(0,95,115,0.12)]";
}

function priceTone(value: number) {
  return value >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--danger)]";
}

function formatRatio(value: number | null) {
  if (value === null) {
    return "-";
  }

  return value.toFixed(2);
}

function formatWinRate(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatTimestamp(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const hours = `${date.getUTCHours()}`.padStart(2, "0");
  const minutes = `${date.getUTCMinutes()}`.padStart(2, "0");
  const seconds = `${date.getUTCSeconds()}`.padStart(2, "0");

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds} UTC`;
}

function hasLiveFallbackNotice(messages: string[]) {
  return messages.some((message) => message.includes("回退到最近一次成功抓取的真實資料") || message.includes("保留最近一次成功抓取的真實資料狀態"));
}

function sortLabel(sortBy: SortOption) {
  const labels: Record<SortOption, string> = {
    conviction: "綜合分數",
    confidence: "勝率代理值",
    riskReward: "風報比",
    dayChange: "單日變化",
    contextWinRate: "情境勝率",
    contextProfitFactor: "情境 Profit Factor",
  };

  return labels[sortBy];
}

function parseSortOption(value: string | null): SortOption {
  return value === "confidence"
    || value === "riskReward"
    || value === "dayChange"
    || value === "contextWinRate"
    || value === "contextProfitFactor"
    || value === "conviction"
    ? value
    : "conviction";
}

function parseContextConfidenceFilter(value: string | null): ContextConfidenceFilter {
  return value === "high" || value === "midHigh" || value === "mid" || value === "low"
    ? value
    : "all";
}

function contextConfidenceFilterLabel(value: ContextConfidenceFilter) {
  const labels: Record<Exclude<ContextConfidenceFilter, "all">, string> = {
    high: "高",
    midHigh: "中高",
    mid: "中",
    low: "偏低",
  };

  return value === "all" ? "全部可信度" : labels[value];
}

function parseContextWinRateThreshold(value: string | null): ContextWinRateThreshold {
  return value === "60" || value === "65" || value === "70"
    ? value
    : "all";
}

function contextWinRateThresholdLabel(value: ContextWinRateThreshold) {
  return value === "all" ? "不限情境勝率" : `>= ${value}%`;
}

function parseSimilarSignalCountThreshold(value: string | null): SimilarSignalCountThreshold {
  return value === "30" || value === "50" || value === "70"
    ? value
    : "all";
}

function similarSignalCountThresholdLabel(value: SimilarSignalCountThreshold) {
  return value === "all" ? "不限樣本數" : `>= ${value} 筆`;
}

function applyHighWinRatePreset(controls: ListControlState): ListControlState {
  return {
    ...controls,
    sortBy: "contextWinRate",
    contextConfidence: "midHigh",
    contextWinRateThreshold: "65",
    similarSignalCountThreshold: "50",
  };
}

function presetToneClass(label: string) {
  if (label === "極保守模式") {
    return "bg-[rgba(186,74,0,0.12)] text-[color:var(--accent)]";
  }

  if (label === "高效率模式") {
    return "bg-[rgba(31,122,70,0.12)] text-[color:var(--success)]";
  }

  if (label === "高勝率模式") {
    return "bg-[rgba(0,95,115,0.12)] text-[color:var(--accent-cool)]";
  }

  return "bg-chip text-muted";
}

function presetInfo(side: "long" | "short", label: string): InfoSpec {
  const sideLabel = side === "long" ? "做多" : "做空";

  if (label === "極保守模式") {
    return {
      title: `${sideLabel}${label}`,
      description: `目前 ${sideLabel} 清單採用最嚴格的 preset，優先保留最高把握度的情境。`,
      bullets: ["排序: 情境勝率", "可信度: 高", "最低情境勝率: 70%", "最低相似樣本數: 70 筆"],
      risks: ["結果數量會明顯變少", "容易錯過報酬高但沒那麼保守的機會"],
    };
  }

  if (label === "高效率模式") {
    return {
      title: `${sideLabel}${label}`,
      description: `目前 ${sideLabel} 清單偏重盈虧效率，而不是只追求最高勝率。`,
      bullets: ["排序: 情境 Profit Factor", "可信度: 中高", "最低情境勝率: 60%", "最低相似樣本數: 50 筆"],
      risks: ["高 Profit Factor 不代表回撤一定小", "樣本特性若改變，效率指標可能快速失真"],
    };
  }

  if (label === "高勝率模式") {
    return {
      title: `${sideLabel}${label}`,
      description: `目前 ${sideLabel} 清單採用平衡型 preset，在結果數量與命中率之間折衷。`,
      bullets: ["排序: 情境勝率", "可信度: 中高", "最低情境勝率: 65%", "最低相似樣本數: 50 筆"],
      risks: ["仍可能保留部分品質普通的訊號", "不一定是每個市場階段的最佳解"],
    };
  }

  return {
    title: `${sideLabel}自訂條件`,
    description: `目前 ${sideLabel} 清單不是預設模式，而是依你手動調整後的自訂條件。`,
    bullets: ["可自由混搭排序、可信度、情境勝率與樣本數門檻"],
  };
}

function matchesContextConfidenceFilter(signal: StockSignal, filter: ContextConfidenceFilter) {
  if (filter === "all") {
    return true;
  }

  const label = signal.contextEdge?.confidenceLabel;

  if (filter === "high") {
    return label === "高";
  }

  if (filter === "midHigh") {
    return label === "中高";
  }

  if (filter === "mid") {
    return label === "中";
  }

  return label === "偏低";
}

function matchesContextWinRateThreshold(signal: StockSignal, threshold: ContextWinRateThreshold) {
  if (threshold === "all") {
    return true;
  }

  const winRate = signal.contextEdge?.historicalWinRate;

  if (winRate === undefined) {
    return false;
  }

  return winRate >= Number(threshold) / 100;
}

function matchesSimilarSignalCountThreshold(signal: StockSignal, threshold: SimilarSignalCountThreshold) {
  if (threshold === "all") {
    return true;
  }

  const similarSignalCount = signal.contextEdge?.similarSignalCount;

  if (similarSignalCount === undefined) {
    return false;
  }

  return similarSignalCount >= Number(threshold);
}

function controlQueryKeys(prefix: "long" | "short") {
  return prefix === "long"
    ? { query: "lq", sector: "ls", sort: "lo", contextConfidence: "lc", contextWinRate: "lw", similarSignalCount: "ln" }
    : { query: "sq", sector: "ss", sort: "so", contextConfidence: "sc", contextWinRate: "sw", similarSignalCount: "sn" };
}

function legacyControlQueryKeys(prefix: "long" | "short") {
  return {
    query: `${prefix}Query`,
    sector: `${prefix}Sector`,
    sort: `${prefix}Sort`,
    contextConfidence: `${prefix}ContextConfidence`,
    contextWinRate: `${prefix}ContextWinRateThreshold`,
    similarSignalCount: `${prefix}SimilarSignalCountThreshold`,
  };
}

function parseControls(searchParams: URLSearchParams | ReadonlyURLSearchParams, prefix: "long" | "short"): ListControlState {
  const keys = controlQueryKeys(prefix);

  return {
    query: searchParams.get(keys.query) ?? "",
    sector: searchParams.get(keys.sector) ?? "all",
    sortBy: parseSortOption(searchParams.get(keys.sort)),
    contextConfidence: parseContextConfidenceFilter(searchParams.get(keys.contextConfidence)),
    contextWinRateThreshold: parseContextWinRateThreshold(searchParams.get(keys.contextWinRate)),
    similarSignalCountThreshold: parseSimilarSignalCountThreshold(searchParams.get(keys.similarSignalCount)),
  };
}

function buildControlsSearchParams(
  searchParams: URLSearchParams | ReadonlyURLSearchParams,
  longControls: ListControlState,
  shortControls: ListControlState,
) {
  const nextParams = new URLSearchParams(searchParams.toString());

  const syncControls = (prefix: "long" | "short", controls: ListControlState) => {
    const keys = controlQueryKeys(prefix);
    const legacyKeys = legacyControlQueryKeys(prefix);

    nextParams.delete(legacyKeys.query);
    nextParams.delete(legacyKeys.sector);
    nextParams.delete(legacyKeys.sort);
    nextParams.delete(legacyKeys.contextConfidence);
    nextParams.delete(legacyKeys.contextWinRate);
    nextParams.delete(legacyKeys.similarSignalCount);

    const entries = [
      [keys.query, controls.query],
      [keys.sector, controls.sector === "all" ? "" : controls.sector],
      [keys.sort, controls.sortBy === "conviction" ? "" : controls.sortBy],
      [keys.contextConfidence, controls.contextConfidence === "all" ? "" : controls.contextConfidence],
      [keys.contextWinRate, controls.contextWinRateThreshold === "all" ? "" : controls.contextWinRateThreshold],
      [keys.similarSignalCount, controls.similarSignalCountThreshold === "all" ? "" : controls.similarSignalCountThreshold],
    ] as const;

    entries.forEach(([key, value]) => {
      if (value) {
        nextParams.set(key, value);
      } else {
        nextParams.delete(key);
      }
    });
  };

  syncControls("long", longControls);
  syncControls("short", shortControls);

  return nextParams;
}

function availableSectors(signals: StockSignal[]) {
  return [...new Set(signals.map((signal) => signal.sector))].sort((left, right) => left.localeCompare(right, "zh-TW"));
}

function signalSortValue(signal: StockSignal, sortBy: SortOption) {
  if (sortBy === "confidence") {
    return signal.confidence;
  }

  if (sortBy === "contextWinRate") {
    return signal.contextEdge?.historicalWinRate ?? -1;
  }

  if (sortBy === "contextProfitFactor") {
    return signal.contextEdge?.historicalProfitFactor ?? -1;
  }

  if (sortBy === "riskReward") {
    return signal.tradePlan?.riskRewardRatio ?? -1;
  }

  if (sortBy === "dayChange") {
    return Math.abs(signal.dayChangePercent);
  }

  return signal.convictionScore;
}

function filterSignals(signals: StockSignal[], controls: ListControlState) {
  return signals
    .filter((signal) => {
      const matchesQuery =
        controls.query.trim().length === 0
        || signal.symbol.includes(controls.query.trim())
        || signal.name.toLowerCase().includes(controls.query.trim().toLowerCase())
        || signal.strategyProfile.toLowerCase().includes(controls.query.trim().toLowerCase());

      const matchesSector = controls.sector === "all" || signal.sector === controls.sector;
      const matchesContextConfidence = matchesContextConfidenceFilter(signal, controls.contextConfidence);
      const matchesContextWinRate = matchesContextWinRateThreshold(signal, controls.contextWinRateThreshold);
      const matchesSimilarSignalCount = matchesSimilarSignalCountThreshold(signal, controls.similarSignalCountThreshold);

      return matchesQuery && matchesSector && matchesContextConfidence && matchesContextWinRate && matchesSimilarSignalCount;
    })
    .sort((left, right) => signalSortValue(right, controls.sortBy) - signalSortValue(left, controls.sortBy));
}

function recommendPresetControls(baseControls: ListControlState, signals: StockSignal[]) {
  const presetCandidates = [
    applyUltraConservativePreset(baseControls),
    applyHighWinRatePreset(baseControls),
    applyHighEfficiencyPreset(baseControls),
  ];

  return presetCandidates.find((controls) => filterSignals(signals, controls).length > 0) ?? applyHighEfficiencyPreset(baseControls);
}

function recommendedPresetLabel(baseControls: ListControlState, signals: StockSignal[]) {
  return activePresetLabel(recommendPresetControls(baseControls, signals));
}

function presetResultCounts(baseControls: ListControlState, signals: StockSignal[]) {
  const presets = [
    { label: "極保守模式", controls: applyUltraConservativePreset(baseControls) },
    { label: "高勝率模式", controls: applyHighWinRatePreset(baseControls) },
    { label: "高效率模式", controls: applyHighEfficiencyPreset(baseControls) },
  ] as const;

  return presets.map((preset) => ({
    label: preset.label,
    count: filterSignals(signals, preset.controls).length,
  }));
}

function recommendedPresetInfo(side: "long" | "short", baseControls: ListControlState, signals: StockSignal[]): InfoSpec {
  const sideLabel = side === "long" ? "做多" : "做空";
  const recommended = recommendedPresetLabel(baseControls, signals);
  const counts = presetResultCounts(baseControls, signals);
  const noPresetHasResults = counts.every((preset) => preset.count === 0);

  return {
    title: `${sideLabel}推薦模式`,
    description: noPresetHasResults
      ? `目前 ${sideLabel} 清單在三種 preset 下都沒有結果，因此退回 ${recommended} 作為較寬鬆的預設。`
      : `目前 ${sideLabel} 清單會優先選擇仍有結果的最嚴格 preset，現在建議使用 ${recommended}。`,
    bullets: counts.map((preset) => `${preset.label}: ${preset.count} 檔`),
    risks: ["推薦模式只看目前篩選後的結果數，不等於未來績效保證", "若搜尋字詞過窄，推薦結果可能偏向較寬鬆模式"],
  };
}

function relaxControlsForResults(baseControls: ListControlState, signals: StockSignal[]) {
  const candidates = [
    recommendPresetControls(baseControls, signals),
    { ...baseControls, contextConfidence: "all" as const },
    { ...baseControls, contextConfidence: "all" as const, contextWinRateThreshold: "all" as const },
    { ...baseControls, contextConfidence: "all" as const, contextWinRateThreshold: "all" as const, similarSignalCountThreshold: "all" as const },
    { ...baseControls, sector: "all", contextConfidence: "all" as const, contextWinRateThreshold: "all" as const, similarSignalCountThreshold: "all" as const },
    { ...baseControls, sector: "all", sortBy: "conviction" as const, contextConfidence: "all" as const, contextWinRateThreshold: "all" as const, similarSignalCountThreshold: "all" as const },
    { ...baseControls, query: "", sortBy: "conviction" as const, contextConfidence: "all" as const, contextWinRateThreshold: "all" as const, similarSignalCountThreshold: "all" as const },
    { query: "", sector: "all", sortBy: "conviction" as const, contextConfidence: "all" as const, contextWinRateThreshold: "all" as const, similarSignalCountThreshold: "all" as const },
  ];

  return candidates.find((controls) => filterSignals(signals, controls).length > 0)
    ?? candidates[candidates.length - 1];
}

function PresetComparisonCard({
  side,
  recommendedLabel,
  currentLabel,
  counts,
}: {
  side: "long" | "short";
  recommendedLabel: string;
  currentLabel: string;
  counts: Array<{ label: string; count: number }>;
}) {
  const sideLabel = side === "long" ? "做多" : "做空";

  return (
    <article className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-[0.22em] text-faint">{sideLabel} Recommendation</p>
            <InfoButton
              title={`${sideLabel}推薦比較`}
              description={`比較目前 ${sideLabel} 清單在三種 preset 下各自會留下多少檔標的，用來說明系統為什麼推薦現在這個模式。`}
              bullets={counts.map((entry) => `${entry.label}: ${entry.count} 檔`)}
              risks={["結果數只代表目前篩選後還剩多少檔，不代表未來績效", "搜尋或產業條件改變後，推薦模式也可能跟著改變"]}
            />
          </div>
          <p className="mt-2 text-lg font-semibold">推薦: {recommendedLabel}</p>
          <p className="mt-1 text-sm text-soft">目前: {currentLabel}</p>
        </div>
        <span className={`rounded-full px-3 py-2 text-sm font-medium ${presetToneClass(recommendedLabel)}`}>
          {recommendedLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {counts.map((entry) => (
          <div key={`${sideLabel}-${entry.label}`} className="rounded-2xl bg-[color:var(--surface-strong)] p-4">
            <p className="text-sm text-soft">{entry.label}</p>
            <p className="mt-2 text-2xl font-semibold">{entry.count}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-faint">候選檔數</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function appliedControlBadges(controls: ListControlState) {
  const badges: Array<{ key: keyof ListControlState; label: string; value: string }> = [];

  if (controls.query.trim()) {
    badges.push({ key: "query", label: "搜尋", value: controls.query.trim() });
  }

  if (controls.sector !== "all") {
    badges.push({ key: "sector", label: "產業", value: controls.sector });
  }

  if (controls.sortBy !== "conviction") {
    badges.push({ key: "sortBy", label: "排序", value: sortLabel(controls.sortBy) });
  }

  if (controls.contextConfidence !== "all") {
    badges.push({ key: "contextConfidence", label: "可信度", value: contextConfidenceFilterLabel(controls.contextConfidence) });
  }

  if (controls.contextWinRateThreshold !== "all") {
    badges.push({ key: "contextWinRateThreshold", label: "情境勝率", value: contextWinRateThresholdLabel(controls.contextWinRateThreshold) });
  }

  if (controls.similarSignalCountThreshold !== "all") {
    badges.push({ key: "similarSignalCountThreshold", label: "樣本數", value: similarSignalCountThresholdLabel(controls.similarSignalCountThreshold) });
  }

  return badges;
}

function labelInfo(label: string, info: InfoSpec, className = "text-xs uppercase tracking-[0.22em] text-faint") {
  return (
    <div className="flex items-center gap-2">
      <p className={className}>{label}</p>
      <InfoButton {...info} />
    </div>
  );
}

function metricInfo(key: string): InfoSpec {
  const entries: Record<string, InfoSpec> = {
    confidence: {
      title: "勝率代理值",
      description: "這不是保證勝率，而是把分數差距、主力分點延續性與行為一致性壓成 0 到 100 的信心分數。",
      formula: "55 + |吸籌分數 - 派發分數| × 0.65 + 分點延續率 × 12，最後限制在 52 到 95",
      risks: ["它不是歷史真實勝率，只是信心強度代理值", "若資料源失真或樣本太少，這個數值可能高估可靠度"],
    },
    conviction: {
      title: "綜合分數",
      description: "綜合分數代表多空其中一邊的主導強度，越高表示這個方向的籌碼優勢越清楚。",
      formula: "max(吸籌分數, 派發分數)",
      risks: ["分數高不等於一定會漲或跌", "若市場進入消息主導階段，分數對短期價格解釋力會下降"],
    },
    accumulation: {
      title: "籌碼吸籌",
      description: "吸籌分數用來衡量主力、法人與價格行為是否偏向收集籌碼。",
      formula: "分點淨買賣 + 法人淨買賣 + 價格動能 + 主力延續性 + 資券健康度加權平均",
      risks: ["主力可能先吸後倒，吸籌不必然等於後續拉抬", "樣本若缺少分點資料，吸籌分數會偏失真"],
    },
    distribution: {
      title: "籌碼派發",
      description: "派發分數衡量籌碼是否偏向出貨與鬆動，數值越高越偏空。",
      formula: "吸籌指標反向後再加權平均",
      risks: ["出貨可能只是短線調節，不一定直接走空", "若有回補或軋空事件，派發訊號可能被反向扭轉"],
    },
    close: {
      title: "收盤價",
      description: "TWSE 最新可用上市收盤價，作為進出場價格的基準。",
      formula: "最近交易日收盤價",
    },
    dayChange: {
      title: "單日變化",
      description: "收盤價相對前一日收盤價的變動百分比。",
      formula: "(今日收盤 - 昨日收盤) / 昨日收盤 × 100%",
    },
    fiveDayChange: {
      title: "5 日變化",
      description: "最近五個交易日的累積漲跌幅，用來觀察短波動能。",
      formula: "(今日收盤 - 5 日前收盤) / 5 日前收盤 × 100%",
    },
    twentyDayChange: {
      title: "20 日變化",
      description: "最近二十個交易日的累積漲跌幅，用來判斷中波段趨勢。",
      formula: "(今日收盤 - 20 日前收盤) / 20 日前收盤 × 100%",
    },
    entry: {
      title: "建議進場",
      description: "策略建議掛單位置，會依方向與估計波動度做緩衝。",
      formula: "做多: 收盤價 - ATR 緩衝；做空: 收盤價 + ATR 緩衝",
      risks: ["實際成交可能受到跳空與流動性影響", "進場價是策略參考，不是保證可成交價格"],
    },
    stopLoss: {
      title: "停損",
      description: "當行情與預期方向相反時，系統建議離場的風險控制價位。",
      formula: "建議進場價 ± ATR × 停損倍數",
      risks: ["波動劇烈時可能直接跳空穿越停損", "停損設太近會提高被洗出場機率"],
    },
    takeProfit: {
      title: "停利",
      description: "當行情朝有利方向發展時，系統計算的階段目標價。",
      formula: "建議進場價 ± ATR × (目標倍數 + 信心加成)",
      risks: ["到價後仍可能續漲續跌，停利是策略折衷不是最高點預測", "若行情轉弱，未到停利前也可能需要主動調整"],
    },
    riskReward: {
      title: "風報比",
      description: "衡量每承擔 1 單位風險，理論上可換得多少單位報酬。",
      formula: "|停利 - 進場| / |進場 - 停損|",
      risks: ["風報比好不等於勝率高", "若停損難以執行，實際風報比可能比理論值差很多"],
    },
    dataStatus: {
      title: "資料狀態",
      description: "顯示目前頁面是否成功抓到最新可用 TWSE 公開資料。",
      formula: "核心 API 成功則顯示即時 API；若沿用上一輪真實資料則顯示部分更新；首次核心抓取失敗才顯示更新失敗",
    },
    generatedAt: {
      title: "產生時間",
      description: "這一批分析結果的產生時間，方便確認資料新鮮度。",
      formula: "後端 API 產生回應時寫入 UTC 時間",
    },
    candidateCount: {
      title: "做多 / 做空候選",
      description: "符合當前分數門檻的做多與做空標的數量。",
      formula: "做多候選數 / 做空候選數",
    },
    universeRule: {
      title: "股票池規則",
      description: "限定系統只分析上市股票池內的代號，排除上櫃與未納入白名單標的。",
      formula: "四位數上市代號規則 + ListedUniverse.Symbols 白名單",
    },
    overallWinRate: {
      title: "整體勝率",
      description: "回測樣本中，獲利筆數占總訊號筆數的比例。",
      formula: "獲利筆數 / 總訊號筆數 × 100%",
      risks: ["勝率未扣除滑價與交易成本時可能偏樂觀", "高勝率策略也可能因單筆虧損過大而不賺錢"],
    },
    averageReturn: {
      title: "平均報酬",
      description: "每筆訊號在回測中的平均報酬率。",
      formula: "所有訊號報酬率總和 / 訊號總筆數",
      risks: ["平均值可能被少數大賺單扭曲", "若樣本期太短，平均報酬代表性有限"],
    },
    maxDrawdown: {
      title: "最大回撤",
      description: "回測期間資金曲線從高點回落的最大幅度。",
      formula: "最低谷淨值相對前一個高點的最大跌幅",
      risks: ["歷史最大回撤不保證未來不會更大", "若未計入真實滑價與成本，回撤通常會被低估"],
    },
    profitFactor: {
      title: "獲利因子 / Profit Factor",
      description: "回測中獲利總額和虧損總額的比值，用來看策略盈虧效率。",
      formula: "總獲利 / |總虧損|",
      risks: ["若交易筆數不足，Profit Factor 很容易失真", "不同市場階段下這個值可能快速惡化"],
    },
    totalSignals: {
      title: "訊號筆數",
      description: "在該回測區間內觸發策略條件的總訊號數。",
      formula: "所有符合規則的進場訊號次數",
    },
    contextWinRate: {
      title: "情境勝率",
      description: "不是整體回測勝率，而是和這檔股票目前市場情境、主力指紋相近的樣本勝率。",
      formula: "相似情境中的獲利訊號數 / 相似情境總訊號數 × 100%",
      risks: ["若樣本定義過寬，勝率會被稀釋", "若樣本數太少，情境勝率很容易失真"],
    },
    contextSample: {
      title: "相似樣本數",
      description: "歷史上同時符合相近市場情境、主力指紋與策略權重的樣本數量。",
      formula: "符合情境條件的歷史訊號筆數",
      risks: ["樣本數多不代表一定穩定，仍要看市場是否已變質", "樣本數太少時，不適合過度相信單一結果"],
    },
    contextAverageReturn: {
      title: "情境平均報酬",
      description: "只統計相似情境樣本時，每筆訊號的平均報酬率。",
      formula: "相似情境所有訊號報酬率總和 / 相似情境訊號數",
      risks: ["平均值可能被少數大波段交易拉高", "若未納入成本與滑價，報酬會偏樂觀"],
    },
    contextProfitFactor: {
      title: "情境 Profit Factor",
      description: "只針對相似情境樣本計算的獲利因子，用來看這個情境是否真的有盈虧優勢。",
      formula: "相似情境總獲利 / |相似情境總虧損|",
      risks: ["低交易筆數下容易被極端值扭曲", "單看 Profit Factor 會忽略回撤大小"],
    },
    marketRegime: {
      title: "市場情境",
      description: "系統把當前價格位置、趨勢方向與多空結構整理成一個可回測的市場場景標籤。",
      formula: "20 日趨勢 + 高低點距離 + 當前方向判定",
      risks: ["情境切得太粗，容易混入不同型態", "情境切得太細，又會讓樣本不足"],
    },
    brokerFingerprint: {
      title: "主力指紋",
      description: "把主力分點的連買連賣、追價積極度與主導券商組合濃縮成可比對的行為指紋。",
      formula: "主導分點 + 五日淨買賣方向 + FollowThroughRate + AggressionScore",
      risks: ["同一券商可能混入不同客戶，不等於絕對單一主力", "分點行為可能因事件而暫時失真"],
    },
    fingerprintEdge: {
      title: "指紋優勢分數",
      description: "第一版分點指紋總分，把延續性、追價積極度、券商集中度與法人同步度合併成 0 到 100 分。",
      formula: "延續性 30% + 追價積極度 25% + 券商集中度 20% + 法人同步度 25%",
      risks: ["目前仍是啟發式分數，不是歷史最佳化權重", "若資料粒度不足，集中度與同步度會被簡化"],
    },
    fingerprintContinuity: {
      title: "延續性分數",
      description: "觀察同一批主導分點是否持續在同方向加碼，而不是只出現單日異常買賣超。",
      formula: "FollowThroughRate × 100",
      risks: ["連續買超不一定代表後續還會續漲", "事件行情容易讓延續性短暫失真"],
    },
    fingerprintAggression: {
      title: "追價積極度",
      description: "衡量主導分點在價格推進時是否仍願意追價，分數越高代表動作越主動。",
      formula: "AggressionScore × 100",
      risks: ["高追價有時也代表末升段追高", "低追價不一定偏空，可能只是靜態吸籌"],
    },
    fingerprintConcentration: {
      title: "券商集中度",
      description: "看主要籌碼是否集中在少數主導分點，避免訊號只是很多小單位雜訊堆出來。",
      formula: "主導分點五日絕對張數 / 全部分點五日絕對張數 × 70 + 30",
      risks: ["集中不等於一定有主力，可能只是大型客戶短線進出", "若只看前三分點，仍會遺漏部分資金分散路徑"],
    },
    fingerprintAlignment: {
      title: "法人同步度",
      description: "觀察分點方向與外資、投信、自營商是否同向，分數越高代表籌碼更共振。",
      formula: "方向一致基礎分 + 法人/分點力道平衡調整",
      risks: ["法人與分點同向時，仍可能只是短期事件反應", "不同法人角色的行為目的不完全相同"],
    },
    contextConfidence: {
      title: "情境可信度",
      description: "用相似樣本數與情境勝率粗分成高、中高、中、偏低，方便快速判讀這個情境統計值能不能信。",
      formula: "樣本數門檻 + 情境勝率門檻",
      risks: ["這是分級標籤，不是統計檢定結果", "資料源若還是樣本，可信度標籤也只具有展示意義"],
    },
  };

  return entries[key];
}

function strategyProfileInfo(profile: string): InfoSpec {
  const profiles: Record<string, InfoSpec> = {
    "Institutional Momentum": {
      title: profile,
      description: "偏重外資與大型券商連續買超，適合半導體這種法人主導度高的族群。",
      bullets: ["法人權重較高", "進場緩衝較小", "目標價偏趨勢延伸"],
      risks: ["若法人轉向，訊號衰退會很快", "產業消息面反轉時，趨勢模型容易失靈"],
    },
    "Breakout Continuation": {
      title: profile,
      description: "偏重價格動能與主力追價延續性，適合突破型個股。",
      bullets: ["價格權重較高", "適合動能延續", "停利倍數較積極"],
      risks: ["假突破時會快速反轉", "高波動環境下容易出現連續停損"],
    },
    "Mean Reversion Short Bias": {
      title: profile,
      description: "偏重派發與融資惡化訊號，適合航運等波動較大的反向策略。",
      bullets: ["空方權重較高", "進場緩衝較大", "回歸均值思維"],
      risks: ["遇到軋空或政策利多時回撤可能急遽擴大", "高波動族群不適合過大槓桿"],
    },
    "Trend Following": {
      title: profile,
      description: "偏重趨勢與籌碼延續並行，適合伺服器等中波段題材。",
      risks: ["盤整市容易反覆被洗", "題材退潮時趨勢切換可能很快"],
    },
  };

  return profiles[profile] ?? {
    title: profile,
    description: "這是目前套用的產業化評分設定，用來調整權重與交易計畫倍數。",
  };
}

function termInfo(term: string): InfoSpec {
  const terms: Record<string, InfoSpec> = {
    TWSE_ONLY: {
      title: term,
      description: "只分析證交所上市股票，不含上櫃、興櫃與其他市場。",
      formula: "股票需符合四位數上市代號，且出現在白名單中",
      risks: ["若關鍵強勢股在其他市場，這個範圍會直接忽略", "白名單若未更新，可能漏掉應分析標的"],
    },
    "即時 API": {
      title: term,
      description: "前端已成功連到目前的同站 API，畫面數值來自最新可用 TWSE 公開資料。",
      risks: ["交易所若當日尚未更新，系統會使用最近可用交易日", "公開資料目前不含券商分點明細"],
    },
  };

  return terms[term] ?? {
    title: term,
    description: "這個名詞是目前畫面上的策略或系統專有名詞，可配合旁邊數值一起解讀。",
  };
}

function brokerInfo(broker: string): InfoSpec {
  return {
    title: broker,
    description: "這是目前用來代表公開籌碼方向的主要資金角色，現階段以外資、投信、自營商等公開籌碼代理為主。",
    bullets: ["目前顯示的是影響力較大的前三個公開籌碼角色", "後續若接上分點商用資料，可再延伸到真實分點集中度"],
    risks: ["單一分點不一定等於單一主力", "同一券商可能混有不同客戶行為"],
  };
}

function sourceInfo(name: string): InfoSpec {
  return {
    title: name,
    description: "這是目前系統使用中的資料來源名稱。",
    bullets: ["價格與成交供趨勢與波動使用", "分點與法人供籌碼判讀使用", "資券供風險與反向訊號使用"],
    risks: ["資料更新頻率不同會造成時差", "欄位定義若未標準化，跨來源整合容易出錯"],
  };
}

function methodologyInfo(item: string): InfoSpec {
  const entries: Record<string, InfoSpec> = {
    "以券商分點五日淨買賣、連續性與追價積極度衡量主力習慣。": {
      title: "分點行為因子",
      description: "系統先看主要券商分點近五日的淨買賣、是否連續同向，以及買賣時有沒有追價特徵，用來抓主力習慣。",
      formula: "分點五日淨買賣 + FollowThroughRate + AggressionScore",
      bullets: ["連續買超但不追價，偏向慢慢吸籌", "連續賣超且追低，偏向積極派發"],
      risks: ["分點資料可能混有不同客戶行為", "短線隔日沖分點可能扭曲主力判讀"],
    },
    "納入外資、投信、自營商與資券變化，建立吸籌與派發雙向分數。": {
      title: "法人與資券雙向分數",
      description: "除了分點，還會把外資、投信、自營商買賣超，以及融資融券變化一起合併，得到偏多與偏空兩套分數。",
      formula: "吸籌分數 / 派發分數 = 分點 + 法人 + 價格 + 資券加權平均",
      bullets: ["法人同向時，分數說服力會更高", "融資增加配合派發分數升高時，通常偏空"],
      risks: ["法人資料有時反映 ETF 或被動資金，不一定是主觀判斷", "資券變化要搭配價格位置，不適合單看"],
    },
    "依產業套用不同權重設定，避免半導體與航運共用同一套籌碼邏輯。": {
      title: "產業化權重",
      description: "不同產業的籌碼特性不同，所以系統不讓半導體、IC 設計、航運、伺服器用同一套權重。",
      formula: "依 sector 套用對應 StrategyProfile 權重與 ATR 倍數",
      bullets: ["半導體偏法人動能", "航運偏空方均值回歸", "IC 設計偏突破延續"],
      risks: ["產業分類過粗時，個股特性可能被平均掉", "若產業輪動很快，固定權重需要重新校準"],
    },
    "依價格位置與估計波動度計算建議進場、停損、停利，保持固定風報比。": {
      title: "交易計畫引擎",
      description: "在方向分數成立後，系統再用價格位置與估計 ATR 波動度，算出進場、停損與停利，讓每筆交易先有明確風控。",
      formula: "Entry / Stop / Target = 收盤價 ± ATR × 各策略倍數",
      bullets: ["做多與做空使用相反方向的 ATR 緩衝", "高信心分數會稍微放大停利目標"],
      risks: ["真實市場有跳空與滑價，理論價格不一定能完整執行", "固定風報比在極端行情下可能需要動態調整"],
    },
  };

  return entries[item] ?? {
    title: "方法論說明",
    description: item,
  };
}

function ExplainableBadge({ text, info, toneClass = "bg-chip text-muted" }: { text: string; info: InfoSpec; toneClass?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${toneClass}`}>
      <span>{text}</span>
      <InfoButton {...info} />
    </span>
  );
}

function ExplainableMetric({
  label,
  value,
  info,
  valueClassName = "mt-2 text-2xl font-semibold",
}: {
  label: string;
  value: string;
  info: InfoSpec;
  valueClassName?: string;
}) {
  return (
    <div>
      {labelInfo(label, info)}
      <p className={valueClassName}>{value}</p>
    </div>
  );
}

function ListControls({
  title,
  controls,
  sectors,
  resultCount,
  onChange,
  onApplyRecommended,
  recommendedLabel,
}: {
  title: string;
  controls: ListControlState;
  sectors: string[];
  resultCount: number;
  onChange: (next: ListControlState) => void;
  onApplyRecommended: () => void;
  recommendedLabel: string;
}) {
  const highWinRateModeActive = isHighWinRatePresetActive(controls);
  const ultraConservativeModeActive = isUltraConservativePresetActive(controls);
  const highEfficiencyModeActive = isHighEfficiencyPresetActive(controls);

  return (
    <div className="rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-[0_18px_40px_rgba(17,17,17,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title} 篩選</p>
          <p className="mt-1 text-sm text-soft">目前顯示 {resultCount} 檔，排序依 {sortLabel(controls.sortBy)}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange({ query: "", sector: "all", sortBy: "conviction", contextConfidence: "all", contextWinRateThreshold: "all", similarSignalCountThreshold: "all" })}
          className="rounded-full border border-[color:var(--border)] px-3 py-2 text-sm text-soft transition hover:text-[color:var(--foreground)]"
        >
          重設
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-4">
        <button
          type="button"
          onClick={onApplyRecommended}
          className="rounded-full bg-[color:var(--foreground)] px-4 py-2 text-sm font-medium text-[color:var(--background)] transition hover:opacity-90"
        >
          自動推薦模式
        </button>
        <button
          type="button"
          onClick={() => onChange(applyHighWinRatePreset(controls))}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${highWinRateModeActive ? "bg-[color:var(--accent-cool)] text-white" : "bg-[rgba(0,95,115,0.10)] text-[color:var(--accent-cool)] hover:bg-[rgba(0,95,115,0.18)]"}`}
        >
          高勝率模式
        </button>
        <button
          type="button"
          onClick={() => onChange(applyUltraConservativePreset(controls))}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${ultraConservativeModeActive ? "bg-[color:var(--accent)] text-white" : "bg-[rgba(186,74,0,0.10)] text-[color:var(--accent)] hover:bg-[rgba(186,74,0,0.18)]"}`}
        >
          極保守模式
        </button>
        <button
          type="button"
          onClick={() => onChange(applyHighEfficiencyPreset(controls))}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${highEfficiencyModeActive ? "bg-[color:var(--success)] text-white" : "bg-[rgba(31,122,70,0.12)] text-[color:var(--success)] hover:bg-[rgba(31,122,70,0.20)]"}`}
        >
          高效率模式
        </button>
        <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-muted">
          目前模式: {activePresetLabel(controls)}
        </span>
        <p className="text-sm leading-7 text-soft">
          自動推薦會優先選擇目前條件下仍有結果的最嚴格 preset；若三種 preset 都沒有結果，則退回 {recommendedLabel}。
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label className="grid gap-2 text-sm">
          <span className="text-faint">搜尋代號 / 名稱 / 策略</span>
          <input
            value={controls.query}
            onChange={(event) => onChange({ ...controls, query: event.target.value })}
            placeholder="例如 2330、台積電、Momentum"
            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-3 outline-none transition focus:border-[color:var(--accent-cool)]"
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="text-faint">產業篩選</span>
          <select
            value={controls.sector}
            onChange={(event) => onChange({ ...controls, sector: event.target.value })}
            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-3 outline-none transition focus:border-[color:var(--accent-cool)]"
          >
            <option value="all">全部產業</option>
            {sectors.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="text-faint">情境可信度</span>
          <select
            value={controls.contextConfidence}
            onChange={(event) => onChange({ ...controls, contextConfidence: parseContextConfidenceFilter(event.target.value) })}
            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-3 outline-none transition focus:border-[color:var(--accent-cool)]"
          >
            <option value="all">全部可信度</option>
            <option value="high">高</option>
            <option value="midHigh">中高</option>
            <option value="mid">中</option>
            <option value="low">偏低</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="text-faint">最低情境勝率</span>
          <select
            value={controls.contextWinRateThreshold}
            onChange={(event) => onChange({ ...controls, contextWinRateThreshold: parseContextWinRateThreshold(event.target.value) })}
            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-3 outline-none transition focus:border-[color:var(--accent-cool)]"
          >
            <option value="all">不限</option>
            <option value="60">60% 以上</option>
            <option value="65">65% 以上</option>
            <option value="70">70% 以上</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="text-faint">最低相似樣本數</span>
          <select
            value={controls.similarSignalCountThreshold}
            onChange={(event) => onChange({ ...controls, similarSignalCountThreshold: parseSimilarSignalCountThreshold(event.target.value) })}
            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-3 outline-none transition focus:border-[color:var(--accent-cool)]"
          >
            <option value="all">不限</option>
            <option value="30">30 筆以上</option>
            <option value="50">50 筆以上</option>
            <option value="70">70 筆以上</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="text-faint">排序依據</span>
          <select
            value={controls.sortBy}
            onChange={(event) => onChange({ ...controls, sortBy: event.target.value as SortOption })}
            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-strong)] px-4 py-3 outline-none transition focus:border-[color:var(--accent-cool)]"
          >
            <option value="conviction">綜合分數</option>
            <option value="confidence">勝率代理值</option>
            <option value="contextWinRate">情境勝率</option>
            <option value="contextProfitFactor">情境 Profit Factor</option>
            <option value="riskReward">風報比</option>
            <option value="dayChange">單日變化幅度</option>
          </select>
        </label>
      </div>

      {appliedControlBadges(controls).length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-soft">目前已套用條件</span>
          {appliedControlBadges(controls).map((badge) => (
            <button
              key={`${badge.key}-${badge.value}`}
              type="button"
              onClick={() => {
                if (badge.key === "query") {
                  onChange({ ...controls, query: "" });
                  return;
                }

                if (badge.key === "sector") {
                  onChange({ ...controls, sector: "all" });
                  return;
                }

                if (badge.key === "contextConfidence") {
                  onChange({ ...controls, contextConfidence: "all" });
                  return;
                }

                if (badge.key === "contextWinRateThreshold") {
                  onChange({ ...controls, contextWinRateThreshold: "all" });
                  return;
                }

                if (badge.key === "similarSignalCountThreshold") {
                  onChange({ ...controls, similarSignalCountThreshold: "all" });
                  return;
                }

                onChange({ ...controls, sortBy: "conviction" });
              }}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-chip px-3 py-2 text-sm text-muted transition hover:text-[color:var(--foreground)]"
            >
              <span>{badge.label}: {badge.value}</span>
              <span className="text-faint">×</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SignalCard({ signal }: { signal: StockSignal }) {
  const contextEdge = signal.contextEdge;
  const fingerprintProfile = contextEdge?.fingerprintProfile;

  return (
    <article className="rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[0_20px_60px_rgba(17,17,17,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <ExplainableBadge text={signal.symbol} info={{ title: signal.symbol, description: "這是上市股票代號，用來唯一識別標的。" }} toneClass="bg-chip text-muted" />
            <ExplainableBadge text={signal.sector} info={{ title: signal.sector, description: "這是系統套用產業權重時使用的產業分類。" }} toneClass="bg-chip text-muted" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <h3 className="text-2xl font-semibold">{signal.name}</h3>
            <InfoButton title={signal.name} description="這是目前被納入分析股票池的上市公司名稱，對應左側的股票代號。" />
          </div>
          <div className="mt-2 inline-flex items-center gap-2 text-sm text-soft">
            <span>策略設定: {signal.strategyProfile}</span>
            <InfoButton {...strategyProfileInfo(signal.strategyProfile)} />
          </div>
        </div>
        <div className={`rounded-full px-4 py-2 text-sm font-semibold ${signalTone(signal.direction)}`}>
          <div className="inline-flex items-center gap-2">
            <span>{signal.direction === "Long" ? "做多候選" : signal.direction === "Short" ? "做空候選" : "觀察"}</span>
            <InfoButton
              title={signal.direction}
              description="這是系統依分數差距判定的主要方向。Long 代表偏多，Short 代表偏空，Neutral 代表觀察。"
              formula="吸籌與派發分數差距需超過門檻，且主導分數需高於 60"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <ExplainableMetric label="勝率代理值" value={signal.confidence.toFixed(0)} info={metricInfo("confidence")} valueClassName="mt-2 text-3xl font-semibold" />
        <ExplainableMetric label="綜合分數" value={signal.convictionScore.toFixed(0)} info={metricInfo("conviction")} valueClassName="mt-2 text-3xl font-semibold" />
        <ExplainableMetric label="籌碼吸籌" value={signal.accumulationScore.toFixed(0)} info={metricInfo("accumulation")} valueClassName="mt-2 text-3xl font-semibold" />
        <ExplainableMetric label="籌碼派發" value={signal.distributionScore.toFixed(0)} info={metricInfo("distribution")} valueClassName="mt-2 text-3xl font-semibold" />
      </div>

      <div className="mt-6 grid gap-4 rounded-[24px] bg-[color:var(--surface-strong)] p-5 sm:grid-cols-4">
        <ExplainableMetric label="收盤價" value={signal.lastClose.toFixed(2)} info={metricInfo("close")} valueClassName="mt-2 text-xl font-semibold" />
        <ExplainableMetric label="單日變化" value={formatPercent(signal.dayChangePercent)} info={metricInfo("dayChange")} valueClassName={`mt-2 text-xl font-semibold ${priceTone(signal.dayChangePercent)}`} />
        <ExplainableMetric label="5 日變化" value={formatPercent(signal.fiveDayChangePercent)} info={metricInfo("fiveDayChange")} valueClassName={`mt-2 text-xl font-semibold ${priceTone(signal.fiveDayChangePercent)}`} />
        <ExplainableMetric label="20 日變化" value={formatPercent(signal.twentyDayChangePercent)} info={metricInfo("twentyDayChange")} valueClassName={`mt-2 text-xl font-semibold ${priceTone(signal.twentyDayChangePercent)}`} />
      </div>

      {signal.tradePlan ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-[color:var(--border)] p-4"><ExplainableMetric label="建議進場" value={signal.tradePlan.entryPrice.toFixed(2)} info={metricInfo("entry")} /></div>
          <div className="rounded-2xl border border-[color:var(--border)] p-4"><ExplainableMetric label="停損" value={signal.tradePlan.stopLossPrice.toFixed(2)} info={metricInfo("stopLoss")} /></div>
          <div className="rounded-2xl border border-[color:var(--border)] p-4"><ExplainableMetric label="停利" value={signal.tradePlan.takeProfitPrice.toFixed(2)} info={metricInfo("takeProfit")} /></div>
          <div className="rounded-2xl border border-[color:var(--border)] p-4"><ExplainableMetric label="風報比" value={signal.tradePlan.riskRewardRatio.toFixed(2)} info={metricInfo("riskReward")} /></div>
        </div>
      ) : null}

      {contextEdge ? (
        <div className="mt-6 rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface-strong)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-[0.22em] text-faint">Context Edge</p>
                <InfoButton
                  title="情境優勢層"
                  description="這一層把當前股票的市場情境與主力行為指紋，對照到相似歷史樣本，顯示這個場景過去是否真的比較有優勢。"
                  bullets={["和整體回測不同，這裡只看相近情境", "目的不是神準預言，而是過濾掉統計上沒有優勢的訊號"]}
                  risks={["若資料源還沒真實化，這層目前主要是產品骨架", "未來接正式歷史資料後，數字才有實戰比較價值"]}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <ExplainableBadge text={contextEdge.marketRegime} info={metricInfo("marketRegime")} toneClass="bg-[rgba(0,95,115,0.12)] text-[color:var(--accent-cool)]" />
                <ExplainableBadge text={contextEdge.brokerFingerprint} info={metricInfo("brokerFingerprint")} toneClass="bg-[rgba(186,74,0,0.12)] text-[color:var(--accent)]" />
                <ExplainableBadge text={`指紋分數 ${fingerprintProfile?.edgeScore.toFixed(0) ?? "-"}`} info={metricInfo("fingerprintEdge")} toneClass="bg-[rgba(31,122,70,0.12)] text-[color:var(--success)]" />
                <ExplainableBadge text={`可信度 ${contextEdge.confidenceLabel}`} info={metricInfo("contextConfidence")} toneClass="bg-chip text-muted" />
              </div>
            </div>
            <div className="text-sm leading-7 text-soft">
              這塊是第一版「主力分點行為指紋 + 市場情境濾網」，用來區分哪些訊號只是分數高，哪些訊號在相似場景下真的更常贏。
            </div>
          </div>

          {fingerprintProfile ? (
            <div className="mt-5 rounded-[22px] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-faint">Broker Fingerprint</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold">{fingerprintProfile.dominantBroker}</span>
                    <span className="rounded-full bg-chip px-3 py-1 text-sm text-muted">{fingerprintProfile.patternLabel}</span>
                  </div>
                </div>
                <p className="max-w-2xl text-sm leading-7 text-soft">{fingerprintProfile.summary}</p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl bg-[color:var(--surface-strong)] p-4"><ExplainableMetric label="指紋優勢分數" value={fingerprintProfile.edgeScore.toFixed(1)} info={metricInfo("fingerprintEdge")} valueClassName="mt-2 text-2xl font-semibold text-[color:var(--success)]" /></div>
                <div className="rounded-2xl bg-[color:var(--surface-strong)] p-4"><ExplainableMetric label="延續性" value={formatPercent(fingerprintProfile.continuityScore)} info={metricInfo("fingerprintContinuity")} /></div>
                <div className="rounded-2xl bg-[color:var(--surface-strong)] p-4"><ExplainableMetric label="追價積極度" value={formatPercent(fingerprintProfile.aggressionScore)} info={metricInfo("fingerprintAggression")} /></div>
                <div className="rounded-2xl bg-[color:var(--surface-strong)] p-4"><ExplainableMetric label="券商集中度" value={fingerprintProfile.concentrationScore.toFixed(1)} info={metricInfo("fingerprintConcentration")} /></div>
                <div className="rounded-2xl bg-[color:var(--surface-strong)] p-4"><ExplainableMetric label="法人同步度" value={fingerprintProfile.institutionalAlignmentScore.toFixed(1)} info={metricInfo("fingerprintAlignment")} /></div>
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-[color:var(--surface)] p-4"><ExplainableMetric label="情境勝率" value={formatWinRate(contextEdge.historicalWinRate)} info={metricInfo("contextWinRate")} /></div>
            <div className="rounded-2xl bg-[color:var(--surface)] p-4"><ExplainableMetric label="相似樣本數" value={contextEdge.similarSignalCount.toString()} info={metricInfo("contextSample")} /></div>
            <div className="rounded-2xl bg-[color:var(--surface)] p-4"><ExplainableMetric label="情境平均報酬" value={formatPercent(contextEdge.historicalAverageReturnPercent)} info={metricInfo("contextAverageReturn")} valueClassName="mt-2 text-2xl font-semibold text-[color:var(--success)]" /></div>
            <div className="rounded-2xl bg-[color:var(--surface)] p-4"><ExplainableMetric label="情境 Profit Factor" value={formatRatio(contextEdge.historicalProfitFactor)} info={metricInfo("contextProfitFactor")} /></div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {contextEdge.matchingTraits.map((trait) => (
              <span key={trait} className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-muted">
                {trait}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {signal.primaryBrokers.map((broker) => (
          <ExplainableBadge key={broker} text={broker} info={brokerInfo(broker)} toneClass="border border-[color:var(--border)] bg-transparent text-muted" />
        ))}
      </div>

      <ul className="mt-6 grid gap-3 text-sm leading-6 text-muted">
        {signal.rationale.map((reason) => (
          <li key={reason} className="rounded-2xl bg-chip px-4 py-3">
            {reason}
          </li>
        ))}
      </ul>
    </article>
  );
}

function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [analysis, setAnalysis] = useState<AnalysisResponse>(emptyAnalysis);
  const [sources, setSources] = useState<DataSourceStatus[]>([]);
  const [backtest, setBacktest] = useState<BacktestSummary>(emptyBacktest);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const hasAnalysisDataRef = useRef(false);
  const hasSourceDataRef = useRef(false);
  const isLoadingDashboardRef = useRef(false);

  useEffect(() => {
    hasAnalysisDataRef.current = analysis.allSignals.length > 0;
  }, [analysis]);

  useEffect(() => {
    hasSourceDataRef.current = sources.length > 0;
  }, [sources]);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      if (isLoadingDashboardRef.current) {
        return;
      }

      isLoadingDashboardRef.current = true;

      try {
        const [analysisResult, sourceResult, backtestResult] = await Promise.allSettled([
          fetchWithTimeout(`${apiBaseUrl}/api/chip-analysis/opportunities`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
          }),
          fetchWithTimeout(`${apiBaseUrl}/api/chip-analysis/data-sources`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
          }),
          fetchWithTimeout(`${apiBaseUrl}/api/chip-analysis/backtest-summary`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
          }),
        ]);

        if (!active) {
          return;
        }

        const criticalFailures: string[] = [];
        const auxiliaryFailures: string[] = [];
        const runtimeNotices: string[] = [];

        if (analysisResult.status === "fulfilled" && analysisResult.value.ok) {
          const nextAnalysis = (await analysisResult.value.json()) as AnalysisResponse;
          setAnalysis(nextAnalysis);
          hasAnalysisDataRef.current = nextAnalysis.allSignals.length > 0;

          if (hasLiveFallbackNotice(nextAnalysis.methodology)) {
            runtimeNotices.push("候選清單暫時改用最近一次成功抓取的真實資料");
          }
        } else {
          if (hasAnalysisDataRef.current) {
            runtimeNotices.push("候選清單暫時沿用上一輪成功抓取的真實資料");
          } else {
            criticalFailures.push("候選清單");
          }
        }

        if (sourceResult.status === "fulfilled" && sourceResult.value.ok) {
          const nextSources = (await sourceResult.value.json()) as DataSourceStatus[];
          setSources(nextSources);
          hasSourceDataRef.current = nextSources.length > 0;

          if (hasLiveFallbackNotice(nextSources.map((source) => source.notes))) {
            runtimeNotices.push("資料來源狀態暫時沿用最近一次成功抓取的真實結果");
          }
        } else {
          if (hasSourceDataRef.current) {
            runtimeNotices.push("資料來源狀態暫時沿用上一輪成功抓取的真實結果");
          } else {
            criticalFailures.push("資料來源");
          }
        }

        if (backtestResult.status === "fulfilled" && backtestResult.value.ok) {
          setBacktest((await backtestResult.value.json()) as BacktestSummary);
        } else {
          auxiliaryFailures.push("回測摘要");
        }

        setLoadError(criticalFailures.length > 0 ? `目前無法更新：${criticalFailures.join("、")}` : null);

        const notices = [
          auxiliaryFailures.length > 0 ? `部分資料暫未更新：${auxiliaryFailures.join("、")}` : null,
          ...runtimeNotices,
        ].filter((notice): notice is string => Boolean(notice));

        setLoadNotice(notices.length > 0 ? notices.join("；") : null);
      } catch {
        if (!active) {
          return;
        }

        setLoadError("目前無法更新：資料請求逾時或回應格式異常");
        setLoadNotice(null);
      } finally {
        isLoadingDashboardRef.current = false;

        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();
    const refreshTimer = window.setInterval(() => {
      void loadDashboard();
    }, 60_000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const longControls = useMemo(() => parseControls(searchParams, "long"), [searchParams]);
  const shortControls = useMemo(() => parseControls(searchParams, "short"), [searchParams]);

  function updateControls(prefix: "long" | "short", next: ListControlState) {
    const nextLongControls = prefix === "long" ? next : longControls;
    const nextShortControls = prefix === "short" ? next : shortControls;
    const nextParams = buildControlsSearchParams(searchParams, nextLongControls, nextShortControls);
    const nextQueryString = nextParams.toString();

    startTransition(() => {
      router.replace(nextQueryString ? `${pathname}?${nextQueryString}` : pathname, { scroll: false });
    });
  }

  function updateAllControls(nextLongControls: ListControlState, nextShortControls: ListControlState) {
    const nextParams = buildControlsSearchParams(searchParams, nextLongControls, nextShortControls);
    const nextQueryString = nextParams.toString();

    startTransition(() => {
      router.replace(nextQueryString ? `${pathname}?${nextQueryString}` : pathname, { scroll: false });
    });
  }

  const longSectors = availableSectors(analysis.longCandidates);
  const shortSectors = availableSectors(analysis.shortCandidates);
  const filteredLongCandidates = filterSignals(analysis.longCandidates, longControls);
  const filteredShortCandidates = filterSignals(analysis.shortCandidates, shortControls);
  const longMode = activePresetLabel(longControls);
  const shortMode = activePresetLabel(shortControls);
  const recommendedLongMode = recommendedPresetLabel(longControls, analysis.longCandidates);
  const recommendedShortMode = recommendedPresetLabel(shortControls, analysis.shortCandidates);
  const recommendedLongInfo = recommendedPresetInfo("long", longControls, analysis.longCandidates);
  const recommendedShortInfo = recommendedPresetInfo("short", shortControls, analysis.shortCandidates);
  const longPresetCounts = presetResultCounts(longControls, analysis.longCandidates);
  const shortPresetCounts = presetResultCounts(shortControls, analysis.shortCandidates);
  const alignmentStatus = recommendationAlignment(longMode, shortMode, recommendedLongMode, recommendedShortMode);
  const isInitialLoading = loading && analysis.allSignals.length === 0 && sources.length === 0;

  if (isInitialLoading) {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-7xl flex-1 flex-col justify-center px-5 py-8 sm:px-8 lg:px-10">
        <section className="overflow-hidden rounded-[36px] border border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-10 shadow-[0_30px_80px_rgba(17,17,17,0.08)] backdrop-blur sm:px-8 lg:px-10">
          <div className="flex justify-end">
            <ThemeToggle />
          </div>
          <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-faint">Stock MP</p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">正在載入籌碼儀表板</h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-muted sm:text-lg">
                先同步候選清單、資料來源狀態與回測摘要，完成後才會顯示完整頁面，避免只看到局部卡片停在載入中。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ExplainableBadge text={`API Base: ${apiBaseLabel}`} info={{ title: "API Base", description: "前端讀取分析結果的 API 位址。若未設定環境變數，預設使用同站的 Next.js API route。", bullets: ["頁面會用這個位址抓 opportunities、data-sources、backtest-summary", "部署到 Vercel 時，same-origin 代表前後端都由同一個 Next.js 專案提供"] }} />
                <span className="rounded-full bg-[rgba(186,74,0,0.12)] px-4 py-2 text-sm font-medium text-[color:var(--accent)]">
                  首次載入中
                </span>
              </div>
            </div>

            <div className="rounded-[30px] bg-[color:var(--surface-strong)] p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-[color:var(--border)] border-t-[color:var(--accent-cool)]" aria-hidden="true" />
                <div>
                  <p className="text-sm uppercase tracking-[0.28em] text-faint">Loading</p>
                  <p className="mt-2 text-2xl font-semibold">正在抓取最新資料</p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 text-sm leading-7 text-muted">
                <div className="rounded-2xl bg-chip px-4 py-3">候選清單與分數會在首批資料完成後一起顯示。</div>
                <div className="rounded-2xl bg-chip px-4 py-3">資料來源狀態不再只停留在卡片內顯示「載入中」。</div>
                <div className="rounded-2xl bg-chip px-4 py-3">若 API 失敗，頁面會在載入結束後直接顯示錯誤訊息。</div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 py-8 sm:px-8 lg:px-10">
      <div className="mb-4 flex justify-end">
        <ThemeToggle />
      </div>

      <section className="overflow-hidden rounded-[36px] border border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-8 shadow-[0_30px_80px_rgba(17,17,17,0.08)] backdrop-blur sm:px-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-faint">Stock MP</p>
            
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
              台股籌碼強弱儀表板
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-muted sm:text-lg">
              針對券商分點、外資、投信、自營商與資券變化做雙向評分，產出做多與做空候選清單，並給出策略型進出場價格。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ExplainableBadge text={`Scope: ${analysis.marketScope}`} info={termInfo(analysis.marketScope)} />
              <span className="rounded-full bg-[rgba(186,74,0,0.12)] px-4 py-2 text-sm font-medium text-[color:var(--accent)]">
                以籌碼延續性為核心
              </span>
              <span className="rounded-full bg-[rgba(0,95,115,0.12)] px-4 py-2 text-sm font-medium text-[color:var(--accent-cool)]">
                同時支援做多與做空
              </span>
              <ExplainableBadge text={`做多模式: ${longMode}`} info={presetInfo("long", longMode)} toneClass={presetToneClass(longMode)} />
              <ExplainableBadge text={`做空模式: ${shortMode}`} info={presetInfo("short", shortMode)} toneClass={presetToneClass(shortMode)} />
              <ExplainableBadge text={`做多推薦: ${recommendedLongMode}`} info={recommendedLongInfo} toneClass={presetToneClass(recommendedLongMode)} />
              <ExplainableBadge text={`做空推薦: ${recommendedShortMode}`} info={recommendedShortInfo} toneClass={presetToneClass(recommendedShortMode)} />
              <ExplainableBadge text={`API Base: ${apiBaseLabel}`} info={{ title: "API Base", description: "前端讀取分析結果的 API 位址。若未設定環境變數，預設使用同站的 Next.js API route。", bullets: ["頁面會用這個位址抓 opportunities、data-sources、backtest-summary", "部署到 Vercel 時，same-origin 代表前後端都由同一個 Next.js 專案提供"] }} />
            </div>
            {loadError ? (
              <div className="mt-4 rounded-2xl border border-[rgba(166,44,43,0.18)] bg-[rgba(166,44,43,0.08)] px-4 py-3 text-sm text-[color:var(--danger)]">
                {loadError}
              </div>
            ) : null}
            {!loadError && loadNotice ? (
              <div className="mt-4 rounded-2xl border border-[rgba(186,74,0,0.18)] bg-[rgba(186,74,0,0.08)] px-4 py-3 text-sm text-[color:var(--accent)]">
                {loadNotice}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => updateAllControls(
                  recommendPresetControls(longControls, analysis.longCandidates),
                  recommendPresetControls(shortControls, analysis.shortCandidates),
                )}
                className="rounded-full bg-[color:var(--foreground)] px-4 py-2 text-sm font-medium text-[color:var(--background)] transition hover:opacity-90"
              >
                套用全頁推薦模式
              </button>
              <p className="text-sm leading-7 text-soft">
                依目前搜尋與產業條件，同步替做多與做空清單套用各自最合適的推薦模式。
              </p>
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <PresetComparisonCard
                side="long"
                recommendedLabel={recommendedLongMode}
                currentLabel={longMode}
                counts={longPresetCounts}
              />
              <PresetComparisonCard
                side="short"
                recommendedLabel={recommendedShortMode}
                currentLabel={shortMode}
                counts={shortPresetCounts}
              />
            </div>
          </div>

          <div className="grid gap-4 rounded-[30px] bg-[color:var(--surface-strong)] p-6">
            <div>
              {labelInfo("資料狀態", metricInfo("dataStatus"))}
              <p className="mt-2 text-2xl font-semibold">{loading ? "載入中" : loadError ? "更新失敗" : loadNotice ? "部分更新" : "即時 API"}</p>
            </div>
            <div>
              {labelInfo("產生時間", metricInfo("generatedAt"))}
              <p className="mt-2 text-lg font-medium">{formatTimestamp(analysis.generatedAt)}</p>
            </div>
            <div>
              {labelInfo("做多 / 做空候選", metricInfo("candidateCount"))}
              <p className="mt-2 text-lg font-medium">
                {analysis.longCandidates.length} / {analysis.shortCandidates.length}
              </p>
            </div>
            <div>
              {labelInfo("股票池規則", metricInfo("universeRule"))}
              <p className="mt-2 text-lg font-medium">{analysis.universeRule}</p>
            </div>
            <div className="rounded-2xl bg-chip p-4 text-sm leading-7 text-muted">
              高勝率只能靠資料品質、回測與風控逐步逼近；這個系統先把規則、權重與交易計畫標準化，方便後續優化到比市售工具更強。
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        {analysis.methodology.map((item) => (
          <InfoButton
            key={item}
            {...methodologyInfo(item)}
            variant="card"
            label={
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-faint">Methodology</p>
                <p className="mt-3 text-sm leading-7 text-muted">{item}</p>
                <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[color:var(--accent-cool)]">
                  <span>查看教學卡</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
                    <path d="M5 12h14" />
                    <path d="m13 6 6 6-6 6" />
                  </svg>
                </div>
              </div>
            }
          />
        ))}
      </section>

      <section className="mt-8 grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[32px] border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[0_20px_60px_rgba(17,17,17,0.06)]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-[color:var(--accent-cool)]">Research</p>
              <h2 className="mt-2 text-3xl font-semibold">回測摘要</h2>
            </div>
            <p className="text-sm text-soft">
              {formatTimestamp(backtest.generatedAt)}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <ExplainableBadge text={`做多目前模式: ${longMode}`} info={presetInfo("long", longMode)} toneClass={presetToneClass(longMode)} />
            <ExplainableBadge text={`做多推薦模式: ${recommendedLongMode}`} info={recommendedLongInfo} toneClass={presetToneClass(recommendedLongMode)} />
            <ExplainableBadge text={`做空目前模式: ${shortMode}`} info={presetInfo("short", shortMode)} toneClass={presetToneClass(shortMode)} />
            <ExplainableBadge text={`做空推薦模式: ${recommendedShortMode}`} info={recommendedShortInfo} toneClass={presetToneClass(recommendedShortMode)} />
            <ExplainableBadge text={alignmentStatus.label} info={alignmentStatus.info} toneClass={alignmentStatus.toneClass} />
          </div>

          <p className="mt-4 text-sm leading-7 text-soft">
            這裡同步顯示目前與推薦模式，避免在解讀回測勝率、報酬與獲利因子時，脫離當前清單使用的篩選邏輯。
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => updateAllControls(
                recommendPresetControls(longControls, analysis.longCandidates),
                recommendPresetControls(shortControls, analysis.shortCandidates),
              )}
              className="rounded-full bg-[color:var(--foreground)] px-4 py-2 text-sm font-medium text-[color:var(--background)] transition hover:opacity-90"
            >
              回到推薦模式
            </button>
            <p className="text-sm leading-7 text-soft">
              看完回測後，可直接把做多與做空清單一起切回當前推薦模式，避免手動回調兩邊設定。
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <div className="rounded-2xl bg-[color:var(--surface-strong)] p-4"><ExplainableMetric label="整體勝率" value={formatWinRate(backtest.overallWinRate)} info={metricInfo("overallWinRate")} /></div>
            <div className="rounded-2xl bg-[color:var(--surface-strong)] p-4"><ExplainableMetric label="平均報酬" value={formatPercent(backtest.averageReturnPercent)} info={metricInfo("averageReturn")} valueClassName="mt-2 text-2xl font-semibold text-[color:var(--success)]" /></div>
            <div className="rounded-2xl bg-[color:var(--surface-strong)] p-4"><ExplainableMetric label="最大回撤" value={formatPercent(backtest.maxDrawdownPercent)} info={metricInfo("maxDrawdown")} valueClassName="mt-2 text-2xl font-semibold text-[color:var(--danger)]" /></div>
            <div className="rounded-2xl bg-[color:var(--surface-strong)] p-4"><ExplainableMetric label="獲利因子" value={formatRatio(backtest.profitFactor)} info={metricInfo("profitFactor")} /></div>
          </div>

          <div className="mt-5 grid gap-3">
            {backtest.periods.map((period) => (
              <div
                key={period.period}
                className="grid gap-3 rounded-2xl border border-[color:var(--border)] px-4 py-4 sm:grid-cols-[1.1fr_repeat(5,0.8fr)]"
              >
                <div>
                  <p className="text-sm font-semibold">{period.period}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-faint">
                    <span>{period.totalSignals} 筆訊號</span>
                    <InfoButton {...metricInfo("totalSignals")} />
                  </div>
                </div>
                <div>
                  {labelInfo("勝率", metricInfo("overallWinRate"), "text-xs uppercase tracking-[0.2em] text-faint")}
                  <p className="mt-2 font-semibold">{formatWinRate(period.winRate)}</p>
                </div>
                <div>
                  {labelInfo("平均報酬", metricInfo("averageReturn"), "text-xs uppercase tracking-[0.2em] text-faint")}
                  <p className="mt-2 font-semibold text-[color:var(--success)]">{formatPercent(period.averageReturnPercent)}</p>
                </div>
                <div>
                  {labelInfo("回撤", metricInfo("maxDrawdown"), "text-xs uppercase tracking-[0.2em] text-faint")}
                  <p className="mt-2 font-semibold text-[color:var(--danger)]">{formatPercent(period.maxDrawdownPercent)}</p>
                </div>
                <div>
                  {labelInfo("Profit Factor", metricInfo("profitFactor"), "text-xs uppercase tracking-[0.2em] text-faint")}
                  <p className="mt-2 font-semibold">{formatRatio(period.profitFactor)}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-5 text-sm leading-7 text-muted">{backtest.notes}</p>
        </div>

        <div className="rounded-[32px] border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[0_20px_60px_rgba(17,17,17,0.06)]">
          <p className="text-sm uppercase tracking-[0.3em] text-[color:var(--accent)]">Pipeline</p>
          <h2 className="mt-2 text-3xl font-semibold">資料來源進度</h2>
          <div className="mt-6 grid gap-3">
            {sources.map((source) => (
              <article key={source.name} className="rounded-2xl border border-[color:var(--border)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-faint">{source.category}</p>
                      <InfoButton title={source.category} description="這是資料來源在系統中的分類，用來區分價格、籌碼、法人與資券用途。" />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <h3 className="text-xl font-semibold">{source.name}</h3>
                      <InfoButton {...sourceInfo(source.name)} />
                    </div>
                  </div>
                  <ExplainableBadge text={source.status} info={termInfo(source.status)} />
                </div>
                <p className="mt-3 text-sm leading-7 text-muted">{source.coverage}</p>
                <p className="mt-2 text-sm leading-7 text-soft">{source.notes}</p>
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-faint">
                  Last update {formatTimestamp(source.lastUpdatedAt)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-8 xl:grid-cols-2">
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-[color:var(--success)]">Long Setup</p>
              <h2 className="mt-2 text-3xl font-semibold">做多優先名單</h2>
            </div>
          </div>
          <ListControls
            title="做多名單"
            controls={longControls}
            sectors={longSectors}
            resultCount={filteredLongCandidates.length}
            onChange={(next) => updateControls("long", next)}
            onApplyRecommended={() => updateControls("long", recommendPresetControls(longControls, analysis.longCandidates))}
            recommendedLabel={recommendedLongMode}
          />
          {filteredLongCandidates.length > 0 ? filteredLongCandidates.map((signal) => (
            <SignalCard key={`${signal.symbol}-${signal.direction}`} signal={signal} />
          )) : (
            <div className="rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)] p-6 text-sm leading-7 text-muted">
              <p>目前條件下沒有符合的做多標的，請放寬搜尋字詞、改變產業或重設排序。</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => updateControls("long", relaxControlsForResults(longControls, analysis.longCandidates))}
                  className="rounded-full bg-[color:var(--foreground)] px-4 py-2 text-sm font-medium text-[color:var(--background)] transition hover:opacity-90"
                >
                  自動放寬條件
                </button>
                <p className="text-sm text-soft">系統會先保留搜尋字詞，再逐步放寬可信度、情境門檻與產業限制；若仍沒有結果，最後才會放寬搜尋字詞。</p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-[color:var(--danger)]">Short Setup</p>
              <h2 className="mt-2 text-3xl font-semibold">做空優先名單</h2>
            </div>
          </div>
          <ListControls
            title="做空名單"
            controls={shortControls}
            sectors={shortSectors}
            resultCount={filteredShortCandidates.length}
            onChange={(next) => updateControls("short", next)}
            onApplyRecommended={() => updateControls("short", recommendPresetControls(shortControls, analysis.shortCandidates))}
            recommendedLabel={recommendedShortMode}
          />
          {filteredShortCandidates.length > 0 ? filteredShortCandidates.map((signal) => (
            <SignalCard key={`${signal.symbol}-${signal.direction}`} signal={signal} />
          )) : (
            <div className="rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)] p-6 text-sm leading-7 text-muted">
              <p>目前條件下沒有符合的做空標的，請放寬搜尋字詞、改變產業或重設排序。</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => updateControls("short", relaxControlsForResults(shortControls, analysis.shortCandidates))}
                  className="rounded-full bg-[color:var(--foreground)] px-4 py-2 text-sm font-medium text-[color:var(--background)] transition hover:opacity-90"
                >
                  自動放寬條件
                </button>
                <p className="text-sm text-soft">系統會先保留搜尋字詞，再逐步放寬可信度、情境門檻與產業限制；若仍沒有結果，最後才會放寬搜尋字詞。</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 py-8 sm:px-8 lg:px-10"><div className="rounded-[36px] border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-lg text-muted">正在載入篩選條件與儀表板...</div></main>}>
      <DashboardPage />
    </Suspense>
  );
}
