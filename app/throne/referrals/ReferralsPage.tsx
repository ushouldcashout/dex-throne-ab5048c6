/**
 * THRONE Referrals page (trade.throne.network/referrals).
 *
 * Replaces Orderly's stock Affiliates page. Structure and vocabulary follow the standard
 * perp-DEX referrals page traders already know (Referrals · Traders Referred · Rewards Earned ·
 * Enter Code · Create Code · Address / Date Joined / Total Volume / Fees Paid / Your Rewards).
 * The skin is THRONE's. One extra over the standard page: a Rewards History tab with a daily
 * rewards chart and ledger.
 *
 * Data: Orderly referral API via @orderly.network/hooks (see useReferralData.ts). Rewards settle
 * daily to the desk balance, so there is no "claim" step.
 *
 * See docs/THRONE_CHANGES.md.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "@orderly.network/ui";
import {
  useCheckReferralCode,
  REFERRAL_CODE_MAX_LENGTH,
  REFERRAL_CODE_MIN_LENGTH,
} from "@orderly.network/hooks";
import { useReferralData, PAGE_SIZE, type ReferralData, type ReferralSort } from "./useReferralData";
import {
  discountFraction,
  effectiveTakerBps,
  referrerPer100k,
  refereeDiscountFraction,
  traderPer100k,
} from "./economics";
import { bps, dateFromYmd, dateTimeUtc, dayMonth, pct, shortAddr, usd, usd0 } from "./format";
import "./referrals.css";

const DESK_URL = "https://trade.throne.network";
// Public share copy links to throne.network while the desk is gated. After the Sep 25 open this
// can become the ?ref= desk link.
const SHARE_URL = "https://throne.network";
const X_URL = "https://x.com/thronedefi";

function copy(text: string, what = "Copied") {
  navigator.clipboard?.writeText(text).then(
    () => toast.success(what),
    () => toast.error("Couldn't copy"),
  );
}

type Modal = null | "enter" | "create" | "split";

export default function ReferralsPage() {
  const d = useReferralData();
  const [modal, setModal] = useState<Modal>(null);
  const [tab, setTab] = useState<"referrals" | "history">("referrals");
  const r = d.info?.referrer_info;

  return (
    <div className="rf">
      <div className="rf-head">
        <div>
          <h1>Referrals</h1>
          <div className="sub">
            Refer traders to the desk and earn a share of their fees. Paid daily.
            <a href={X_URL} target="_blank" rel="noreferrer">Learn more</a>
          </div>
        </div>
        <div className="rf-actions">
          {d.isReferred ? (
            <span className="rf-btn ghost" title="You joined with this code">
              Referred by <span className="code gold">{d.referredBy}</span>
            </span>
          ) : (
            <button className="rf-btn" disabled={!d.ready} onClick={() => setModal("enter")}>Enter Code</button>
          )}
          {d.hasCode ? (
            <button className="rf-btn solid" onClick={() => copy(`${DESK_URL}/?ref=${d.code!.code}`, "Referral link copied")}>
              Copy Referral Link
            </button>
          ) : (
            <button className="rf-btn solid" disabled={!d.ready} onClick={() => setModal("create")}>Create Code</button>
          )}
        </div>
      </div>

      <div className="rf-cards">
        <Card
          label="Traders Referred"
          value={d.ready ? String(r?.total_invites ?? 0) : "—"}
          note={d.ready && r ? `${r.total_traded ?? 0} have traded · ${r["30d_invites"] ?? 0} joined in 30d` : undefined}
          loading={d.infoLoading}
        />
        <Card
          label="Rewards Earned"
          value={d.ready ? usd(r?.total_referrer_rebate ?? 0) : "—"}
          note={d.ready && r ? `${usd(r["30d_referrer_rebate"] ?? 0)} in the last 30d` : undefined}
          gold
          loading={d.infoLoading}
        />
        <Card
          label="Pending Rewards"
          value={d.ready ? usd(d.pending) : "—"}
          note="Settles daily at 00:00 UTC to your desk balance"
          loading={d.infoLoading}
        />
      </div>

      {d.ready && d.hasCode && <CodeStrip d={d} onEditSplit={() => setModal("split")} />}
      {d.ready && !d.hasCode && d.isReferred && <ReferredStrip d={d} />}

      <div className="rf-panel">
        <div className="rf-tabs">
          <button className={`rf-tab${tab === "referrals" ? " on" : ""}`} onClick={() => setTab("referrals")}>Referrals</button>
          <button className={`rf-tab${tab === "history" ? " on" : ""}`} onClick={() => setTab("history")}>Rewards History</button>
        </div>
        {tab === "referrals" ? <ReferralsTable d={d} /> : <HistoryTab d={d} />}
      </div>

      {modal === "enter" && <EnterCodeModal d={d} onClose={() => setModal(null)} />}
      {modal === "create" && <CreateCodeModal d={d} onClose={() => setModal(null)} />}
      {modal === "split" && d.code && <SplitModal d={d} onClose={() => setModal(null)} />}
    </div>
  );
}

/* ---------- cards ---------- */

