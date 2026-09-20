/**
 * All data for the Banner page, from Orderly's referral API via @orderly.network/hooks 3.2.1.
 * No THRONE backend. Every query is private (needs an Orderly key), so nothing loads until the
 * account reaches EnableTrading; the page shows a connect state before that.
 *
 * Vocabulary: referral code = banner, referrer = banner holder, referee = sworn trader,
 * rebate = tribute.
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

export type SwornRow = {
  address: string;
  swornAt: number;
  volume: number;
  fee: number;
  tribute: number;
  discount: number; // estimate: tribute × give/keep of the code they swore to
  traded: boolean;
  code: string;
};

export type LedgerRow = {
  date: string; // yyyy-MM-dd
  volume: number;
  traders: number;
  tribute: number;
  settled: boolean;
};

export type SwornSort =
  | "descending_referral_rebate"
  | "ascending_referral_rebate"
  | "descending_volume"
  | "ascending_volume"
  | "descending_code_binding_time"
  | "ascending_code_binding_time";

export const PAGE_SIZE = 25;

export function useBannerData() {
  const { state } = useAccount();
  const ready = state.status >= AccountStatusEnum.EnableTrading;
  const connected = state.status >= AccountStatusEnum.Connected;

  // account-level taker fee. futures_taker_fee_rate is already in bps (4.5 → 0.045%;
  // Orderly's own fee page multiplies it by 0.01 to show a percent)
  const { data: accountInfo } = useAccountInfo();
  const takerBps =
    typeof accountInfo?.futures_taker_fee_rate === "number" && accountInfo.futures_taker_fee_rate > 0
      ? accountInfo.futures_taker_fee_rate
      : TAKER_FEE_BPS_DEFAULT;

  // banner + sworn summary
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
  const isHolder = codes.length > 0;
  const swornTo = info?.referee_info?.referer_code || undefined;
  const isSworn = !!swornTo;

  const split = useMemo(
    () => splitShares(code?.referrer_rebate_rate ?? 0.6, code?.referee_rebate_rate ?? 0.4),
    [code?.referrer_rebate_rate, code?.referee_rebate_rate],
  );

  // auto-referral progress (only if the desk enabled it in Orderly One; 404s otherwise)
  const { data: autoRaise } = usePrivateQuery<{
    auto_referral_code?: string;
    required_volume?: number;
    completed_volume?: number;
  }>(ready && !isHolder ? "/v1/referral/auto_referral/progress" : null, {
    revalidateOnFocus: false,
    errorRetryCount: 0,
  });

  // sworn traders table (server-side sort + paging)
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SwornSort>("descending_referral_rebate");
  const [rows, { total: rowsTotal, isLoading: rowsLoading, refresh: refreshRows }] =
    useRefereeInfo({ size: PAGE_SIZE, page, sort, initialSize: 1 });

  const sworn: SwornRow[] = useMemo(() => {
    if (!ready || !isHolder || !rows) return [];
    return rows.map((r) => {
      const c = codes.find((x) => x.code === r.referral_code) ?? code;
      const s = splitShares(c?.referrer_rebate_rate ?? 0.6, c?.referee_rebate_rate ?? 0.4);
      const tribute = r.referral_rebate ?? 0;
      return {
        address: r.user_address,
        swornAt: r.code_binding_time,
        volume: r.volume ?? 0,
        fee: r.fee ?? 0,
        tribute,
        discount: s.keep > 0 ? tribute * (s.give / s.keep) : 0,
        traded: (r.volume ?? 0) > 0 || r.trade_status === "TRADED",
        code: r.referral_code,
      };
    });
  }, [ready, isHolder, rows, codes, code]);

  // daily tribute for chart + ledger (90 days)
  const [chartDays, setChartDays] = useState<30 | 90>(30);
  const from90 = useMemo(() => daysAgoUtc(89), []);
  const today = useMemo(() => new Date(), []);
  const [summary, { isLoading: summaryLoading, refresh: refreshSummary }] =
    useReferralRebateSummary({
      size: 100,
      startDate: ymdUtc(from90),
      endDate: ymdUtc(today),
      initialSize: 1,
    });
  // (both infinite queries are auth-gated inside the hooks; for a non-holder they return empty)

  const todayYmd = ymdUtc(today);
  const ledger: LedgerRow[] = useMemo(() => {
    if (!summary) return [];
    return summary
      .map((s) => ({
        date: s.date,
        volume: s.volume ?? 0,
        traders: s.daily_traded_referral ?? 0,
        tribute: s.referral_rebate ?? 0,
        settled: s.date < todayYmd,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  }, [summary, todayYmd]);

  const chart = useMemo(() => {
    const byDate = new Map(ledger.map((l) => [l.date, l]));
    return dayRange(daysAgoUtc(chartDays - 1), today).map((d) => {
      const l = byDate.get(d);
      return { date: d, tribute: l?.tribute ?? 0, volume: l?.volume ?? 0, traders: l?.traders ?? 0 };
    });
  }, [ledger, chartDays, today]);

  const unpaid = ledger.filter((l) => !l.settled).reduce((a, l) => a + l.tribute, 0);

  // sworn (referee) side: daily discount, for "saved so far" cross-check
  const { data: refereeDaily } = useRefereeRebateSummary(
    ready && isSworn ? { startDate: from90, endDate: today } : {},
  );

  // mutations
  const [editSplit, { isMutating: splitMutating }] = useMutation("/v1/referral/edit_split", "POST");
  const [bindCode, { isMutating: bindMutating }] = useMutation("/v1/referral/bind", "POST");

  const refreshAll = async () => {
    await Promise.allSettled([refreshInfo(), refreshRows(), refreshSummary()]);
  };

  return {
    // account
    connected,
    ready,
    address: state.address,
    takerBps,
    // banner
    info,
    infoLoading: ready && infoLoading,
    infoError,
    codes,
    code,
    codeIndex,
    setCodeIndex,
    isHolder,
    split,
    autoRaise,
    // sworn traders
    sworn,
    swornTotal: rowsTotal,
    rowsLoading,
    page,
    setPage,
    sort,
    setSort,
    // chart + ledger
    chart,
    chartDays,
    setChartDays,
    ledger,
    summaryLoading,
    unpaid,
    // sworn side
    swornTo,
    isSworn,
    referee: info?.referee_info,
    refereeDaily: refereeDaily ?? [],
    // actions
    editSplit,
    splitMutating,
    bindCode,
    bindMutating,
    refreshAll,
  };
}

export type BannerData = ReturnType<typeof useBannerData>;
