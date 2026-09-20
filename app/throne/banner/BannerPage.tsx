/**
 * THRONE Banner page (trade.throne.network/banner).
 *
 * Replaces Orderly's stock Affiliates page. Same data (Orderly referral API via hooks), THRONE
 * vocabulary and density: a referral code is a *banner*, referees have *sworn to a banner*,
 * rebates are *tribute*. The words referral/referee/affiliate appear only in the small print.
 *
 * States: connect · loading · error · holder (active or raised-with-no-traders) · sworn-only ·
 * claim/join. A wallet that is both holder and sworn sees the holder view with a sworn strip.
 *
 * Layout and copy follow the Claude Design handoff (design_handoff_throne/banner v5).
 * See docs/THRONE_CHANGES.md.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@orderly.network/ui";
import {
  useCheckReferralCode,
  REFERRAL_CODE_MAX_LENGTH,
  REFERRAL_CODE_MIN_LENGTH,
} from "@orderly.network/hooks";
import { useBannerData, PAGE_SIZE, type BannerData, type SwornSort } from "./useBannerData";
import {
  discountFraction,
  effectiveTakerBps,
  holderPer100k,
  refereeDiscountFraction,
  traderPer100k,
} from "./economics";
import { bps, dateFromYmd, dateTimeUtc, dayMonth, pct, shortAddr, usd, usd0 } from "./format";
import "./banner.css";

const DESK_URL = "https://trade.throne.network";
// Public share copy links to throne.network while the desk is gated. After the Sep 25 open this
// can become the ?ref= desk link.
const SHARE_URL = "https://throne.network";
const X_URL = "https://x.com/thronedefi";

function copy(text: string, what = "copied") {
  navigator.clipboard?.writeText(text).then(
    () => toast.success(what),
    () => toast.error("couldn't copy"),
  );
}

export default function BannerPage() {
  const d = useBannerData();
  const [splitOpen, setSplitOpen] = useState(false);

  return (
    <div className="tb">
      <Strip d={d} />
      <Body d={d} onEditSplit={() => setSplitOpen(true)} />
      {splitOpen && d.code && <SplitModal d={d} onClose={() => setSplitOpen(false)} />}
      <div className="tb-foot">
        <span>
          in the seat · <a href={X_URL} target="_blank" rel="noreferrer">join us on twitter</a>
        </span>
        <span>tribute settles daily at 00:00 utc, straight to your desk balance. no cap, no expiry.</span>
      </div>
    </div>
  );
}

/* ---------- header strip ---------- */

function Strip({ d }: { d: BannerData }) {
  let pill = "not raised";
  let on = false;
  if (!d.connected) pill = "—";
  else if (d.infoLoading) pill = "…";
  else if (d.isHolder) { pill = "raised"; on = true; }
  else if (d.isSworn) { pill = "sworn"; on = true; }
  return (
    <div className="tb-strip">
      <span className="title">your banner</span>
      <span className={`tb-pill${on ? " on" : ""}`}>{pill}</span>
      <span className="fee">taker {bps(d.takerBps, 1)} · maker 0bps</span>
      <span className="addr">{d.connected ? shortAddr(d.address) : "not connected"}</span>
    </div>
  );
}

/* ---------- body switch ---------- */

function Body({ d, onEditSplit }: { d: BannerData; onEditSplit: () => void }) {
  if (!d.connected) return <ConnectCard />;
  if (!d.ready) return <ConnectCard signIn />;
  if (d.infoLoading && !d.info) return <Skeleton />;
  if (d.infoError && !d.info) return <ErrorState onRetry={d.refreshAll} />;
  if (d.isHolder) {
    return (
      <>
        <Hero d={d} />
        <SplitBar d={d} onEdit={onEditSplit} />
        {d.isSworn && <SwornStrip d={d} />}
        <Chart d={d} />
        <SwornTable d={d} />
        <Ledger d={d} />
      </>
    );
  }
  if (d.isSworn) return <SwornCard d={d} />;
  return <ClaimJoin d={d} />;
}

/* ---------- holder: hero ---------- */