function Card({ label, value, note, gold, loading }: { label: string; value: string; note?: string; gold?: boolean; loading?: boolean }) {
  return (
    <div className="rf-card">
      <div className="l">{label}</div>
      <div className={`v${gold ? " gold" : ""}`}>{loading ? <span className="rf-skel" /> : value}</div>
      {note && <div className="n">{note}</div>}
    </div>
  );
}

/* ---------- strips ---------- */

function CodeStrip({ d, onEditSplit }: { d: ReferralData; onEditSplit: () => void }) {
  const code = d.code!;
  const link = `${DESK_URL}/?ref=${code.code}`;
  const keep = Math.round(d.split.keep * 100);
  const tweet = `I trade stocks and crypto perps on the THRONE desk. Join with my referral code ${code.code} and pay less on every trade. ${SHARE_URL}`;
  return (
    <div className="rf-strip">
      <span className="k">Your code</span>
      {d.codes.length > 1 ? (
        d.codes.map((c, i) => (
          <button key={c.code} className={`rf-chip${i === d.codeIndex ? " on" : ""}`} onClick={() => d.setCodeIndex(i)}>{c.code}</button>
        ))
      ) : (
        <span className="bigcode">{code.code}</span>
      )}
      <button className="rf-btn ghost sm" onClick={() => copy(code.code, "Code copied")}>Copy</button>
      <span className="sep" />
      <span className="link">{link.replace("https://", "")}</span>
      <button className="rf-btn ghost sm" onClick={() => copy(link, "Referral link copied")}>Copy link</button>
      <a className="rf-btn ghost sm" href={`https://x.com/intent/tweet?text=${encodeURIComponent(tweet)}`} target="_blank" rel="noreferrer">Share on X</a>
      <span className="grow" />
      <span className="split">
        You earn <span className="gold">{keep}%</span> · your traders get <span className="green">{100 - keep}%</span> as a fee discount
      </span>
      <button className="edit" onClick={onEditSplit}>Edit split</button>
    </div>
  );
}

function ReferredStrip({ d }: { d: ReferralData }) {
  const actuals = d.refereeDaily.reduce(
    (a, x) => ({ rebate: a.rebate + (x.referee_rebate ?? 0), fee: a.fee + (x.fee ?? 0) }),
    { rebate: 0, fee: 0 },
  );
  const frac = refereeDiscountFraction(d.takerBps, d.referee?.referee_rebate_rate, actuals);
  return (
    <div className="rf-strip">
      <span className="k">Referred by</span>
      <span className="bigcode">{d.referredBy}</span>
      <span className="sep" />
      <span className="split">
        Your fee discount <span className="green">~{pct(frac)}</span> · effective taker fee{" "}
        <span className="mono">{bps(d.takerBps * (1 - frac))}</span> (desk rate {bps(d.takerBps, 1)})
      </span>
      <span className="grow" />
      <span className="split">Saved so far <span className="green">{usd(d.referee?.total_referee_rebate)}</span></span>
    </div>
  );
}

/* ---------- referrals table ---------- */

const SORTS: Record<string, [ReferralSort, ReferralSort]> = {
  joined: ["descending_code_binding_time", "ascending_code_binding_time"],
  volume: ["descending_volume", "ascending_volume"],
  rewards: ["descending_referral_rebate", "ascending_referral_rebate"],
};

