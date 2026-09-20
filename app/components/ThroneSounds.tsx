/**
 * THRONE desk sounds.
 *
 * Three one-shot cues, synthesized with Web Audio (no media files):
 *  - fill:  an order fills (opens or adds to a position)
 *  - close: a position is closed or reduced
 *  - siren: account risk rate crosses the warning line (repeats while it stays there)
 *
 * Presentation only. Reads Orderly hooks, never writes. Mute state lives in
 * localStorage under "throne_sounds" and is toggled from a small pill above the footer.
 */
import { useEffect, useRef, useState } from "react";
import {
  useMarginRatio,
  useOrderStream,
  usePositionStream,
} from "@orderly.network/hooks";
import { OrderStatus } from "@orderly.network/types";

const STORAGE_KEY = "throne_sounds";
const RISK_WARN = 0.8; // mmr / marginRatio; liquidation happens at 1.0
const RISK_REARM = 0.65;
const SIREN_REPEAT_MS = 30_000;

// ---------- synth ----------

let ctx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const AC =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx && ctx.state === "suspended") void ctx.resume();
  return ctx;
};

const tone = (
  ac: AudioContext,
  out: AudioNode,
  opts: {
    type: OscillatorType;
    from: number;
    to?: number;
    start: number;
    dur: number;
    gain: number;
    lowpass?: number;
  },
) => {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.from, opts.start);
  if (opts.to) {
    osc.frequency.exponentialRampToValueAtTime(opts.to, opts.start + opts.dur);
  }
  g.gain.setValueAtTime(0.0001, opts.start);
  g.gain.exponentialRampToValueAtTime(opts.gain, opts.start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, opts.start + opts.dur);
  let node: AudioNode = osc;
  if (opts.lowpass) {
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = opts.lowpass;
    osc.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(out);
  osc.start(opts.start);
  osc.stop(opts.start + opts.dur + 0.05);
};

/** the king's seal: low thud + short brass stab. buys resolve up, sells down. */
const playFill = (side: "BUY" | "SELL") => {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;
  const master = ac.createGain();
  master.gain.value = 0.9;
  master.connect(ac.destination);
  tone(ac, master, { type: "sine", from: 110, to: 55, start: t, dur: 0.32, gain: 0.55 });
  const a = side === "BUY" ? 330 : 440;
  const b = side === "BUY" ? 440 : 330;
  tone(ac, master, { type: "sawtooth", from: a, start: t + 0.02, dur: 0.11, gain: 0.16, lowpass: 1800 });
  tone(ac, master, { type: "sawtooth", from: b, start: t + 0.12, dur: 0.2, gain: 0.16, lowpass: 1800 });
};

/** gavel: two knocks, then a rising three-note chime. */
const playClose = () => {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;
  const master = ac.createGain();
  master.gain.value = 0.9;
  master.connect(ac.destination);
  tone(ac, master, { type: "triangle", from: 180, to: 70, start: t, dur: 0.09, gain: 0.5 });
  tone(ac, master, { type: "triangle", from: 180, to: 70, start: t + 0.14, dur: 0.09, gain: 0.5 });
  const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
  notes.forEach((f, i) => {
    tone(ac, master, { type: "sine", from: f, start: t + 0.3 + i * 0.09, dur: 0.35, gain: 0.18 });
  });
};

/** low-level siren: soft two-tone sweep, twice. */
const playSiren = () => {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;
  const master = ac.createGain();
  master.gain.value = 0.6;
  master.connect(ac.destination);
  for (let i = 0; i < 2; i++) {
    const s = t + i * 0.7;
    tone(ac, master, { type: "square", from: 440, to: 660, start: s, dur: 0.34, gain: 0.07, lowpass: 1200 });
    tone(ac, master, { type: "square", from: 660, to: 440, start: s + 0.35, dur: 0.34, gain: 0.07, lowpass: 1200 });
  }
};

// ---------- component ----------

const readEnabled = (): boolean => {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
};

