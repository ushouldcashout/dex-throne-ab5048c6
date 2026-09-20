/**
 * THRONE referral economics used for previews on the Referrals page.
 *
 * Orderly computes and settles the real rebates. These constants only drive the "per $100k"
 * previews and the effective-fee readout, so they must mirror Orderly One → Fees / Affiliates:
 *
 *   taker fee            4.5 bps   (Orderly One → Fees)
 *   Orderly's flat cut   2.5 bps
 *   THRONE net           2.0 bps   = taker − Orderly cut
 *   referral commission  40% of THRONE net (Orderly One → Affiliates → "Base referral commission")
 *
 * Program model (Orderly multilevel affiliate program, the one available to new brokers): rates
 * are fractions of the builder's NET profit, and the whole commission goes to the referrer chain.
 * The referred trader gets no fee discount ("the trader does not earn affiliate commission from
 * their own trade"). With 40% base commission an affiliate earns 0.4 × 2.0 bps = 0.8 bps of their
 * referrals' taker volume, about $8 per $100k.
 *
 * If the fee or the commission share changes in Orderly One, change it here too.
 */
export const TAKER_FEE_BPS_DEFAULT = 4.5;
export const ORDERLY_CUT_BPS = 2.5;
export const COMMISSION_SHARE_DEFAULT = 0.4; // of net; Orderly One "Base referral commission"

/** THRONE's net per unit of taker volume, in bps. */
export function netBps(takerBps: number) {
  return Math.max(0, takerBps - ORDERLY_CUT_BPS);
}

/** Normalised split so keep + give = 1 (works whether rates are 0.24/0.16 or 0.6/0.4). */
export function splitShares(referrerRate: number, refereeRate: number) {
  const total = referrerRate + refereeRate;
  if (!total) return { keep: 1, give: 0 };
  return { keep: referrerRate / total, give: refereeRate / total };
}

/** USD the referrer earns per $100k of referred taker volume. `referrerRate` is a fraction of net. */
export function referrerPer100k(referrerRate: number, takerBps = TAKER_FEE_BPS_DEFAULT) {
  return 100_000 * (netBps(takerBps) / 10_000) * referrerRate;
}

/** USD a referred trader saves per $100k of their taker volume. `refereeRate` is a fraction of net. */
export function traderPer100k(refereeRate: number, takerBps = TAKER_FEE_BPS_DEFAULT) {
  return 100_000 * (netBps(takerBps) / 10_000) * refereeRate;
}

/** Trader's discount as a fraction of the taker fee (0.07 = 7%). `refereeRate` is a fraction of net. */
export function discountFraction(takerBps: number, refereeRate: number) {
  if (!takerBps) return 0;
  return (netBps(takerBps) * refereeRate) / takerBps;
}

/** Trader's effective taker fee in bps after the discount. */
export function effectiveTakerBps(takerBps: number, refereeRate: number) {
  return takerBps * (1 - discountFraction(takerBps, refereeRate));
}

/**
 * Discount fraction for a referred trader: actuals (Σ referee_rebate / Σ fee) when there is
 * history, otherwise the code's referee rate.
 */
export function refereeDiscountFraction(
  takerBps: number,
  refereeRate: number | undefined,
  actuals?: { rebate: number; fee: number },
) {
  if (actuals && actuals.fee > 0) return actuals.rebate / actuals.fee;
  return discountFraction(takerBps, refereeRate ?? COMMISSION_SHARE_DEFAULT * 0.4);
}