function Hero({ d }: { d: BannerData }) {
  const [range, setRange] = useState<"all" | "30d">("all");
  const r = d.info!.referrer_info;
  const code = d.code!;
  const link = `${DESK_URL}/?ref=${code.code}`;
  const tweet = `i trade the throne desk under my own banner. join under it and pay less on every trade. ${SHARE_URL}`;
  const traders = range === "all" ? r.total_invites : r["30d_invites"];
  const volume = range === "all" ? r.total_referee_volume : r["30d_referee_volume"];
  const tribute = range === "all" ? r.total_referrer_rebate : r["30d_referrer_rebate"];

  return (
    <div className="tb-hero">
      <div className="left">
        {d.codes.length > 1 && (
          <div className="codes">
            {d.codes.map((c, i) => (
              <button
                key={c.code}
                className={`tb-mini code${i === d.codeIndex ? " on" : ""}`}
                onClick={() => d.setCodeIndex(i)}
              >
                {c.code}
              </button>
            ))}
          </div>
        )}
        <span className="bigcode">{code.code}</span>
        <div className="link">
          <span>trade.throne.network?ref={code.code}</span>
          <button className="tb-btn" onClick={() => copy(link, "link copied")}>copy</button>
          <a
            className="tb-btn"
            href={`https://x.com/intent/tweet?text=${encodeURIComponent(tweet)}`}
            target="_blank"
            rel="noreferrer"
          >
            share on x
          </a>
        </div>
        <span className="tweet">“{tweet}”</span>
      </div>
      <div className="stats">
        <div className="tb-stat">
          <span className="l">sworn traders</span>
          <span className="v">{traders ?? 0}</span>
          <span className="n">{r.total_traded ?? 0} have traded</span>
        </div>
        <div className="tb-stat">
          <span className="l">
            their volume
            <button className={`tb-mini${range === "all" ? " on" : ""}`} onClick={() => setRange("all")}>all</button>
            <button className={`tb-mini${range === "30d" ? " on" : ""}`} onClick={() => setRange("30d")}>30d</button>
          </span>
          <span className="v">{usd0(volume)}</span>
          <span className="n">fees paid {usd(range === "all" ? r.total_referee_fee : r["30d_referee_fee"])}</span>
        </div>
        <div className="tb-stat">
          <span className="l">tribute earned</span>
          <span className="v gold">{usd(tribute)}</span>
        </div>
        <div className="tb-stat">
          <span className="l">unpaid tribute</span>
          <span className="v">{usd(d.unpaid)}</span>
          <span className="n">settles daily 00:00 utc</span>
        </div>
      </div>
    </div>
  );
}

function SplitBar({ d, onEdit }: { d: BannerData; onEdit: () => void }) {
  const keep = Math.round(d.split.keep * 100);
  return (
    <div className="tb-split">
      <div className="bar">
        <span className="k" style={{ width: `${keep}%` }} />
        <span className="g" />
      </div>
      <span className="dim">
        you keep <span className="gold">{keep}%</span> · traders get <span className="green">{100 - keep}%</span> back
      </span>
      <button className="edit" onClick={onEdit}>edit split</button>
    </div>
  );
}

function SwornStrip({ d }: { d: BannerData }) {
  return (
    <div className="tb-split">
      <span className="dim">
        you also swore to <span className="gold code">{d.swornTo}</span> · saved so far{" "}
        <span className="green">{usd(d.referee?.total_referee_rebate)}</span>
      </span>
    </div>
  );
}

/* ---------- holder: chart ---------- */

