/**
 * THRONE banner (referral) economics used for previews on the Banner page.
 *
 * Orderly computes and settles the real rebates. These constants only drive the
 * "per $100k" previews, the effective-fee readout and the discount percentage, so they
 * must mirror the broker settings in Orderly One → Growth → Affiliates:
 *
 *   taker fee            4.5 bps   (Orderly One → Fees)
 *   Orderly's flat cut   2.5 bps
 *   THRONE revenue       2.0 bps
 *   referral commission  40% of THRONE revenue = 0.8 bps of every sworn trader's taker volume
 *
 * The 0.8 bps pool is then split between banner holder and trader by the code's own
 * referrer_rebate_rate / referee_rebate_rate (default 60/40).
 *
 * If the fee or the commission share changes in Orderly One, change it here too.
 */
export const TAKER_FEE_BPS_DEFAULT = 4.5;
export const TRIBUTE_POOL_BPS = 0.8;

/** Fraction of the pool a code gives back to the trader, normalised so keep + give = 1. */
export function splitShares(referrerRate: number, refereeRate: number) {
  const total = referrerRate + refereeRate;
  if (!total) return { keep: 1, give: 0 };
  return { keep: referrerRate / total, give: refereeRate / total };
}

/** USD earned by the holder per $100k of sworn taker volume. */
export function holderPer100k(keep: number) {
  return 100_000 * (TRIBUTE_POOL_BPS / 10_000) * keep;
}

/** USD saved by the trader per $100k of their own taker volume. */
export function traderPer100k(give: number) {
  return 100_000 * (TRIBUTE_POOL_BPS / 10_000) * give;
}

/** Trader's effective taker fee in bps after the banner discount. */
export function effectiveTakerBps(takerBps: number, give: number) {
  return takerBps - TRIBUTE_POOL_BPS * give;
}

/** Trader's discount as a fraction of the taker fee (0.07 = 7%). */
export function discountFraction(takerBps: number, give: number) {
  if (!takerBps) return 0;
  return (TRIBUTE_POOL_BPS * give) / takerBps;
}

/**
 * Discount fraction for a sworn trader, best source first:
 *  1. actuals: Σ referee_rebate / Σ fee from the daily referee summary (self-correcting);
 *  2. the code's referee_rebate_rate. Orderly stores it either as a fraction of the whole fee
 *     (≈0.07) or as a share of the pool (≈0.4) depending on how the program was configured, so
 *     treat anything at or below the pool/fee ratio as a fee fraction and anything above as a share.
 */
export function refereeDiscountFraction(
  takerBps: number,
  refereeRate: number | undefined,
  actuals?: { rebate: number; fee: number },
) {
  if (actuals && actuals.fee > 0) return actuals.rebate / actuals.fee;
  if (typeof refereeRate !== "number" || !takerBps) return discountFraction(takerBps, 0.4);
  const poolFrac = TRIBUTE_POOL_BPS / takerBps;
  return refereeRate <= poolFrac + 1e-9 ? refereeRate : refereeRate * poolFrac;
}
