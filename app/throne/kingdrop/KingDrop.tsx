/**
 * THRONE · King Drop on the desk.
 *
 * Two pieces, both presentation-only over the public arena API (throne.network/api/arena):
 *  - KingDropChip: header chip. Pot on the line, then the connected wallet's side / rank / points.
 *    Links to the board.
 *  - KingDropGate: one-time "pick your side" modal. Shows once per wallet (localStorage) when the
 *    wallet has no confirmed pick yet. Picking = one free personal_sign, no transaction.
 *
 * Nothing here touches trading. If the API is down the chip renders the static pot line and the
 * gate stays closed.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useAccount, useWalletConnector } from "@orderly.network/hooks";
import { AccountStatusEnum } from "@orderly.network/types";
import "./kingdrop.css";

const API = "https://throne.network/api/arena";
export const BOARD_URL = "https://throne.network/board";
const POT_FALLBACK = 923000;

type Side = "white" | "black";

type Board = {
  state?: string;
  preseason?: boolean;
  week?: number;
  pot?: number | null;
  wallets?: Record<
    string,
    { side: Side; week: number; season: number; rank?: number; piece?: string | null; mult?: number }
  >;
  sides?: Record<Side, { pts: number; wallets: number }>;
};

type SideInfo = {
  wallet: string;
  side: Side;
  source: "picked" | "default";
  counts?: Record<Side, number>;
  capFull?: Side | null;
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

// ---------- data ----------

export function useKingDrop() {
  const { state } = useAccount();
  const connected = state.status >= AccountStatusEnum.Connected && !!state.address;
  const addr = connected ? String(state.address).toLowerCase() : null;
  const [board, setBoard] = useState<Board | null>(null);
  const [side, setSide] = useState<SideInfo | null>(null);
  const [season, setSeason] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const b: Board = await fetch(`${API}/board`).then((r) => r.json());
      setBoard(b);
    } catch {
      /* chip falls back to the static line */
    }
  }, []);

  const loadSide = useCallback(async (a: string) => {
    try {
      const [s, se] = await Promise.all([
        fetch(`${API}/side?wallet=${a}`).then((r) => r.json()),
        season ? Promise.resolve({ season }) : fetch(`${API}/season`).then((r) => r.json()),
      ]);
      if (s && s.side) setSide(s as SideInfo);
      if (se && se.season) setSeason(String(se.season));
    } catch {
      /* gate stays closed */
    }
  }, [season]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    setSide(null);
    if (addr) void loadSide(addr);
  }, [addr, loadSide]);

  const me = addr && board?.wallets ? board.wallets[addr] : undefined;
  return { addr, board, side, season, me, reloadSide: () => (addr ? loadSide(addr) : Promise.resolve()) };
}

// ---------- signing ----------

const pickMessage = (wallet: string, side: Side, season: string) =>
  `throne. king drop\njoin ${side}\nwallet ${wallet.toLowerCase()}\nseason ${season}\n\nThis signature is free and sends no transaction.`;

