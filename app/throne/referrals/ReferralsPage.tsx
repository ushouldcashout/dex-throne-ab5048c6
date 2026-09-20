/**
 * THRONE Referrals page (trade.throne.network/referrals).
 *
 * Replaces Orderly's stock Affiliates page. Structure and vocabulary follow the standard
 * perp-DEX referrals page traders already know (Referrals · Traders Referred · Rewards Earned ·
 * Create Code · Enter Code · Address / Date Joined / Total Volume / Fees Paid / Your Rewards).
 * The skin is THRONE's. One extra over the standard page: a Rewards History tab with a daily
 * rewards chart and ledger.
 *
 * Flows
 *  - Create Code (primary): self-serve. Any signed-in account past the volume prerequisite
 *    (0 USDC on THRONE) picks a code name and claims it. Rename allowed until someone binds.
 *  - Enter Code (secondary): only for accounts that have not traded yet, since Orderly binds a
 *    referral at sign-up and a bound code is permanent.
 *  - No "Claim Rewards": Orderly pays rebates to the desk balance daily.
 *
 * Data: see useReferralData.ts. Notes in docs/THRONE_CHANGES.md.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "@orderly.network/ui";
import {
  useCheckReferralCode,
  REFERRAL_CODE_MAX_LENGTH,
  REFERRAL_CODE_MIN_LENGTH,
} from "@orderly.network/hooks";
import { useReferralData, PAGE_SIZE, type ReferralData, type ReferralSort } from "./useReferralData";
import { referrerPer100k } from "./economics";
import { dateFromYmd, dateTimeUtc, dayMonth, pct, shortAddr, usd, usd0 } from "./format";
import "./referrals.css";

const DESK_URL = "https://trade.throne.network";
// Public share copy links to throne.network while the desk is gated. After the Sep 25 open this
// can become the ?ref= desk link.
const SHARE_URL = "https://throne.network";
const X_URL = "https://x.com/thronedefi";
// Public docs.
const DOCS_URL = "https://docs.throne.network/referrals.html";

function copy(text: string, what = "Copied") {
  navigator.clipboard?.writeText(text).then(
    () => toast.success(what),
    () => toast.error("Couldn't copy"),
  );
}

function cleanCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, REFERRAL_CODE_MAX_LENGTH);
}

type Modal = null | "enter" | "create" | "rename";

export default function ReferralsPage() {
  const d = useReferralData();
  const [modal, setModal] = useState<Modal>(null);
  const [tab, setTab] = useState<"referrals" | "history">("referrals");
  const t = d.totals;
  // Enter Code is only meaningful for accounts that have not been referred and have not traded
  const canEnter = d.ready && !d.isReferred && d.lifetimeVolume <= 0;

  return (
    <div className="rf">
      <div className="rf-head">
        <div>
          <h1>Referrals</h1>
          <div className="sub">
            Refer traders to the desk and earn {pct(d.commissionRate)} of the fee revenue on every trade they make. Paid daily.
            <a href={DOCS_URL} target="_blank" rel="noreferrer">Learn more</a>
          </div>
        </div>
        <div className="rf-actions">
          {d.hasCode ? (
            <button className="rf-btn solid" onClick={() => copy(`${DESK_URL}/?ref=${d.code!.code}`, "Referral link copied")}>
              Copy Referral Link
            </button>
          ) : (
            <button className="rf-btn solid" disabled={!d.ready} onClick={() => setModal("create")}>
              Create Code
            </button>
          )}
          {d.isReferred ? (
            <span className="rf-btn ghost" title="The code this account joined with">
              Referred by <span className="code gold">{d.referredBy}</span>
            </span>
          ) : canEnter ? (
            <button className="rf-btn ghost" onClick={() => setModal("enter")}>Enter Code</button>
          ) : null}
        </div>
      </div>

      <div className="rf-cards">
        <Card
          label="Traders Referred"
          value={d.ready ? String(t.invites) : "—"}
          note={d.ready && d.hasCode ? `${t.traded} have traded · ${t.invites30} joined in the last 30d` : undefined}
          loading={d.infoLoading}
        />
        <Card
          label="Rewards Earned"
          value={d.ready ? usd(t.rewards) : "—"}
          note={d.ready && d.hasCode ? `${usd(t.rewards30)} in the last 30d` : undefined}
          gold
          loading={d.infoLoading}
        />
        <Card
          label="Pending Rewards"
          value={d.ready ? usd(d.pending) : "—"}
          note="Paid daily at 00:00 UTC to your desk balance"
          loading={d.infoLoading}
        />
      </div>

      {d.ready && d.hasCode && <CodeStrip d={d} onRename={() => setModal("rename")} />}
      {d.ready && !d.hasCode && d.isReferred && <ReferredStrip d={d} />}

      <div className="rf-panel">
        <div className="rf-tabs">
          <button className={`rf-tab${tab === "referrals" ? " on" : ""}`} onClick={() => setTab("referrals")}>Referrals</button>
          <button className={`rf-tab${tab === "history" ? " on" : ""}`} onClick={() => setTab("history")}>Rewards History</button>
        </div>
        {tab === "referrals" ? <ReferralsTable d={d} onCreate={() => setModal("create")} /> : <HistoryTab d={d} />}
      </div>

      {modal === "enter" && <EnterCodeModal d={d} onClose={() => setModal(null)} />}
      {modal === "create" && <CreateCodeModal d={d} onClose={() => setModal(null)} />}
      {modal === "rename" && d.code && <RenameCodeModal d={d} onClose={() => setModal(null)} />}
      {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1" && (
        <pre className="rf-debug">{JSON.stringify(d.debug, null, 2)}</pre>
      )}
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

function CodeStrip({ d, onRename }: { d: ReferralData; onRename: () => void }) {
  const code = d.code!;
  const link = `${DESK_URL}/?ref=${code.code}`;
  const tweet = `I trade stocks and crypto perps on the THRONE desk. Sign up with my referral code ${code.code}. ${SHARE_URL}`;
  const renamable = d.totals.invites === 0;
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
      {renamable && <button className="rf-btn ghost sm" onClick={onRename}>Rename</button>}
      <span className="sep" />
      <span className="link">{link.replace("https://", "")}</span>
      <button className="rf-btn ghost sm" onClick={() => copy(link, "Referral link copied")}>Copy link</button>
      <a className="rf-btn ghost sm" href={`https://x.com/intent/tweet?text=${encodeURIComponent(tweet)}`} target="_blank" rel="noreferrer">Share on X</a>
      <span className="grow" />
      <span className="split">
        You earn <span className="gold">{pct(d.commissionRate)}</span> of desk revenue on your referrals' trades ·{" "}
        <span className="gold">{usd(referrerPer100k(d.commissionRate, d.takerBps))}</span> per $100k volume
      </span>
    </div>
  );
}

function ReferredStrip({ d }: { d: ReferralData }) {
  return (
    <div className="rf-strip">
      <span className="k">Referred by</span>
      <span className="bigcode">{d.referredBy}</span>
      <span className="grow" />
      <span className="split dim">Referral codes are set once, at sign-up.</span>
    </div>
  );
}

/* ---------- referrals table ---------- */

