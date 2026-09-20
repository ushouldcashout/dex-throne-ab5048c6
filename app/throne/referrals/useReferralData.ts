/**
 * All data for the Referrals page, from Orderly's referral API via @orderly.network/hooks 3.2.1.
 * No THRONE backend. Every query is private (needs an Orderly key), so nothing loads until the
 * account reaches EnableTrading; the page shows a connect state before that.
 */
import { useMemo, useState } from "react";
import {
  useAccount,
  useAccountInfo,
  useMutation,
  usePrivateQuery,
  useRefereeInfo,
  useRefereeRebateSummary,
  useReferralRebateSummary,
  noCacheConfig,
  RefferalAPI,
} from "@orderly.network/hooks";
import { AccountStatusEnum } from "@orderly.network/types";
import { TAKER_FEE_BPS_DEFAULT, splitShares } from "./economics";
import { dayRange, daysAgoUtc, ymdUtc } from "./format";

export type ReferralRow = {
  address: string;
  joinedAt: number;
  volume: number;
  fee: number;
  rewards: number; // your rewards from this trader
  discount: number; // estimate of what the trader saved (from the code's split)
  traded: boolean;
  code: string;
};

export type HistoryRow = {
  date: string; // yyyy-MM-dd
  volume: number;
  traders: number;
  rewards: number;
  settled: boolean;
};

export type ReferralSort =
  | "descending_referral_rebate"
  | "ascending_referral_rebate"
  | "descending_volume"
  | "ascending_volume"
  | "descending_code_binding_time"
  | "ascending_code_binding_time";

export const PAGE_SIZE = 25;

export function useReferralData() {
  const { state } = useAccount();
  const ready = state.status >= AccountStatusEnum.EnableTrading;
  const connected = state.status >= AccountStatusEnum.Connected;

  // account-level taker fee. futures_taker_fee_rate is already in bps (4.5 → 0.045%)
  const { data: accountInfo } = useAccountInfo();
  const takerBps =
    typeof accountInfo?.futures_taker_fee_rate === "number" && accountInfo.futures_taker_fee_rate > 0
      ? accountInfo.futures_taker_fee_rate
      : TAKER_FEE_BPS_DEFAULT;

  // codes + totals (referrer side) and referred-by info (referee side)
  const {
    data: info,
    isLoading: infoLoading,
    error: infoError,
    mutate: refreshInfo,
  } = usePrivateQuery<RefferalAPI.ReferralInfo>(ready ? "/v1/referral/info" : null, {
    revalidateOnFocus: false,
    errorRetryCount: 3,
    ...noCacheConfig,
  });

  const codes: RefferalAPI.ReferralCode[] = info?.referrer_info?.referral_codes ?? [];
  const [codeIndex, setCodeIndex] = useState(0);
  const code = codes[Math.min(codeIndex, Math.max(codes.length - 1, 0))];
  const hasCode = codes.length > 0;
  const referredBy = info?.referee_info?.referer_code || undefined;
  const isReferred = !!referredBy;

  const split = useMemo(
    () => splitShares(code?.referrer_rebate_rate ?? 0.6, code?.referee_rebate_rate ?? 0.4),
    [code?.referrer_rebate_rate, code?.referee_rebate_rate],
  );

  // auto-referral progress (only if enabled in Orderly One; 404s otherwise)
  const { data: autoCode } = usePrivateQuery<{
    auto_referral_code?: string;
    required_volume?: number;
    completed_volume?: number;
  }>(ready && !hasCode ? "/v1/referral/auto_referral/progress" : null, {
    revalidateOnFocus: false,
    errorRetryCount: 0,
  });

  // referrals table (server-side sort + paging)
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ReferralSort>("descending_volume");
  const [rows, { total: rowsTotal, isLoading: rowsLoading, refresh: refreshRows }] =
    useRefereeInfo({ size: PAGE_SIZE, page, sort, initialSize: 1 });

  const referrals: ReferralRow[] = useMemo(() => {
    if (!ready || !hasCode || !rows) return [];
    return rows.map((r) => {
      const c = codes.find((x) => x.code === r.referral_code) ?? code;
      const s = splitShares(c?.referrer_rebate_rate ?? 0.6, c?.referee_rebate_rate ?? 0.4);
      const rewards = r.referral_rebate ?? 0;
      return {
        address: r.user_address,
        joinedAt: r.code_binding_time,
        volume: r.volume ?? 0,
        fee: r.fee ?? 0,
        rewards,
        discount: s.keep > 0 ? rewards * (s.give / s.keep) : 0,
        traded: (r.volume ?? 0) > 0 || r.trade_status === "TRADED",
        code: r.referral_code,
      };
    });
  }, [ready, hasCode, rows, codes, code]);

  // daily rewards (90 days) for history + chart
  const from90 = useMemo(() => daysAgoUtc(89), []);
  const today = useMemo(() => new Date(), []);
  const [summary, { isLoading: summaryLoading, refresh: refreshSummary }] =
    useReferralRebateSummary({
      size: 100,
      startDate: ymdUtc(from90),
      endDate: ymdUtc(today),
      initialSize: 1,
    });

  const todayYmd = ymdUtc(today);
  const history: HistoryRow[] = useMemo(() => {
    if (!summary) return [];
    return summary
      .map((s) => ({
        date: s.date,
        volume: s.volume ?? 0,
        traders: s.daily_traded_referral ?? 0,
        rewards: s.referral_rebate ?? 0,
        settled: s.date < todayYmd,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  }, [summary, todayYmd]);

  const [chartDays, setChartDays] = useState<30 | 90>(30);
  const chart = useMemo(() => {
    const byDate = new Map(history.map((l) => [l.date, l]));
    return dayRange(daysAgoUtc(chartDays - 1), today).map((d) => {
      const l = byDate.get(d);
      return { date: d, rewards: l?.rewards ?? 0, volume: l?.volume ?? 0, traders: l?.traders ?? 0 };
    });
  }, [history, chartDays, today]);

  const pending = history.filter((l) => !l.settled).reduce((a, l) => a + l.rewards, 0);

  // referred-trader side: daily discount received
  const { data: refereeDaily } = useRefereeRebateSummary(
    ready && isReferred ? { startDate: from90, endDate: today } : {},
  );

  // mutations
  const [editSplit, { isMutating: splitMutating }] = useMutation("/v1/referral/edit_split", "POST");
  const [bindCode, { isMutating: bindMutating }] = useMutation("/v1/referral/bind", "POST");

  const refreshAll = async () => {
    await Promise.allSettled([refreshInfo(), refreshRows(), refreshSummary()]);
  };

  return {
    connected,
    ready,
    address: state.address,
    takerBps,
    info,
    infoLoading: ready && infoLoading,
    infoError,
    codes,
    code,
    codeIndex,
    setCodeIndex,
    hasCode,
    split,
    autoCode,
    referrals,
    referralsTotal: rowsTotal,
    rowsLoading,
    page,
    setPage,
    sort,
    setSort,
    history,
    summaryLoading,
    chart,
    chartDays,
    setChartDays,
    pending,
    referredBy,
    isReferred,
    referee: info?.referee_info,
    refereeDaily: refereeDaily ?? [],
    editSplit,
    splitMutating,
    bindCode,
    bindMutating,
    refreshAll,
  };
}

export type ReferralData = ReturnType<typeof useReferralData>;