// THRONE 2026-10-07: sign with the provider of the wallet Orderly actually connected (WalletConnect,
// Rabby, Coinbase, a second injected extension), not whatever happens to be window.ethereum. With
// several providers installed, or a mobile wallet over WalletConnect, window.ethereum is a different
// wallet and personal_sign fails for the connected address ("could not sign").
async function signPick(
  provider: any,
  wallet: string,
  side: Side,
  season: string,
): Promise<{ ok: boolean; error?: string }> {
  const eth = provider && provider.request ? provider : (window as any).ethereum;
  if (!eth || !eth.request) return { ok: false, error: "no wallet provider found" };
  const msg = pickMessage(wallet, side, season);
  const hex = "0x" + Array.from(new TextEncoder().encode(msg)).map((b) => b.toString(16).padStart(2, "0")).join("");
  let sig: string;
  try {
    sig = await eth.request({ method: "personal_sign", params: [hex, wallet] });
  } catch (e: any) {
    if (e?.code === 4001 || /rejected|denied/i.test(String(e?.message || ""))) return { ok: false, error: "signature declined" };
    const detail = String(e?.message || e?.code || "").slice(0, 70);
    return { ok: false, error: detail ? `could not sign (${detail})` : "could not sign" };
  }
  try {
    const r = await fetch(`${API}/pick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet, side, sig }),
    });
    const j = await r.json();
    if (!r.ok || j.error) return { ok: false, error: j.error || "pick failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "network error" };
  }
}

// ---------- chip ----------

export function KingDropChip() {
  const { addr, board, side, me } = useKingDrop();
  const pot = board?.pot ?? POT_FALLBACK;
  const pre = board?.preseason ?? true;
  const sideName = me?.side || side?.side;
  const title = pre ? "pre-season · to oct 18" : `week ${board?.week ?? 1}`;

  // The chip lives in the free space between the nav and the wallet controls. Measure that space and shrink the
  // chip in steps instead of letting it overlap the nav: full > compact (pot + side) > pot only > hidden.
  const slotRef = useRef<HTMLDivElement>(null);
  const [slotW, setSlotW] = useState<number>(9999);
  useEffect(() => {
    const el = slotRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => setSlotW(entries[0]?.contentRect.width ?? 9999));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const level = slotW >= 420 ? 3 : slotW >= 260 ? 2 : slotW >= 150 ? 1 : 0;

  const mine = addr && sideName ? (
    <span className={`kd-chip-me kd-${sideName}`}>
      {sideName}
      {me && me.rank ? ` #${me.rank}` : ""}
      {level >= 3 ? (me && me.season > 0 ? ` · ${fmt(me.season)} pts` : " · 0 pts") : ""}
    </span>
  ) : level >= 3 ? (
    <span className="kd-chip-me">{title}</span>
  ) : null;

  return (
    <div className="kd-chip-slot" ref={slotRef}>
      {level > 0 && (
        <a className="kd-chip" href={BOARD_URL} target="_blank" rel="noreferrer" title="King Drop · the board">
          <span className="kd-chip-pot">{fmt(pot)} $THRONE</span>
          {level >= 2 && (
            <>
              <span className="kd-chip-sep">·</span>
              <span className="kd-chip-label">King Drop</span>
            </>
          )}
          {mine && (
            <>
              <span className="kd-chip-sep">·</span>
              {mine}
            </>
          )}
        </a>
      )}
    </div>
  );
}

// ---------- gate ----------

const gateKey = (a: string) => `kd_gate_${a}`;

export function KingDropGate() {
  const { addr, board, side, season, reloadSide } = useKingDrop();
  const { wallet } = useWalletConnector() as any; // THRONE: connected wallet's EIP-1193 provider
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Side | null>(null);
  const [done, setDone] = useState<Side | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!addr || !side || !season) return;
    if (side.source !== "default") return;
    try {
      if (localStorage.getItem(gateKey(addr))) return;
    } catch {
      /* private mode: show it */
    }
    setOpen(true);
  }, [addr, side, season]);

  const close = () => {
    if (addr) {
      try {
        localStorage.setItem(gateKey(addr), String(Date.now()));
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  };

  const pick = async (s: Side) => {
    if (!addr || !season || busy) return;
    setErr(null);
    setBusy(s);
    const r = await signPick(wallet?.provider, addr, s, season);
    setBusy(null);
    if (r.ok) {
      setDone(s);
      await reloadSide();
    } else setErr(r.error || "pick failed");
  };

  if (!open || !addr || !side) return null;

  const counts = (side.counts || board?.sides)
    ? {
        white: side.counts?.white ?? board?.sides?.white.wallets ?? 0,
        black: side.counts?.black ?? board?.sides?.black.wallets ?? 0,
      }
    : null;
  const pot = board?.pot ?? POT_FALLBACK;
  const smaller: Side = counts && counts.black < counts.white ? "black" : "white";
  const pts = board?.sides ? { white: board.sides.white.pts, black: board.sides.black.pts } : null;
  const totPts = pts ? pts.white + pts.black : 0;
  const whiteShare = totPts > 0 && pts ? pts.white / totPts : 0.5;
  const wallets = (s: Side) => (counts ? counts[s] : 0);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  return (
    <div className="kd-gate-backdrop" onClick={close}>
      <div className="kd-gate" onClick={(e) => e.stopPropagation()}>
        <button className="kd-x" onClick={close} aria-label="later">×</button>
        <div className="kd-gate-kicker">
          <span className="kd-live" /> King Drop · {board?.preseason === false ? `week ${board?.week}` : "pre-season · from now to oct 18"}
        </div>
        <div className="kd-gate-pot"><CountUp to={pot} /> <span className="kd-gate-pot-t">$THRONE</span></div>
        <div className="kd-gate-sub">on the line for points. every trade on the desk scores for your side.</div>

        {done ? (
          <div className="kd-done">
            <img className={`kd-done-piece kd-piece-${done}`} src={pieceSrc(done, 1)} alt="" />
            <div className={`kd-gate-done kd-${done}`}>you are {done}.</div>
            <div className="kd-gate-sub">{short(addr)} · every trade from here scores for {done}.</div>
            <div className="kd-gate-row">
              <a className="kd-btn kd-btn-ghost" href={BOARD_URL} target="_blank" rel="noreferrer">
                open the board
              </a>
              <button className="kd-btn kd-btn-solid" onClick={close}>
                back to trading
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="kd-gate-title">pick your side</div>
            <div className="kd-arena">
              {(["white", "black"] as Side[]).map((s) => (
                <SideCard
                  key={s}
                  side={s}
                  full={side.capFull === s}
                  busy={busy === s}
                  disabled={!!busy || side.capFull === s}
                  meta={side.capFull === s ? "full this week" : counts ? plural(wallets(s), "wallet") : ""}
                  pts={pts ? pts[s] : null}
                  onPick={() => pick(s)}
                />
              ))}
              <div className="kd-vs">vs</div>
            </div>
            {pts && (
              <div className="kd-tug" title="share of season points">
                <div className="kd-tug-w" style={{ width: `${Math.round(whiteShare * 100)}%` }} />
                <span className="kd-tug-l">{Math.round(whiteShare * 100)}%</span>
                <span className="kd-tug-r">{100 - Math.round(whiteShare * 100)}%</span>
              </div>
            )}
            <div className="kd-gate-foot">
              <button className="kd-link" disabled={!!busy} onClick={() => pick(smaller)}>
                pick for me (the smaller side)
              </button>
              <span className="kd-dot">·</span>
              <button className="kd-link" onClick={close}>
                later
              </button>
            </div>
            <div className="kd-gate-note">
              one free signature, no transaction. switch once per season, and only in the first 48 hours of a week. $THRONE holders score up to 1.5x.
            </div>
            {err && <div className="kd-gate-err">{err}</div>}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- bits ----------

const pieceSrc = (side: Side, rank: number) =>
  `https://throne.network/arena/pieces/${side}-${String(rank).padStart(2, "0")}-${rank === 1 ? "king" : "queen"}.svg`;

function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(to * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{fmt(v)}</>;
}

function SideCard(props: {
  side: Side;
  full: boolean;
  busy: boolean;
  disabled: boolean;
  meta: string;
  pts: number | null;
  onPick: () => void;
}) {
  const { side, full, busy, disabled, meta, pts, onPick } = props;
  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const onMove = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: y * -10, y: x * 12 });
  };
  const onLeave = () => setTilt({ x: 0, y: 0 });
  return (
    <button
      className={`kd-side kd-${side}${busy ? " is-busy" : ""}${full ? " is-full" : ""}`}
      disabled={disabled}
      onClick={onPick}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ transform: `perspective(700px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
    >
      <span className="kd-side-halo" />
      <img className="kd-side-piece" src={pieceSrc(side, 1)} alt={`${side} king`} draggable={false} />
      <span className="kd-side-name">{side}</span>
      <span className="kd-side-meta">{meta}</span>
      {pts != null && <span className="kd-side-pts">{fmt(pts)} pts</span>}
      <span className="kd-side-cta">{busy ? "sign in your wallet…" : full ? "full" : `join ${side}`}</span>
    </button>
  );
}