export const ThroneSounds = () => {
  const [enabled, setEnabled] = useState<boolean>(readEnabled);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // warm the audio context on the first user gesture so later plays are allowed
  useEffect(() => {
    const warm = () => {
      getCtx();
      window.removeEventListener("pointerdown", warm);
      window.removeEventListener("keydown", warm);
    };
    window.addEventListener("pointerdown", warm);
    window.addEventListener("keydown", warm);
    return () => {
      window.removeEventListener("pointerdown", warm);
      window.removeEventListener("keydown", warm);
    };
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      /* ignore */
    }
    if (next) playFill("BUY");
  };

  // ---- position changes → close sound ----
  const [positions] = usePositionStream();
  const prevQty = useRef<Map<string, number> | null>(null);
  const lastCloseAt = useRef(0);

  useEffect(() => {
    const rows: any[] = (positions as any)?.rows ?? [];
    const now = new Map<string, number>();
    rows.forEach((r) => {
      const q = Math.abs(Number(r.position_qty ?? 0));
      if (q > 0) now.set(String(r.symbol), q);
    });
    if (prevQty.current === null) {
      prevQty.current = now; // first snapshot: learn, don't play
      return;
    }
    let reduced = false;
    prevQty.current.forEach((q, sym) => {
      const cur = now.get(sym) ?? 0;
      if (cur < q - 1e-12) reduced = true;
    });
    prevQty.current = now;
    if (reduced && enabledRef.current) {
      lastCloseAt.current = Date.now();
      playClose();
    }
  }, [positions]);

  // ---- filled orders → fill sound ----
  const [orders] = useOrderStream(
    { status: OrderStatus.FILLED, size: 20 },
    { keeplive: true },
  );
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const list: any[] = Array.isArray(orders) ? orders : [];
    if (seen.current === null) {
      seen.current = new Set(list.map((o) => String(o.order_id ?? o.algo_order_id)));
      return;
    }
    let fresh: any | null = null;
    list.forEach((o) => {
      const id = String(o.order_id ?? o.algo_order_id);
      if (!seen.current!.has(id)) {
        seen.current!.add(id);
        if (!fresh) fresh = o;
      }
    });
    if (!fresh || !enabledRef.current) return;
    // a close just played for this fill: don't stack both
    if (Date.now() - lastCloseAt.current < 1500) return;
    // give the position stream a beat to report a reduction first
    const o = fresh;
    setTimeout(() => {
      if (Date.now() - lastCloseAt.current < 1500) return;
      playFill(String(o.side).toUpperCase() === "SELL" ? "SELL" : "BUY");
    }, 250);
  }, [orders]);

  // ---- risk rate → siren ----
  const { marginRatio, mmr } = useMarginRatio();
  const armed = useRef(true);
  const lastSirenAt = useRef(0);

  useEffect(() => {
    if (!mmr || !marginRatio || marginRatio <= 0) return;
    const risk = mmr / marginRatio;
    if (risk >= RISK_WARN) {
      const due = Date.now() - lastSirenAt.current > SIREN_REPEAT_MS;
      if ((armed.current || due) && enabledRef.current) {
        lastSirenAt.current = Date.now();
        armed.current = false;
        playSiren();
      }
    } else if (risk < RISK_REARM) {
      armed.current = true;
    }
  }, [marginRatio, mmr]);

  return (
    <button
      type="button"
      onClick={toggle}
      title={enabled ? "desk sounds on" : "desk sounds off"}
      aria-label="toggle desk sounds"
      style={{
        position: "fixed",
        right: 10,
        bottom: 34,
        zIndex: 60,
        padding: "3px 8px",
        borderRadius: 2,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgb(5,6,5)",
        color: enabled ? "rgb(212,175,55)" : "rgba(255,255,255,0.35)",
        font: "500 11px/1 'JetBrains Mono', ui-monospace, monospace",
        letterSpacing: "0.04em",
        cursor: "pointer",
      }}
    >
      {enabled ? "♪ on" : "♪ off"}
    </button>
  );
};

export default ThroneSounds;
