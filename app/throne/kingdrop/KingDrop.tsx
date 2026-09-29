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
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@orderly.network/hooks";
import { AccountStatusEnum } from "@orderly.network/types";
import "./kingdrop.css";

const API = "https://throne.network/api/arena";
export const BOARD_URL = "https://throne.network/kd-7f3a2c91";
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

async function signPick(wallet: string, side: Side, season: string): Promise<{ ok: boolean; error?: string }> {
  const eth = (window as any).ethereum;
  if (!eth || !eth.request) return { ok: false, error: "no wallet provider found" };
  const msg = pickMessage(wallet, side, season);
  const hex = "0x" + Array.from(new TextEncoder().encode(msg)).map((b) => b.toString(16).padStart(2, "0")).join("");
  let sig: string;
  try {
    sig = await eth.request({ method: "personal_sign", params: [hex, wallet] });
  } catch (e: any) {
    return { ok: false, error: e?.code === 4001 ? "signature declined" : "could not sign" };
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
  const title = pre ? "pre-season, from now to oct 18" : `week ${board?.week ?? 1}`;

  return (
    <a
      className="kd-chip"
      href={BOARD_URL}
      target="_blank"
      rel="noreferrer"
      title="King Drop · the board"
    >
      <span className="kd-chip-pot">{fmt(pot)} $THRONE</span>
      <span className="kd-chip-sep">·</span>
      <span className="kd-chip-label">King Drop</span>
      <span className="kd-chip-sep">·</span>
      {addr && sideName ? (
        <span className={`kd-chip-me kd-${sideName}`}>
          {sideName}
          {me && me.rank ? ` #${me.rank}` : ""}
          {me && me.season > 0 ? ` · ${fmt(me.season)} pts` : " · 0 pts"}
        </span>
      ) : (
        <span className="kd-chip-me">{title}</span>
      )}
    </a>
  );
}

// ---------- gate ----------

const gateKey = (a: string) => `kd_gate_${a}`;

export function KingDropGate() {
  const { addr, board, side, season, reloadSide } = useKingDrop();
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
    const r = await signPick(addr, s, season);
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

  return (
    <div className="kd-gate-backdrop" onClick={close}>
      <div className="kd-gate" onClick={(e) => e.stopPropagation()}>
        <div className="kd-gate-kicker">King Drop · {board?.preseason === false ? `week ${board?.week}` : "pre-season, from now to oct 18"}</div>
        <div className="kd-gate-pot">{fmt(pot)} $THRONE</div>
        <div className="kd-gate-sub">on the line for points. every trade on the desk scores for your side.</div>

        {done ? (
          <>
            <div className={`kd-gate-done kd-${done}`}>you are {done}. {short(addr)}</div>
            <div className="kd-gate-row">
              <a className="kd-btn kd-btn-ghost" href={BOARD_URL} target="_blank" rel="noreferrer">
                open the board
              </a>
              <button className="kd-btn kd-btn-solid" onClick={close}>
                back to trading
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="kd-gate-title">pick your side</div>
            <div className="kd-gate-row">
              {(["white", "black"] as Side[]).map((s) => (
                <button
                  key={s}
                  className={`kd-side kd-${s}`}
                  disabled={!!busy || side.capFull === s}
                  onClick={() => pick(s)}
                >
                  <span className="kd-side-glyph">{s === "white" ? "♔" : "♚"}</span>
                  <span className="kd-side-name">{s}</span>
                  <span className="kd-side-meta">
                    {side.capFull === s ? "full" : counts ? `${counts[s]} wallets` : ""}
                  </span>
                  {busy === s && <span className="kd-side-busy">sign in your wallet…</span>}
                </button>
              ))}
            </div>
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
              one free signature, no transaction. you can switch once per season. $THRONE holders score up to 1.5x.
            </div>
            {err && <div className="kd-gate-err">{err}</div>}
          </>
        )}
      </div>
    </div>
  );
}