function ReferralsTable({ d, onCreate }: { d: ReferralData; onCreate: () => void }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? d.referrals.filter((x) => x.address.toLowerCase().includes(s)) : d.referrals;
  }, [d.referrals, q]);
  const total = d.referralsTotal || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total ? (d.page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, d.page * PAGE_SIZE);

  const th = (key: ReferralSort, label: string, right = false) => {
    const on = d.sort === key;
    return (
      <button className={on ? "on" : ""} style={{ justifyContent: right ? "flex-end" : "flex-start", width: "100%" }} onClick={() => d.setSort(key)}>
        {label} <span className="arr">{!on ? "" : d.sortDesc ? "▼" : "▲"}</span>
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
        <div className="hint">
          <button className="rf-link" onClick={onCreate}>Create your code</button>, share the link, and traders who sign up with it appear here.
        </div>
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <div className="rf-empty">
        {q ? "No referral matches that address on this page." : "No referrals yet"}
        {!q && <div className="hint">Share your link. Traders who sign up with your code appear here.</div>}
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
            <span className="c4 right dim"><span className="lbl">Fees</span>{typeof x.fee === "number" ? usd(x.fee) : "—"}</span>
            <span className="c5 right gold"><span className="lbl">Rewards</span>{usd(x.rewards)}</span>
          </div>
        ))}
        <div className="rf-tr sum">
          <span className="dim">{d.totals.invites} traders</span>
          <span />
          <span className="right">{usd0(d.totals.volume)}</span>
          <span className="right dim">{d.totals.fees ? usd(d.totals.fees) : "—"}</span>
          <span className="right gold">{usd(d.totals.rewards)}</span>
        </div>
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

/** Shared code input with live availability / validity check (a hook: returns { ok, node }). */
function useCodeField({
  value, onChange, mode, label, placeholder,
}: { value: string; onChange: (v: string) => void; mode: "exists" | "available"; label: string; placeholder: string }) {
  const lengthOk = value.length >= REFERRAL_CODE_MIN_LENGTH;
  const { isExist, isLoading } = useCheckReferralCode(lengthOk ? value : undefined);
  let status = "";
  let cls = "mute";
  if (value && !lengthOk) status = `${REFERRAL_CODE_MIN_LENGTH}–${REFERRAL_CODE_MAX_LENGTH} characters`;
  else if (lengthOk && isLoading) status = "Checking…";
  else if (lengthOk && typeof isExist === "boolean") {
    const good = mode === "exists" ? isExist : !isExist;
    status = mode === "exists" ? (isExist ? "✓ Valid code" : "Code not found") : isExist ? "Taken" : "✓ Available";
    cls = good ? "green" : "red";
  }
  const ok = lengthOk && !isLoading && (mode === "exists" ? isExist === true : isExist === false);
  return {
    ok,
    node: (
      <div className="rf-field">
        <label>{label}</label>
        <div className="box">
          <input value={value} onChange={(e) => onChange(cleanCode(e.target.value))} placeholder={placeholder} spellCheck={false} autoFocus />
          <span className={`st ${cls}`}>{status}</span>
        </div>
      </div>
    ),
  };
}