function ReferralsTable({ d }: { d: ReferralData }) {
  const [q, setQ] = useState("");
  const r = d.info?.referrer_info;
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? d.referrals.filter((x) => x.address.toLowerCase().includes(s)) : d.referrals;
  }, [d.referrals, q]);
  const total = d.referralsTotal || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total ? (d.page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, d.page * PAGE_SIZE);

  const th = (key: keyof typeof SORTS, label: string, right = false) => {
    const [desc, asc] = SORTS[key];
    const on = d.sort === desc || d.sort === asc;
    return (
      <button
        className={on ? "on" : ""}
        style={{ justifyContent: right ? "flex-end" : "flex-start", width: "100%" }}
        onClick={() => { d.setSort(d.sort === desc ? asc : desc); d.setPage(1); }}
      >
        {label} <span className="arr">{!on ? "" : d.sort === desc ? "▼" : "▲"}</span>
      </button>
    );
  };

  let body: ReactNode;
  if (!d.connected) {
    body = <div className="rf-empty">Connect your wallet to see your referrals.</div>;
  } else if (!d.ready) {
    body = <div className="rf-empty">Sign in from the top right to see your referrals.</div>;
  } else if (d.infoLoading || (d.rowsLoading && rows.length === 0 && d.hasCode)) {
    body = <div className="rf-empty dim">Loading…</div>;
  } else if (!d.hasCode) {
    body = (
      <div className="rf-empty">
        No referrals yet
        <div className="hint">Create a code, share your link, and traders who join with it appear here.</div>
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <div className="rf-empty">
        {q ? "No referral matches that address on this page." : "No referrals yet"}
        {!q && <div className="hint">Share your link. Traders who join with your code appear here.</div>}
      </div>
    );
  } else {
    body = (
      <>
        {rows.map((x) => (
          <div className="rf-tr" key={x.address + x.joinedAt}>
            <span className="c1">
              {shortAddr(x.address)}
              <span className="copy" title="Copy address" onClick={() => copy(x.address, "Address copied")}>⧉</span>
              {!x.traded && <span className="tag">no trades yet</span>}
            </span>
            <span className="c2 dim"><span className="lbl">Joined</span>{dateTimeUtc(x.joinedAt)}</span>
            <span className="c3 right"><span className="lbl">Volume</span>{usd0(x.volume)}</span>
            <span className="c4 right dim"><span className="lbl">Fees</span>{usd(x.fee)}</span>
            <span className="c5 right gold"><span className="lbl">Rewards</span>{usd(x.rewards)}</span>
          </div>
        ))}
        {r && (
          <div className="rf-tr sum">
            <span className="dim">{r.total_invites} traders</span>
            <span />
            <span className="right">{usd0(r.total_referee_volume)}</span>
            <span className="right dim">{usd(r.total_referee_fee)}</span>
            <span className="right gold">{usd(r.total_referrer_rebate)}</span>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="rf-table">
      {d.hasCode && (
        <div className="rf-tabs" style={{ borderBottom: 0, padding: "6px 12px 0" }}>
          <div className="tools" style={{ marginLeft: 0 }}>
            <div className="rf-search"><span>⌕</span><input placeholder="Search address" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
        </div>
      )}
      <div className="rf-tr th">
        <span>Address</span>
        {th("joined", "Date Joined")}
        {th("volume", "Total Volume", true)}
        <span className="right">Fees Paid</span>
        {th("rewards", "Your Rewards", true)}
      </div>
      {body}
      <div className="rf-foot">
        <span>{from}-{to} of {total}</span>
        <button disabled={d.page <= 1} onClick={() => d.setPage(d.page - 1)}>‹</button>
        <button disabled={d.page >= pages} onClick={() => d.setPage(d.page + 1)}>›</button>
      </div>
    </div>
  );
}

/* ---------- rewards history (chart + ledger) ---------- */

function HistoryTab({ d }: { d: ReferralData }) {
  const max = Math.max(0, ...d.chart.map((c) => c.rewards));
  const vmax = Math.max(0, ...d.chart.map((c) => c.volume));
  const any = max > 0 || vmax > 0;
  const n = d.chart.length;
  const line = d.chart
    .map((c, i) => `${((i + 0.5) / n) * 100},${vmax ? 40 - (c.volume / vmax) * 34 - 3 : 40}`)
    .join(" ");
  const axis = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];
  const todayYmd = d.chart[n - 1]?.date;

  return (
    <div className="rf-table">
      <div className="rf-chart-wrap">
        <div className="rf-chart-head">
          <span>Daily rewards</span>
          <button className={`tog${d.chartDays === 30 ? " on" : ""}`} onClick={() => d.setChartDays(30)}>30D</button>
          <button className={`tog${d.chartDays === 90 ? " on" : ""}`} onClick={() => d.setChartDays(90)}>90D</button>
          <span className="legend"><span className="gold">▮</span> rewards · <span className="green">—</span> referred volume</span>
        </div>
        {!d.ready || !any ? (
          <div className="rf-chart-empty"><div>{d.ready ? "No rewards yet. The first referred trade paints the first bar." : "Connect your wallet to see rewards."}</div></div>
        ) : (
          <>
            <div className="rf-chart">
              {d.chart.map((c) => (
                <div
                  key={c.date}
                  className={`bar${c.date === todayYmd ? " today" : ""}`}
                  style={{ height: `${max ? Math.max(1, (c.rewards / max) * 96) : 1}%`, opacity: c.rewards ? 1 : 0.15 }}
                >
                  <div className="tip">{dateFromYmd(c.date)} · volume {usd0(c.volume)} · rewards <span className="gold">{usd(c.rewards)}</span> · {c.traders} traders</div>
                </div>
              ))}
              <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                <polyline points={line} style={{ fill: "none", stroke: "#39F194", strokeWidth: 0.35, opacity: 0.8 }} />
              </svg>
            </div>
            <div className="rf-axis">{axis.map((i) => <span key={i}>{d.chart[i] ? dayMonth(d.chart[i].date) : ""}</span>)}</div>
          </>
        )}
      </div>
      <div className="rf-tr th hist">
        <span>Date</span>
        <span className="right">Referred Volume</span>
        <span className="right">Active Traders</span>
        <span className="right">Rewards</span>
        <span className="right">Status</span>
      </div>
      {!d.ready ? (
        <div className="rf-empty">Connect your wallet to see your rewards history.</div>
      ) : d.summaryLoading && d.history.length === 0 ? (
        <div className="rf-empty dim">Loading…</div>
      ) : d.history.length === 0 ? (
        <div className="rf-empty">No rewards yet</div>
      ) : (
        d.history.map((l) => (
          <div className="rf-tr hist" key={l.date}>
            <span className="c1 dim">{dateFromYmd(l.date)}</span>
            <span className="c2 right"><span className="lbl">Volume</span>{usd0(l.volume)}</span>
            <span className="c3 right dim"><span className="lbl">Traders</span>{l.traders}</span>
            <span className="c4 right gold"><span className="lbl">Rewards</span>{usd(l.rewards)}</span>
            <span className={`c5 right ${l.settled ? "green" : "dim"}`}>{l.settled ? "Paid" : "Pending"}</span>
          </div>
        ))
      )}
      <div className="rf-note">Rewards are paid to your desk balance every day at 00:00 UTC. No claim needed.</div>
    </div>
  );
}

/* ---------- modals ---------- */

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="rf-overlay" onClick={onClose}>
      <div className="rf-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function EnterCodeModal({ d, onClose }: { d: ReferralData; onClose: () => void }) {
  const [raw, setRaw] = useState("");
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, REFERRAL_CODE_MAX_LENGTH);
  const lengthOk = code.length >= REFERRAL_CODE_MIN_LENGTH;
  const { isExist, isLoading } = useCheckReferralCode(lengthOk ? code : undefined);

  // prefill from ?ref= (Orderly also stores it and binds at account creation)
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref") || localStorage.getItem("referral_code");
    if (ref) setRaw(ref);
  }, []);

  const status = !code ? "" : !lengthOk ? `${REFERRAL_CODE_MIN_LENGTH}–${REFERRAL_CODE_MAX_LENGTH} characters`
    : isLoading ? "Checking…" : isExist ? "✓ Valid code" : "Code not found";
  const cls = isExist ? "green" : lengthOk && !isLoading && isExist === false ? "red" : "mute";

  const submit = async () => {
    if (!isExist) return;
    try {
      await d.bindCode({ referral_code: code });
      toast.success(`Code ${code} applied`);
      localStorage.removeItem("referral_code");
      await d.refreshAll();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <ModalShell title="Enter Referral Code" onClose={onClose}>
      <div className="p">Enter a code from another trader to get a discount on your trading fees.</div>
      <div className="rf-field">
        <label>Referral code</label>
        <div className="box">
          <input value={code} onChange={(e) => setRaw(e.target.value)} placeholder="CODE" spellCheck={false} autoFocus />
          <span className={`st ${cls}`}>{status}</span>
        </div>
      </div>
      <div className="rf-kv">
        <div><span>Default fee discount</span><span className="green">~{pct(discountFraction(d.takerBps, 0.4))} of taker fees</span></div>
        <div><span>Effective taker fee</span><span>{bps(effectiveTakerBps(d.takerBps, 0.4))} (from {bps(d.takerBps, 1)})</span></div>
      </div>
      <div className="small">Each code sets its own split, so the exact discount shows after you enter it. A code can only be set once per account.</div>
      <div className="actions">
        <button className="rf-btn ghost" onClick={onClose}>Cancel</button>
        <button className="rf-btn solid" disabled={!isExist || d.bindMutating} onClick={submit}>{d.bindMutating ? "Applying…" : "Enter Code"}</button>
      </div>
    </ModalShell>
  );
}

