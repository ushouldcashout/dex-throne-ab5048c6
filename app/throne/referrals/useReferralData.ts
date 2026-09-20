/**
 * All data for the Referrals page, from Orderly's referral API via @orderly.network/hooks 3.2.1.
 * No THRONE backend. Every query is private (needs an Orderly key), so nothing loads until the
 * account reaches EnableTrading.
 *
 * THRONE runs Orderly's multilevel affiliate program (Orderly One → Affiliates), so the primary
 * sources are the `/v1/referral/multi_level/*` endpoints; the legacy endpoints are kept as
 * fallbacks so the page still works if the program type ever changes.
 *
 * Self-serve codes: any account past the volume prerequisite (0 USDC for THRONE) can create one
 * code with `POST /v1/referral/multi_level/claim_code` and rename it with
 * `/v1/referral/edit_referral_code` until a trader has bound to it.
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
import { TAKER_FEE_BPS_DEFAULT, COMMISSION_SHARE_DEFAULT } from "./economics";
import { dayRange, daysAgoUtc, ymdUtc } from "./format";

export type ReferralRow = {
  address: string;
  joinedAt: number;
  volume: number;
  fee?: number;
  rewards: number; // your rewards from this trader
  traded: boolean;
  code?: string;
};

export type HistoryRow = {
  date: string; // yyyy-MM-dd
  volume: number;
  traders: number;
  rewards: number;
  settled: boolean;
};

export type ReferralSort = "volume" | "rewards" | "joined";

export const PAGE_SIZE = 25;

type MlRefereeRow = {
  user_address: string;
  code_binding_time: number;
  direct_volume?: number;
  indirect_volume?: number;
  direct_rebate?: number;
  indirect_rebate?: number;
  direct_bonus_rebate?: number;
  fee?: number;
  referee_rebate_rate?: number;
};

type MlStats = {
  total_invites: number;
  total_volume: number;
  total_rebate: number;
  direct_invites?: number;
  direct_volume?: number;
  direct_rebate?: number;
};

type HistoryApiRow = {
  date: string;
  referral_code?: string;
  volume?: number;
  referral_rebate?: number;
  direct_bonus_rebate?: number;
  user_address?: string;
};

export function useReferralData() {
  const { state } = useAccount();
  const ready = state.status >= AccountStatusEnum.EnableTrading;
  const connected = state.status >= AccountStatusEnum.Connected;
  const q = (path: string | null) => (ready && path ? path : null);

  // account-level taker fee (already in bps: 4.5 → 0.045%)
  const { data: accountInfo } = useAccountInfo();
  const takerBps =
    typeof accountInfo?.futures_taker_fee_rate === "number" && accountInfo.futures_taker_fee_rate > 0
      ? accountInfo.futures_taker_fee_rate
      : TAKER_FEE_BPS_DEFAULT;

  // lifetime volume (Enter Code is for accounts that have not traded yet)
  const { data: volStats } = usePrivateQuery<{ perp_volume_ltd?: number }>(q("/v1/volume/user/stats"), {
    revalidateOnFocus: false,
  });
  const lifetimeVolume = volStats?.perp_volume_ltd ?? 0;

  // codes + referred-by (works for both programs)
  const {
    data: info,
    isLoading: infoLoading,
    error: infoError,
    mutate: refreshInfo,
  } = usePrivateQuery<RefferalAPI.ReferralInfo>(q("/v1/referral/info"), {
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

  // multilevel program config for this account
  const { data: maxRate, mutate: refreshMaxRate } = usePrivateQuery<{
    max_rebate_rate?: number;
    bonus_max_rebate_rate?: number;
    base_rebate_rate?: number;
  }>(q("/v1/referral/multi_level/max_rebate_rate"), { revalidateOnFocus: false, shouldRetryOnError: false });
  const { data: rebateInfo, mutate: refreshRebateInfo } = usePrivateQuery<{
    default_referee_rebate_rate?: number;
    default_bonus_referee_rebate_rate?: number;
    max_rebate_rate?: number;
    bonus_max_rebate_rate?: number;
  }>(q("/v1/referral/multi_level/rebate_info"), { revalidateOnFocus: false, shouldRetryOnError: false });
  const { data: prereq } = usePrivateQuery<{ current_volume?: number; required_volume?: number }>(
    q("/v1/referral/multi_level/volume_prerequisite"),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const isMultilevel = !!maxRate;
  // Multilevel: an L1 affiliate's total rate = base (minimum pass-down) + bonus. Orderly One's
  // "Base referral commission 40%" is the base; bonus is 0 unless the desk grants a KOL more.
  // The whole rate is earned by the referrer on direct referrals; traders get no discount.
  const mlRate =
    (maxRate?.bonus_max_rebate_rate ?? maxRate?.max_rebate_rate ?? 0) + (maxRate?.base_rebate_rate ?? 0);
  const legacyRate = code ? code.referrer_rebate_rate + code.referee_rebate_rate : 0;
  const commissionRate = (isMultilevel ? mlRate : legacyRate) || COMMISSION_SHARE_DEFAULT;
  // legacy program only: part of the code's rate handed to the trader as a discount
  const refereeRate = isMultilevel ? 0 : code?.referee_rebate_rate ?? 0;
  const referrerRate = commissionRate - refereeRate;
  const debug = { maxRate, rebateInfo, prereq, info };
  const canCreate =
    ready && !hasCode && (!prereq || (prereq.current_volume ?? 0) >= (prereq.required_volume ?? 0));

  // headline stats
  const { data: statsAll, mutate: refreshStatsAll } = usePrivateQuery<MlStats>(
    q(hasCode ? "/v1/referral/multi_level/statistics?time_range=all_time" : null),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const { data: stats30, mutate: refreshStats30 } = usePrivateQuery<MlStats>(
    q(hasCode ? "/v1/referral/multi_level/statistics?time_range=30d" : null),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const r = info?.referrer_info;
  const totals = {
    invites: statsAll?.total_invites ?? r?.total_invites ?? 0,
    invites30: stats30?.total_invites ?? r?.["30d_invites"] ?? 0,
    traded: r?.total_traded ?? 0,
    volume: statsAll?.total_volume ?? r?.total_referee_volume ?? 0,
    fees: r?.total_referee_fee ?? 0,
    rewards: statsAll?.total_rebate ?? r?.total_referrer_rebate ?? 0,
    rewards30: stats30?.total_rebate ?? r?.["30d_referrer_rebate"] ?? 0,
  };

  // referrals table: multilevel list first, legacy referee_info as fallback
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ReferralSort>("volume");
  const [sortDesc, setSortDesc] = useState(true);
  const { data: mlList, isLoading: mlLoading, mutate: refreshMl } = usePrivateQuery<{
    rows?: MlRefereeRow[];
    meta?: { total?: number };
    data?: { rows?: MlRefereeRow[]; meta?: { total?: number } };
  }>(q(hasCode ? `/v1/referral/multi_level/referee_list?page=${page}&size=${PAGE_SIZE}` : null), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const mlRows = mlList?.rows ?? mlList?.data?.rows;
  const mlTotal = mlList?.meta?.total ?? mlList?.data?.meta?.total;
  const [legacyRows, { total: legacyTotal, isLoading: legacyLoading, refresh: refreshLegacy }] =
    useRefereeInfo({ size: PAGE_SIZE, page, sort: "descending_volume", initialSize: 1 });

  const referrals: ReferralRow[] = useMemo(() => {
    if (!ready || !hasCode) return [];
    let rows: ReferralRow[];
    if (mlRows && mlRows.length > 0) {
      rows = mlRows.map((x: MlRefereeRow) => {
        const volume = (x.direct_volume ?? 0) + (x.indirect_volume ?? 0);
        return {
          address: x.user_address,
          joinedAt: x.code_binding_time,
          volume,
          fee: x.fee,
          rewards: (x.direct_rebate ?? 0) + (x.indirect_rebate ?? 0) + (x.direct_bonus_rebate ?? 0),
          traded: volume > 0,
        };
      });
    } else {
      rows = (legacyRows ?? []).map((x) => ({
        address: x.user_address,
        joinedAt: x.code_binding_time,
        volume: x.volume ?? 0,
        fee: x.fee,
        rewards: x.referral_rebate ?? 0,
        traded: (x.volume ?? 0) > 0 || x.trade_status === "TRADED",
        code: x.referral_code,
      }));
    }
    const key = sort === "volume" ? "volume" : sort === "rewards" ? "rewards" : "joinedAt";
    rows.sort((a, b) => (sortDesc ? b[key] - a[key] : a[key] - b[key]));
    return rows;
  }, [ready, hasCode, mlRows, legacyRows, sort, sortDesc]);
  const referralsTotal = mlRows && mlRows.length > 0 ? mlTotal ?? mlRows.length : legacyTotal || 0;
  const rowsLoading = mlLoading || legacyLoading;

  // daily history: multilevel referral_history (per trader per day) aggregated, legacy summary fallback
  const from90 = useMemo(() => daysAgoUtc(89), []);
  const today = useMemo(() => new Date(), []);
  const todayYmd = ymdUtc(today);
  const { data: hist, isLoading: histLoading, mutate: refreshHist } = usePrivateQuery<{
    rows?: HistoryApiRow[];
    data?: { rows?: HistoryApiRow[] };
  }>(q(hasCode ? `/v1/referral/referral_history?start_date=${ymdUtc(from90)}&end_date=${todayYmd}` : null), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const [summary, { isLoading: summaryLoading, refresh: refreshSummary }] = useReferralRebateSummary({
    size: 100,
    startDate: ymdUtc(from90),
    endDate: todayYmd,
    initialSize: 1,
  });

  const history: HistoryRow[] = useMemo(() => {
    const rows = hist?.rows ?? hist?.data?.rows;
    const byDate = new Map<string, HistoryRow & { addrs: Set<string> }>();
    if (rows && rows.length > 0) {
      for (const x of rows) {
        const d = x.date?.slice(0, 10);
        if (!d) continue;
        const cur = byDate.get(d) ?? { date: d, volume: 0, traders: 0, rewards: 0, settled: d < todayYmd, addrs: new Set() };
        cur.volume += x.volume ?? 0;
        cur.rewards += (x.referral_rebate ?? 0) + (x.direct_bonus_rebate ?? 0);
        if (x.user_address && (x.volume ?? 0) > 0) cur.addrs.add(x.user_address);
        byDate.set(d, cur);
      }
      return [...byDate.values()]
        .map(({ addrs, ...h }) => ({ ...h, traders: addrs.size }))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
    }
    if (!summary) return [];
    return summary
      .map((s) => ({
        date: s.date,
        volume: s.volume ?? 0,
        traders: s.daily_traded_referral ?? 0,
        rewards: s.referral_rebate ?? 0,
        settled: s.date < todayYmd,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [hist, summary, todayYmd]);

  const [chartDays, setChartDays] = useState<30 | 90>(30);
  const chart = useMemo(() => {
    const byDate = new Map(history.map((l) => [l.date, l]));
    return dayRange(daysAgoUtc(chartDays - 1), today).map((d) => {
      const l = byDate.get(d);
      return { date: d, rewards: l?.rewards ?? 0, volume: l?.volume ?? 0, traders: l?.traders ?? 0 };
    });
  }, [history, chartDays, today]);
  const pending = history.filter((l) => !l.settled).reduce((a, l) => a + l.rewards, 0);

  // referred-trader side
  const { data: refereeDaily } = useRefereeRebateSummary(
    ready && isReferred ? { startDate: from90, endDate: today } : {},
  );

  // mutations
  const [claimCode, { isMutating: claimMutating }] = useMutation("/v1/referral/multi_level/claim_code", "POST");
  const [renameCode, { isMutating: renameMutating }] = useMutation("/v1/referral/edit_referral_code", "POST");
  const [updateRate, { isMutating: rateMutating }] = useMutation("/v1/referral/multi_level/rebate_rate/update", "POST");
  const [bindCode, { isMutating: bindMutating }] = useMutation("/v1/referral/bind", "POST");

  const refreshAll = async () => {
    await Promise.allSettled([
      refreshInfo(),
      refreshMaxRate(),
      refreshRebateInfo(),
      refreshStatsAll(),
      refreshStats30(),
      refreshMl(),
      refreshLegacy(),
      refreshHist(),
      refreshSummary(),
    ]);
  };

  return {
    connected,
    ready,
    address: state.address,
    takerBps,
    lifetimeVolume,
    info,
    infoLoading: ready && infoLoading,
    infoError,
    // codes
    codes,
    code,
    codeIndex,
    setCodeIndex,
    hasCode,
    canCreate,
    prereq,
    isMultilevel,
    commissionRate,
    refereeRate,
    referrerRate,
    debug,
    // headline
    totals,
    // table
    referrals,
    referralsTotal,
    rowsLoading,
    page,
    setPage,
    sort,
    sortDesc,
    setSort: (s: ReferralSort) => {
      if (s === sort) setSortDesc((d) => !d);
      else {
        setSort(s);
        setSortDesc(true);
      }
    },
    // history
    history,
    summaryLoading: histLoading || summaryLoading,
    chart,
    chartDays,
    setChartDays,
    pending,
    // referred side
    referredBy,
    isReferred,
    referee: info?.referee_info,
    refereeDaily: refereeDaily ?? [],
    // actions
    claimCode,
    claimMutating,
    renameCode,
    renameMutating,
    updateRate,
    rateMutating,
    bindCode,
    bindMutating,
    refreshAll,
  };
}

export type ReferralData = ReturnType<typeof useReferralData>;
