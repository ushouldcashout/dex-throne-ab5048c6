/** Formatting helpers for the Banner page. Lowercase everything: THRONE voice. */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function usd(n: number | undefined | null, decimals = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (n < 0 ? "-$" : "$") + s;
}

/** Whole-dollar USD for volumes. */
export function usd0(n: number | undefined | null): string {
  return usd(n, 0);
}

export function bps(n: number | undefined | null, decimals = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `${n.toFixed(decimals)}bps`;
}

export function pct(fraction: number | undefined | null, decimals = 0): string {
  if (fraction === undefined || fraction === null || Number.isNaN(fraction)) return "—";
  return `${(fraction * 100).toFixed(decimals)}%`;
}

export function shortAddr(addr?: string, head = 6, tail = 4): string {
  if (!addr) return "—";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

/** `19 sep 2026 · 14:32 utc` from a ms timestamp. */
export function dateTimeUtc(ms?: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())} utc`;
}

/** `19 sep 2026` from a `yyyy-MM-dd` string. */
export function dateFromYmd(ymd?: string): string {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return ymd;
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`;
}

/** `19 sep` from a `yyyy-MM-dd` string, for chart axes. */
export function dayMonth(ymd: string): string {
  const [, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  return `${pad(d)} ${MONTHS[m - 1]}`;
}

/** `yyyy-MM-dd` in UTC. */
export function ymdUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function daysAgoUtc(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

/** Every `yyyy-MM-dd` between two dates, inclusive, oldest first. */
export function dayRange(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (cur.getTime() <= end) {
    out.push(ymdUtc(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