function EnterCodeModal({ d, onClose }: { d: ReferralData; onClose: () => void }) {
  const [code, setCode] = useState("");
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref") || localStorage.getItem("referral_code");
    if (ref) setCode(cleanCode(ref));
  }, []);
  const field = useCodeField({ value: code, onChange: setCode, mode: "exists", label: "Referral code", placeholder: "CODE" });

  const submit = async () => {
    if (!field.ok) return;
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
      <div className="p">
        Enter the code of the trader who referred you. Codes can only be applied to accounts that haven't traded yet, and can't be
        changed later.
      </div>
      {field.node}
      <div className="actions">
        <button className="rf-btn ghost" onClick={onClose}>Cancel</button>
        <button className="rf-btn solid" disabled={!field.ok || d.bindMutating} onClick={submit}>{d.bindMutating ? "Applying…" : "Enter Code"}</button>
      </div>
    </ModalShell>
  );
}

function CreateCodeModal({ d, onClose }: { d: ReferralData; onClose: () => void }) {
  const [code, setCode] = useState("");
  const field = useCodeField({ value: code, onChange: setCode, mode: "available", label: "Your referral code", placeholder: "e.g. KINGMAKER" });
  const req = d.prereq?.required_volume ?? 0;
  const cur = d.prereq?.current_volume ?? 0;
  const locked = req > 0 && cur < req;

  const submit = async () => {
    if (!field.ok) return;
    try {
      // referee_rebate_rate here is the rate passed down to sub-affiliates (multilevel); 0 = keep the
      // whole allocation on direct referrals, same default as Orderly's own dialog.
      const res = await d.claimCode({ referral_code: code, referee_rebate_rate: 0 });
      if (res && res.success === false) throw new Error(res.message || "Couldn't create the code");
      toast.success(`Code ${code} created`);
      await d.refreshAll();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <ModalShell title="Create Referral Code" onClose={onClose}>
      {locked ? (
        <>
          <div className="p">Create a referral code after trading {usd(req)} on the desk.</div>
          <div className="rf-progress"><span style={{ width: `${Math.min(100, (cur / req) * 100)}%` }} /></div>
          <div className="rf-kv"><div><span>Your volume</span><span>{usd0(cur)} · {pct(Math.min(1, cur / req))}</span></div></div>
          <div className="actions">
            <button className="rf-btn ghost" onClick={onClose}>Close</button>
            <a className="rf-btn solid" href="/" style={{ textDecoration: "none" }}>Trade</a>
          </div>
        </>
      ) : (
        <>
          <div className="p">
            Pick your code. You earn <span className="gold">{pct(d.commissionRate)}</span> of the desk's fee revenue on every trade your
            referrals make, paid daily to your balance. No cap, no expiry.
          </div>
          {field.node}
          <div className="rf-kv">
            <div><span>You earn per $100k referred volume</span><span className="gold">{usd(referrerPer100k(d.commissionRate, d.takerBps))}</span></div>
            <div><span>Paid</span><span>Daily, 00:00 UTC, to your desk balance</span></div>
          </div>
          <div className="small">Letters and numbers, {REFERRAL_CODE_MIN_LENGTH}–{REFERRAL_CODE_MAX_LENGTH} characters. You can rename it until someone signs up with it.</div>
          <div className="actions">
            <button className="rf-btn ghost" onClick={onClose}>Cancel</button>
            <button className="rf-btn solid" disabled={!field.ok || d.claimMutating} onClick={submit}>{d.claimMutating ? "Creating…" : "Create Code"}</button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

function RenameCodeModal({ d, onClose }: { d: ReferralData; onClose: () => void }) {
  const current = d.code!.code;
  const [code, setCode] = useState("");
  const field = useCodeField({ value: code, onChange: setCode, mode: "available", label: "New code", placeholder: current });
  const submit = async () => {
    if (!field.ok) return;
    try {
      const res = await d.renameCode({ current_referral_code: current, new_referral_code: code });
      if (res && res.success === false) throw new Error(res.message || "Couldn't rename the code");
      toast.success(`Code renamed to ${code}`);
      await d.refreshAll();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };
  return (
    <ModalShell title="Rename Referral Code" onClose={onClose}>
      <div className="p">Renaming is possible until a trader signs up with your code. Links using the old code stop working.</div>
      {field.node}
      <div className="actions">
        <button className="rf-btn ghost" onClick={onClose}>Cancel</button>
        <button className="rf-btn solid" disabled={!field.ok || d.renameMutating} onClick={submit}>{d.renameMutating ? "Renaming…" : "Rename"}</button>
      </div>
    </ModalShell>
  );
}