function Chart({ d }: { d: BannerData }) {
  const max = Math.max(0, ...d.chart.map((c) => c.tribute));
  const vmax = Math.max(0, ...d.chart.map((c) => c.volume));
  const any = max > 0 || vmax > 0;
  const n = d.chart.length;
  const line = d.chart
    .map((c, i) => `${((i + 0.5) / n) * 100},${vmax ? 40 - (c.volume / vmax) * 34 - 3 : 40}`)
    .join(" ");
  const axis = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];
  const todayYmd = d.chart[n - 1]?.date;

  return (
    <div className="tb-section">
      <div className="head">
        <span className="h">tribute over time</span>
        <button className={`tb-tog${d.chartDays === 30 ? " on" : ""}`} onClick={() => d.setChartDays(30)}>30d</button>
        <button className={`tb-tog${d.chartDays === 90 ? " on" : ""}`} onClick={() => d.setChartDays(90)}>90d</button>
        <span className="tb-legend">
          <span className="gold">▮</span> tribute · <span className="green">—</span> sworn volume
        </span>
      </div>
      {!any ? (
        <div className="tb-empty-chart">
          <div>raise your banner. the first trade paints the first bar.</div>
        </div>
      ) : (
        <>
          <div className="tb-chart">
            {d.chart.map((c) => (
              <div
                key={c.date}
                className={`bar${c.date === todayYmd ? " today" : ""}`}
                style={{ height: `${max ? Math.max(1, (c.tribute / max) * 96) : 1}%`, opacity: c.tribute ? 1 : 0.15 }}
              >
                <div className="tip">
                  {dateFromYmd(c.date)} · vol {usd0(c.volume)} · tribute <span className="gold">{usd(c.tribute)}</span> · {c.traders} active
                </div>
              </div>
            ))}
            <svg viewBox="0 0 100 40" preserveAspectRatio="none">
              <polyline points={line} style={{ fill: "none", stroke: "#39F194", strokeWidth: 0.35, opacity: 0.8 }} />
            </svg>
          </div>
          <div className="tb-axis">
            {axis.map((i) => <span key={i}>{d.chart[i] ? dayMonth(d.chart[i].date) : ""}</span>)}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- holder: sworn traders table ---------- */

const SORTS: Record<string, [SwornSort, SwornSort]> = {
  sworn: ["descending_code_binding_time", "ascending_code_binding_time"],
  volume: ["descending_volume", "ascending_volume"],
  tribute: ["descending_referral_rebate", "ascending_referral_rebate"],
};

function SwornTable({ d }: { d: BannerData }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const r = d.info!.referrer_info;
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? d.sworn.filter((x) => x.address.toLowerCase().includes(s)) : d.sworn;
  }, [d.sworn, q]);
  const pages = Math.max(1, Math.ceil((d.swornTotal || 0) / PAGE_SIZE));

  const th = (key: keyof typeof SORTS, label: string, right = false) => {
    const [desc, asc] = SORTS[key];
    const on = d.sort === desc || d.sort === asc;
    const arrow = !on ? "↕" : d.sort === desc ? "▾" : "▴";
    return (
      <button
        className={on ? "on" : ""}
        style={{ textAlign: right ? "right" : "left" }}
        onClick={() => { d.setSort(d.sort === desc ? asc : desc); d.setPage(1); }}
      >
        {label} {arrow}
      </button>
    );
  };

  return (
    <div className="tb-section" style={{ paddingBottom: 6 }}>
      <div className="head" style={{ alignItems: "center" }}>
        <span className="h">sworn traders</span>
        <div className="tb-search">
          <input placeholder="search address…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="tb-pager">
          <span>{PAGE_SIZE} per page · {d.page} of {pages}</span>
          <button disabled={d.page <= 1} onClick={() => d.setPage(d.page - 1)}>‹ prev</button>
          <button disabled={d.page >= pages} onClick={() => d.setPage(d.page + 1)}>next ›</button>
        </div>
      </div>
      <div className="tb-table">
        <div className="tb-tr th">
          <span>trader</span>
          {th("sworn", "sworn on")}
          {th("volume", "volume", true)}
          <span className="right">fees paid</span>
          {th("tribute", "tribute to you", true)}
          <span className="right">their discount</span>
          <span />
        </div>
        {d.rowsLoading && rows.length === 0 ? (
          <div className="tb-none">asking the desk…</div>
        ) : rows.length === 0 ? (
          <div className="tb-none">
            {q ? "no sworn trader matches that address on this page." : "no traders under the banner yet. share the link."}
          </div>
        ) : (
          rows.map((x) => (
            <div className="tb-tr" key={x.address + x.swornAt}>
              <span className="c-addr">
                {shortAddr(x.address)}
                <span className="copy" title="copy address" onClick={() => copy(x.address, "address copied")}>⧉</span>
                {!x.traded && <span className="mute" style={{ fontSize: 9, marginLeft: 6 }}>no trades yet</span>}
              </span>
              <span className="c-sworn dim"><span className="lbl">sworn</span>{dateTimeUtc(x.swornAt)}</span>
              <span className="c-vol right"><span className="lbl">vol</span>{usd0(x.volume)}</span>
              <span className="c-fee right dim"><span className="lbl">fees</span>{usd(x.fee)}</span>
              <span className="c-trib right gold"><span className="lbl">tribute</span>{usd(x.tribute)}</span>
              <span className="c-disc right mute"><span className="lbl">discount</span>{usd(x.discount)}</span>
              <button className="hover-link c-link" onClick={() => navigate("/leaderboard")}>view on leaderboard</button>
            </div>
          ))
        )}
        {d.sworn.length > 0 && (
          <div className="tb-tr sum">
            <span className="mute">{r.total_invites} traders</span>
            <span />
            <span className="right" style={{ fontWeight: 700 }}>{usd0(r.total_referee_volume)}</span>
            <span className="right dim">{usd(r.total_referee_fee)}</span>
            <span className="right gold" style={{ fontWeight: 700 }}>{usd(r.total_referrer_rebate)}</span>
            <span className="right dim">
              {usd(d.split.keep > 0 ? r.total_referrer_rebate * (d.split.give / d.split.keep) : 0)}
            </span>
            <span />
          </div>
        )}
      </div>
      <div className="mute" style={{ fontSize: 9.5, padding: "8px 10px 0", textTransform: "none" }}>
        their discount is an estimate from the banner's split. all-time totals in the sum row are the desk's own numbers.
      </div>
    </div>
  );
}

/* ---------- holder: ledger ---------- */

function Ledger({ d }: { d: BannerData }) {
  const [open, setOpen] = useState(false);
  const last = d.ledger.find((l) => l.settled);
  return (
    <div className="tb-section" style={{ paddingTop: 12, borderBottom: 0 }}>
      <div className="tb-ledger-head" onClick={() => setOpen((o) => !o)}>
        <span className="h">payout ledger</span>
        <span className="hint">
          {open ? "▾ collapse" : `▸ expand${last ? ` · last settlement ${dateFromYmd(last.date)} 00:00 utc` : ""}`}
        </span>
      </div>
      {open && (
        <div className="tb-table">
          <div className="tb-tr th ledger">
            <span>date</span>
            <span className="right">sworn volume</span>
            <span className="right">traders</span>
            <span className="right">tribute</span>
            <span className="right">status</span>
          </div>
          {d.summaryLoading && d.ledger.length === 0 ? (
            <div className="tb-none">asking the desk…</div>
          ) : d.ledger.length === 0 ? (
            <div className="tb-none">nothing settled yet.</div>
          ) : (
            d.ledger.map((l) => (
              <div className="tb-tr ledger" key={l.date}>
                <span className="c-date dim">{dateFromYmd(l.date)}</span>
                <span className="c-lvol right">{usd0(l.volume)}</span>
                <span className="c-ltr right dim">{l.traders}</span>
                <span className="c-ltrib right gold">{usd(l.tribute)}</span>
                <span className={`c-lst right ${l.settled ? "green" : "dim"}`}>{l.settled ? "settled" : "pending"}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- sworn-only ---------- */

function SwornCard({ d }: { d: BannerData }) {
  const actuals = d.refereeDaily.reduce(
    (a, x) => ({ rebate: a.rebate + (x.referee_rebate ?? 0), fee: a.fee + (x.fee ?? 0) }),
    { rebate: 0, fee: 0 },
  );
  const frac = refereeDiscountFraction(d.takerBps, d.referee?.referee_rebate_rate, actuals);
  return (
    <div className="tb-center">
      <div className="tb-card wide">
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span className="h">you swore to <span className="mono gold code">{d.swornTo}</span></span>
        </div>
        <div className="tb-grid3">
          <div className="tb-stat">
            <span className="l">your fee discount</span>
            <span className="v green">~{pct(frac)} of taker fees</span>
          </div>
          <div className="tb-stat">
            <span className="l">saved so far</span>
            <span className="v">{usd(d.referee?.total_referee_rebate)}</span>
            <span className="n">30d {usd(d.referee?.["30d_referee_rebate"])}</span>
          </div>
          <div className="tb-stat">
            <span className="l">effective taker fee</span>
            <span className="v">{bps(d.takerBps * (1 - frac))}</span>
            <span className="n">desk rate {bps(d.takerBps, 1)}</span>
          </div>
        </div>
        <span className="small">
          binding is permanent on the desk. to change banners, ask the desk. want a banner of your own?{" "}
          <a href={X_URL} target="_blank" rel="noreferrer">dm @thronedefi</a>.
        </span>
      </div>
    </div>
  );
}

/* ---------- claim / join ---------- */

function ClaimJoin({ d }: { d: BannerData }) {
  return (
    <div className="tb-center">
      <RaiseCard d={d} />
      <SwearCard d={d} />
    </div>
  );
}

function RaiseCard({ d }: { d: BannerData }) {
  const navigate = useNavigate();
  const a = d.autoRaise;
  const auto = a && typeof a.required_volume === "number" && a.required_volume > 0;
  const done = auto ? Math.min(1, (a!.completed_volume ?? 0) / a!.required_volume!) : 0;
  return (
    <div className="tb-card">
      <span className="h">raise a banner</span>
      <span className="p">raise your banner. traders who swear to it pay less. you earn on every trade they take.</span>
      {auto ? (
        <>
          <div className="tb-field">
            <span className="l">your banner unlocks at {usd0(a!.required_volume)} of your own volume</span>
            <div className="tb-progress"><span style={{ width: `${done * 100}%` }} /></div>
            <span className="l">{usd0(a!.completed_volume)} traded · {pct(done)}</span>
          </div>
          {a!.auto_referral_code && (
            <div className="tb-info">
              <div><span>reserved code</span><span className="gold code">{a!.auto_referral_code}</span></div>
            </div>
          )}
          <button className="tb-cta" onClick={() => navigate("/")}>trade to raise it</button>
        </>
      ) : (
        <>
          <div className="tb-info">
            <div><span>default split</span><span>you keep <span className="gold">60%</span> · traders get <span className="green">40%</span> back</span></div>
            <div><span>you earn per $100k sworn volume</span><span className="gold">{usd(holderPer100k(0.6))}</span></div>
            <div><span>a trader saves per $100k of theirs</span><span className="green">{usd(traderPer100k(0.4))}</span></div>
          </div>
          <a className="tb-cta" href={X_URL} target="_blank" rel="noreferrer" style={{ display: "block" }}>
            ask the desk for a banner
          </a>
          <span className="small">
            banners are granted by the desk. dm @thronedefi with your handle and how you'd share it. once raised, it shows here with your link.
          </span>
        </>
      )}
      <span className="small">
        tribute is a share of the desk's fee revenue on your traders' taker volume. paid daily. terms apply. (small print: this is the
        desk's referral program, run on orderly.)
      </span>
    </div>
  );
}

function SwearCard({ d }: { d: BannerData }) {
  const [raw, setRaw] = useState("");
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, REFERRAL_CODE_MAX_LENGTH);
  const lengthOk = code.length >= REFERRAL_CODE_MIN_LENGTH;
  const { isExist, isLoading } = useCheckReferralCode(lengthOk ? code : undefined);

  // prefill from ?ref= (Orderly also stores it and binds at account creation)
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref") || localStorage.getItem("referral_code");
    if (ref) setRaw(ref);
  }, []);

  const status = !code ? "" : !lengthOk ? `${REFERRAL_CODE_MIN_LENGTH}-${REFERRAL_CODE_MAX_LENGTH} chars`
    : isLoading ? "checking…" : isExist ? "✓ banner found" : "no such banner";
  const statusClass = isExist ? "green" : lengthOk && !isLoading && isExist === false ? "red" : "mute";

  const swear = async () => {
    if (!isExist) return;
    try {
      await d.bindCode({ referral_code: code });
      toast.success(`sworn to ${code}`);
      localStorage.removeItem("referral_code");
      await d.refreshAll();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <div className="tb-card" style={{ borderLeft: 0 }}>
      <span className="h">swear to a banner</span>
      <span className="p">join under someone's banner and pay less on every trade you take.</span>
      <div className="tb-field">
        <span className="l">banner code</span>
        <div className="box">
          <input value={code} onChange={(e) => setRaw(e.target.value)} placeholder="KINGMAKER" spellCheck={false} />
          <span className={`st ${statusClass}`}>{status}</span>
        </div>
      </div>
      <div className="tb-info">
        <div><span>default discount</span><span className="green">~{pct(discountFraction(d.takerBps, 0.4))} of taker fees back</span></div>
        <div><span>effective taker fee</span><span>{bps(effectiveTakerBps(d.takerBps, 0.4))} (from {bps(d.takerBps, 1)})</span></div>
        <div><span>exact split</span><span className="dim">shown after you swear; each banner sets its own</span></div>
      </div>
      <button className="tb-cta green" disabled={!isExist || d.bindMutating} onClick={swear}>
        {d.bindMutating ? "swearing…" : "swear to it"}
      </button>
      <span className="small">binding is permanent on the desk. to change banners, ask the desk.</span>
    </div>
  );
}

/* ---------- split modal ---------- */

function SplitModal({ d, onClose }: { d: BannerData; onClose: () => void }) {
  const code = d.code!;
  const [keep, setKeep] = useState(Math.round(d.split.keep * 100));
  const give = 100 - keep;
  // keep the code's total rebate unchanged; only move the line between holder and trader
  const total = code.referrer_rebate_rate + code.referee_rebate_rate || code.max_rebate_rate || 1;

  const confirm = async () => {
    try {
      await d.editSplit({
        referral_code: code.code,
        referrer_rebate_rate: +(total * (keep / 100)).toFixed(6),
        referee_rebate_rate: +(total * (give / 100)).toFixed(6),
      });
      toast.success("split updated");
      await d.refreshAll();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <div className="tb-overlay" onClick={onClose}>
      <div className="tb-modal" onClick={(e) => e.stopPropagation()}>
        <span className="h">edit split · <span className="mono gold code">{code.code}</span></span>
        <div className="row">
          <button className="tb-btn" onClick={() => setKeep((k) => Math.max(0, k - 5))}>−5%</button>
          <div className="tb-slider">
            <div className="track" />
            <div className="fill" style={{ width: `${keep}%` }} />
            <div className="knob" style={{ left: `${keep}%` }} />
          </div>
          <button className="tb-btn" onClick={() => setKeep((k) => Math.min(100, k + 5))}>+5%</button>
        </div>
        <div className="between">
          <span>you keep <span className="gold">{keep}%</span></span>
          <span>traders get <span className="green">{give}%</span> back</span>
        </div>
        <div className="tb-info">
          <div><span>you earn per $100k sworn volume</span><span className="gold">{usd(holderPer100k(keep / 100))}</span></div>
          <div><span>a trader saves per $100k of their volume</span><span className="green">{usd(traderPer100k(give / 100))}</span></div>
          <div><span>their effective taker fee</span><span>{bps(effectiveTakerBps(d.takerBps, give / 100))}</span></div>
        </div>
        <span className="small mute" style={{ fontSize: 9.5, lineHeight: 1.6 }}>
          changing the split applies to future trades only. settled tribute is untouched.
        </span>
        <button className="tb-cta" disabled={d.splitMutating} onClick={confirm}>
          {d.splitMutating ? "saving…" : "confirm split"}
        </button>
      </div>
    </div>
  );
}

/* ---------- connect / loading / error ---------- */

function ConnectCard({ signIn }: { signIn?: boolean }) {
  return (
    <div className="tb-center">
      <div className="tb-card wide">
        <span className="h">{signIn ? "sign in to see your banner" : "connect to see your banner"}</span>
        <span className="p">
          {signIn
            ? "your wallet is connected. finish signing in from the top right so the desk can show your banner and your sworn traders."
            : "connect your wallet from the top right. holders see their sworn traders and tribute; sworn traders see their discount."}
        </span>
        <div className="tb-info">
          <div><span>a banner</span><span>your code. traders who swear to it pay less; you earn on every trade they take.</span></div>
          <div><span>tribute</span><span className="gold">settles daily at 00:00 utc, to your desk balance</span></div>
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="tb-skel">
      <div className="row">
        <div className="b" style={{ width: 220, height: 52 }} />
        <div className="g4">
          {[0, 1, 2, 3].map((i) => <div className="b" key={i} style={{ height: 44 }} />)}
        </div>
      </div>
      <div className="b" style={{ height: 150 }} />
      {[0, 1, 2, 3].map((i) => <div className="b" key={i} style={{ height: 22, opacity: 1 - i * 0.2 }} />)}
      <span className="note">asking the desk…</span>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="tb-error">
      <span className="msg">the desk didn't answer. try again.</span>
      <button className="tb-btn" style={{ padding: "8px 20px", fontSize: 11 }} onClick={onRetry}>retry</button>
    </div>
  );
}