function CreateCodeModal({ d, onClose }: { d: ReferralData; onClose: () => void }) {
  const a = d.autoCode;
  const auto = a && typeof a.required_volume === "number" && a.required_volume > 0;
  const done = auto ? Math.min(1, (a!.completed_volume ?? 0) / a!.required_volume!) : 0;
  return (
    <ModalShell title="Create Referral Code" onClose={onClose}>
      {auto ? (
        <>
          <div className="p">Your referral code unlocks after {usd0(a!.required_volume)} of trading volume on the desk.</div>
          <div className="rf-progress"><span style={{ width: `${done * 100}%` }} /></div>
          <div className="rf-kv">
            <div><span>Your volume</span><span>{usd0(a!.completed_volume)} · {pct(done)}</span></div>
            {a!.auto_referral_code && <div><span>Reserved code</span><span className="gold">{a!.auto_referral_code}</span></div>}
          </div>
        </>
      ) : (
        <>
          <div className="p">
            Referral codes are issued by the desk while the program is new. Message @thronedefi with your handle and how you plan to
            share it, and your code appears here once created.
          </div>
          <div className="rf-kv">
            <div><span>Default split</span><span>You earn <span className="gold">60%</span> · traders get <span className="green">40%</span> off</span></div>
            <div><span>You earn per $100k referred volume</span><span className="gold">{usd(referrerPer100k(0.6))}</span></div>
            <div><span>A trader saves per $100k of their volume</span><span className="green">{usd(traderPer100k(0.4))}</span></div>
          </div>
          <div className="small">Rewards are a share of the desk's fee revenue on your referred traders' taker volume, paid daily to your balance. No cap, no expiry.</div>
        </>
      )}
      <div className="actions">
        <button className="rf-btn ghost" onClick={onClose}>Close</button>
        {auto ? (
          <a className="rf-btn solid" href="/" style={{ textDecoration: "none" }}>Trade</a>
        ) : (
          <a className="rf-btn solid" href={X_URL} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Request a Code</a>
        )}
      </div>
    </ModalShell>
  );
}

