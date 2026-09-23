// src/platforms/UsagePanel.jsx
//
// Token and cost readout for the current session, rendered inside the settings
// overlay. Reads the module-level meter in tools/usageMeter.js.
//
// The design rule here is that a missing number must never be displayed as
// zero. Twelve of the Aliyun route models report no cached_tokens field, and a
// panel showing "0% cached" for them would tell the player their cache is
// broken when what actually happened is that nobody measured it. Same for cost:
// several models have no published per-1M price, so the estimate says so
// instead of quietly omitting them from a total that still looks complete.

import React from "react";
import { getUsageSummary } from "../tools/usageMeter";

const L = {
  zh: {
    title: "📊 本次会话用量",
    empty: "本次会话还没有生成任何回合。",
    tokens: "Token 总量",
    input: "输入",
    output: "输出",
    cache: "缓存命中率",
    cacheNone: "未上报",
    cacheNote: (n) => `${n} 次调用未上报缓存数据，已从统计中排除`,
    latency: "生成耗时 (中位数)",
    cost: "预估费用",
    costPartial: "部分模型无公开价格，实际费用高于此数",
    costNone: "所服务的模型没有公开价格",
    calls: "API 调用次数",
    note: "仅本次会话，不会保存，也不会离开你的设备。以服务商账单为准。",
  },
  en: {
    title: "📊 This session",
    empty: "No rounds generated in this session yet.",
    tokens: "Total tokens",
    input: "in",
    output: "out",
    cache: "Cache hit rate",
    cacheNone: "not reported",
    cacheNote: (n) => `${n} call${n === 1 ? "" : "s"} reported no cache data and are excluded`,
    latency: "Generation time (median)",
    cost: "Estimated cost",
    costPartial: "Some models have no published price — the real cost is higher",
    costNone: "No published price for the model that served these rounds",
    calls: "API calls",
    note: "This session only. Not saved, never leaves your device. Your provider's bill is the authority.",
  },
  ko: {
    title: "📊 이번 세션 사용량",
    empty: "이번 세션에서 생성된 라운드가 없습니다.",
    tokens: "총 토큰",
    input: "입력",
    output: "출력",
    cache: "캐시 적중률",
    cacheNone: "미보고",
    cacheNote: (n) => `${n}회 호출은 캐시 정보를 보고하지 않아 집계에서 제외되었습니다`,
    latency: "생성 시간 (중앙값)",
    cost: "예상 비용",
    costPartial: "일부 모델은 공개 가격이 없어 실제 비용은 더 높습니다",
    costNone: "이 라운드를 처리한 모델의 공개 가격이 없습니다",
    calls: "API 호출 수",
    note: "이번 세션에만 해당하며 저장되지 않고 기기를 벗어나지 않습니다. 실제 청구는 제공업체 기준입니다.",
  },
};

const fmtTokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

// Rounds are cheap enough that a fixed 2 decimal places would show $0.00 for a
// whole playthrough, which reads as free rather than as small.
const fmtUsd = (usd) => {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
};

export default function UsagePanel({ language = "zh", th }) {
  const u = getUsageSummary();
  const t = L[language] || L.zh;

  const label = { fontSize: 11, color: th.textMuted };
  const value = { fontSize: 12, color: th.textPrimary, fontWeight: 600 };
  const row = { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5, gap: 10 };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, color: th.textPrimary, fontWeight: 600, marginBottom: 8 }}>{t.title}</div>

      {u.calls === 0 ? (
        <div style={{ fontSize: 10, color: th.textFaint, lineHeight: 1.5 }}>{t.empty}</div>
      ) : (
        <div style={{ background: th.cardBg, border: `1px solid ${th.border}`, borderRadius: 10, padding: "10px 12px" }}>
          <div style={row}>
            <span style={label}>{t.tokens}</span>
            <span style={value}>
              {fmtTokens(u.totalTokens)}
              <span style={{ ...label, fontWeight: 400 }}>
                {"  "}({t.input} {fmtTokens(u.promptTokens)} · {t.output} {fmtTokens(u.completionTokens)})
              </span>
            </span>
          </div>

          <div style={row}>
            <span style={label}>{t.cache}</span>
            {/* null, not 0: a provider that reports nothing is not a provider
                reporting a miss. */}
            <span style={u.cacheHitRate === null ? { ...value, color: th.textFaint } : value}>
              {u.cacheHitRate === null ? t.cacheNone : `${Math.round(u.cacheHitRate * 100)}%`}
            </span>
          </div>
          {u.unmeasuredCalls > 0 && u.cacheHitRate !== null && (
            <div style={{ fontSize: 9, color: th.textFaint, marginBottom: 6, lineHeight: 1.4 }}>
              {t.cacheNote(u.unmeasuredCalls)}
            </div>
          )}

          <div style={row}>
            <span style={label}>{t.latency}</span>
            <span style={value}>{u.p50LatencyMs === null ? "—" : `${(u.p50LatencyMs / 1000).toFixed(1)}s`}</span>
          </div>

          <div style={row}>
            <span style={label}>{t.cost}</span>
            <span style={u.costUsd === 0 && !u.costComplete ? { ...value, color: th.textFaint } : value}>
              {u.costUsd === 0 && !u.costComplete ? "—" : `≈ ${fmtUsd(u.costUsd)}`}
            </span>
          </div>
          {!u.costComplete && (
            <div style={{ fontSize: 9, color: th.textFaint, marginBottom: 6, lineHeight: 1.4 }}>
              {u.costUsd === 0 ? t.costNone : t.costPartial}
            </div>
          )}

          <div style={{ ...row, marginBottom: 0 }}>
            <span style={label}>{t.calls}</span>
            <span style={value}>{u.calls}</span>
          </div>
        </div>
      )}

      <div style={{ fontSize: 9, color: th.textFaint, marginTop: 6, lineHeight: 1.5 }}>{t.note}</div>
    </div>
  );
}