function SplitModal({ d, onClose }: { d: ReferralData; onClose: () => void }) {
  const code = d.code!;
  const [keep, setKeep] = useState(Math.round(d.split.keep * 100));
  const give = 100 - keep;
  // keep the code's total rebate unchanged; only move the line between you and your traders
  const total = code.referrer_rebate_rate + code.referee_rebate_rate || code.max_rebate_rate || 1;

  const confirm = async () => {
    try {
      await d.editSplit({
        referral_code: code.code,
        referrer_rebate_rate: +(total * (keep / 100)).toFixed(6),
        referee_rebate_rate: +(total * (give / 100)).toFixed(6),
      });
      toast.success("Split updated");
      await d.refreshAll();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <ModalShell title={`Edit Split · ${code.code}`} onClose={onClose}>
      <div className="p">Choose how the referral reward is shared between you and the traders who use your code.</div>
      <div className="row">
        <button className="rf-btn ghost sm" onClick={() => setKeep((k) => Math.max(0, k - 5))}>−5%</button>
        <div className="rf-slider">
          <div className="track" /><div className="fill" style={{ width: `${keep}%` }} /><div className="knob" style={{ left: `${keep}%` }} />
        </div>
        <button className="rf-btn ghost sm" onClick={() => setKeep((k) => Math.min(100, k + 5))}>+5%</button>
      </div>
      <div className="rf-kv">
        <div><span>You earn</span><span className="gold">{keep}%</span></div>
        <div><span>Your traders get</span><span className="green">{give}% as a fee discount</span></div>
        <div><span>You earn per $100k referred volume</span><span className="gold">{usd(referrerPer100k(keep / 100))}</span></div>
        <div><span>A trader saves per $100k of their volume</span><span className="green">{usd(traderPer100k(give / 100))}</span></div>
        <div><span>Their effective taker fee</span><span>{bps(effectiveTakerBps(d.takerBps, give / 100))}</span></div>
      </div>
      <div className="small">Applies to future trades only. Rewards already paid are unchanged.</div>
      <div className="actions">
        <button className="rf-btn ghost" onClick={onClose}>Cancel</button>
        <button className="rf-btn solid" disabled={d.splitMutating} onClick={confirm}>{d.splitMutating ? "Saving…" : "Confirm"}</button>
      </div>
    </ModalShell>
  );
}
