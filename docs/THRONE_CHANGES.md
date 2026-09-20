# THRONE desk: changes on top of the Orderly template

This repo is a fork of `OrderlyNetworkDexCreator/dex-creator-template` (Orderly One whitelabel).
Everything THRONE-specific is listed here so anyone (Finn, a new dev, future us) can see what
was changed, why, and where. Keep this file current: one entry per meaningful commit.

Conventions

- THRONE code lives under `app/throne/` (new files, never touched by upstream).
- Template files we edit are kept to a minimum and each edit is marked with a `// THRONE:` comment.
- All `@orderly.network/*` packages are pinned to the exact same version (3.2.1). Upgrade them
  together, on purpose, then do a visual pass on desktop and mobile. Never let one drift.
- The upstream auto-merge step in `.github/workflows/deploy.yml` is removed. Upstream changes are
  pulled by hand: `git fetch upstream && git merge upstream/main`, resolve, test, push.
- Deploy: push to `main` builds with GitHub Actions and publishes to GitHub Pages at
  trade.throne.network. A Cloudflare Worker in front adds a passphrase gate (not in this repo).

## Log

### 2026-09-20 · Referrals v2.1: commission-only model (no trader discount)

- Corrected the program model after reading Orderly's builder/affiliate guides and the account's
  own `/v1/referral/multi_level/*` responses: in the **multilevel** program the referrer earns the
  whole commission and **the referred trader gets no fee discount** ("the trader does not earn
  affiliate commission from their own trade"). Orderly One "Base referral commission 40%" =
  `base_rebate_rate` 0.4; bonus (`max_rebate_rate`) is 0 unless the desk grants a KOL more.
  An affiliate's rate = base + bonus, applied to THRONE net (2.0 bps) → 0.8 bps of referred taker
  volume ≈ $8 per $100k. The earlier "you earn 0% · traders get 100%" preview came from treating
  base as a referee share.
- `useReferralData.ts`: `commissionRate = (bonus ?? max) + base`, falls back to 0.4; legacy
  program keeps referrer/referee split. Exposes `debug` (raw maxRate / rebateInfo / prereq / info).
- `ReferralsPage.tsx`: no split slider, no discount copy anywhere. Subtitle and Create Code modal
  say "you earn 40% of the desk's fee revenue on every trade your referrals make, paid daily"
  with the per-$100k figure. `claim_code` is called with `referee_rebate_rate: 0` (the pass-down
  rate for sub-affiliates; same default as Orderly's own dialog). Enter Code modal: one sentence.
  Locked state copy matches the standard page: "Create a referral code after trading $X".
  `?debug=1` on /referrals prints the raw program responses (for Finn / support).
- Operator: to gate code creation behind volume, set Orderly One → Affiliates → Minimum trading
  volume (target: 6,969.69 USDC). The page reads it from `volume_prerequisite`.

### 2026-09-20 · PnL share posters: green crowns, degen taglines

- `public/pnl/poster_bg_1..8.webp` replaced (1200×675). Dark base, faint grid, soft green glow,
  the desk's crown silhouette in king green with the gold ball, mono lowercase taglines bottom-right.
  Left ~55% is kept quiet because Orderly draws the PnL text there (message / position / PnL /
  info top-left, ref link bottom-left). Art is original: crown, crown rain, climbing candles,
  pixel king-cat, money printer with crowned bills, pawn → crown, grass + crown, pixel throne.
  No third-party characters.
  Source: `tmp_posters.py` in the session (PIL); ask if you want it in the repo.
- `public/config.js` unchanged (count stays 8). The old red `poster_bg_1..4.png` are unused (the app loads `.webp`) and can be deleted whenever.

### 2026-09-20 · Referrals v2: self-serve codes, Create Code first

- THRONE runs Orderly's **multilevel** affiliate program (Orderly One → Affiliates; base referral
  commission 40%, minimum trading volume 0 USDC). So any signed-in trader can create their own code:
  `POST /v1/referral/multi_level/claim_code { referral_code, referee_rebate_rate }`, rename it with
  `/v1/referral/edit_referral_code` until a trader binds, and change the default split with
  `/v1/referral/multi_level/rebate_rate/update`. Nobody has to ask the desk for a code.
- `ReferralsPage.tsx`: header leads with **Create Code** (gold). **Enter Code** is secondary and
  only shows for accounts that have not been referred and have not traded yet (`/v1/volume/user/stats`
  `perp_volume_ltd == 0`), since Orderly binds referrals at sign-up and a bound code is permanent.
  Enter Code modal is one sentence + input (no fee tables). Create Code modal: pick a name with live
  availability check (`/v1/public/referral/verify_ref_code`), see default split + per-$100k preview,
  create. Rename modal while nobody has bound. Split modal uses the multilevel update (legacy
  `edit_split` kept as fallback).
- `useReferralData.ts`: headline numbers from `/v1/referral/multi_level/statistics?time_range=
  all_time|30d`, table from `/v1/referral/multi_level/referee_list`, daily history aggregated from
  `/v1/referral/referral_history`; legacy `referee_info` / `rebate_summary` remain as fallbacks.
  Program config from `multi_level/max_rebate_rate`, `multi_level/rebate_info`,
  `multi_level/volume_prerequisite`.
- `economics.ts`: Orderly rates are fractions of the builder's **net** (taker − Orderly cut =
  2.0 bps), not of the whole fee. Discount on taker fee = referee_rate × 2.0 / 4.5 (0.16 → ~7%).
  Removed the earlier heuristic. `ORDERLY_CUT_BPS = 2.5` must track our Orderly fee tier.
- `referrals.css`: button/tab resets use `:where()` so component classes win (buttons were being
  flattened); page is full width.
- Not verifiable from this wallet until a code exists: the referee_list and referral_history field
  names are taken from the Orderly affiliate SDK; if a column shows "—" or empty, check the raw
  response in the network tab and adjust the row mapping in `useReferralData.ts`.

### 2026-09-20 · Referrals page at /referrals (replaces the "Banner" page from earlier today)

Same data, standard vocabulary. The first version used THRONE words (banner / sworn / tribute)
and was confusing for perp traders who already know the Hyperliquid-style referrals page. This one
follows that structure and language 1:1 (Referrals · Traders Referred · Rewards Earned · Enter
Code · Create Code · Address / Date Joined / Total Volume / Fees Paid / Your Rewards) with the
THRONE skin (near-black, hairlines, gold, mono numbers) and one extra: a Rewards History tab with a
daily rewards chart and a paid/pending ledger.

- `app/throne/referrals/ReferralsPage.tsx` (new): header with Enter Code (or "Referred by CODE"
  once bound) and Create Code (or Copy Referral Link once you have a code); three cards (Traders
  Referred, Rewards Earned, Pending Rewards); "Your code" strip (code, copy, link, share on X,
  split, Edit split) or "Referred by" strip (discount, effective fee, saved so far); tabs
  Referrals (sortable table, address search, 25/page, totals row) and Rewards History (30D/90D
  chart + daily ledger, Paid/Pending). Modals: Enter Referral Code (live check + bind), Create
  Referral Code (auto-referral progress if enabled in Orderly One, otherwise "request a code"
  → @thronedefi), Edit Split (keeps the code's total rebate, moves the line).
  No "Claim Rewards" button on purpose: Orderly pays rebates to the balance daily, nothing to claim.
- `app/throne/referrals/useReferralData.ts`, `economics.ts`, `format.ts`, `referrals.css` (new):
  the data layer and constants from the Banner version, renamed to standard terms.
  `economics.ts` constants (taker 4.5 bps, reward pool 0.8 bps = 40% of THRONE's 2 bps) drive only
  the previews; **if fees or the commission share change in Orderly One, change them here.**
  `futures_taker_fee_rate` from `/v1/client/info` is already in bps.
- `app/pages/referrals/Layout.tsx`, `Index.tsx` (new): Scaffold shell + SEO title.
- `app/main.tsx`: `/referrals` route; `/banner` redirects to it. `app/utils/config.tsx`: menu
  item id `Referrals` + mobile flag tab. `public/config.js`: `VITE_ENABLED_MENUS` lists
  `Referrals`. `app/throne/banner/` and `app/pages/banner/` deleted.
- Data sources unchanged: `/v1/referral/info`, `useRefereeInfo`, `useReferralRebateSummary`,
  `useRefereeRebateSummary`, `useAccountInfo`, `/v1/referral/auto_referral/progress`, mutations
  `/v1/referral/edit_split`, `/v1/referral/bind`. Orderly handles `?ref=CODE` (react-app stores,
  ui-connector binds at account creation), so `trade.throne.network/?ref=RAFI` needs no code here.
- Follow-ups: per-trader trade count / last trade (not in Orderly's referee API), top-10 marker.
- Operator side (Orderly One → Growth → Affiliates): program enabled, default split 60/40; KOL
  codes are created there and show up on this page for that wallet.

### 2026-09-20 · nav + markets page polish

- `app/utils/config.tsx`: custom menus (Points, The Court) open in the same tab (`_self`),
  not a new one.
- `app/styles/index.css`: hide the stats strip at the top of /markets (24h volume, OI, TVL with
  the Orderly mark). Those are Orderly-network-wide numbers, not THRONE's.

### 2026-09-20 · layout v0.2: no markets sidebar (Hyperliquid style)

- `app/throne/plugins/throneLayout.tsx` + `throne-layout.css`: dropped the persistent left
  markets column. The symbol in the symbol bar already opens Orderly's markets popout
  (`DropDownMarketsWidget`, 620×496, search + tabs + favourites), same pattern as Hyperliquid
  and Lighter. Chart now spans the full width; grid is 3 columns (chart | orderbook | entry).
  Popout rows tightened to 30px. Min desk width 1100px.

### 2026-09-19 · Phase 0 + Tier 2 layout

- `.github/workflows/deploy.yml`: removed "Check if fork" and "Sync with upstream" steps.
  Reason: automatic upstream merges would conflict with the THRONE layout plugin and theme.
- `app/utils/symbol-filter.ts`: drop permissionless community listings (symbols with a broker
  suffix such as `PERP_AAPL_USDC_mythos`, 59 of them from brokers mythos/alpix/fastx). They are
  operated by the listing broker, duplicate our names (a second TSLA at 20x) and confuse users.
  `VITE_SYMBOL_LIST` still works as an allow-list on top of that.
- `app/throne/plugins/throneLayout.tsx` (new): Orderly plugin that intercepts
  `Trading.Layout.Desktop` and renders THRONE's own desktop grid using Orderly's exported
  widgets. Dense, Lighter/Hyperliquid-style: markets list on the left, chart center,
  orderbook + trades right of chart, order entry far right, positions/orders bottom.
  Widget internals (validation, submission, streams) stay Orderly's. Mobile layout untouched.
- `app/components/orderlyProvider/index.tsx`: `plugins={[throneLayoutPlugin]}` on
  `OrderlyAppProvider` (one line, marked `// THRONE:`).
- `package.json` untouched. The plugin imports `@orderly.network/plugin-core`, `ui-order-entry`
  and `ui-tradingview`, which are transitive deps of `@orderly.network/trading` (same 3.2.1,
  hoisted by yarn). If a future SDK bump stops hoisting them, add them to `dependencies` at the
  same version and refresh `yarn.lock`.
- Known follow-ups: data-list height is fixed at 272px (make it a drag handle later); sword-shaped fill markers on
  the chart need a TradingView execution-shape override (Tier 3).

### 2026-09-19 · earlier today (Tier 1, CSS/config only)

- `app/styles/theme.css`: Inter font, near-black palette (base-9 = 5 6 5), radii 2–3px,
  gold primary `212 175 55`, green profit `41 233 169`.
- `app/styles/index.css`: density pass (root 14px on desktop, 12px orderbook rows at 19px,
  28px table rows, hairline panel borders, gaps collapsed, layout switcher hidden, quiet footer).
- `app/styles/fonts.css`: Google Fonts import for Inter + JetBrains Mono (numbers are mono).
- `public/tradingview/chart.css`: chart font Inter.
- `public/config.js`: `VITE_ORDERLY_THEME_CONFIG.cssVars` mirrors `theme.css` exactly. The
  runtime theme config overrides the CSS file at runtime, so the two must stay in sync (if you
  change theme.css, regenerate cssVars). `VITE_ENABLED_MENUS` = Trading,Portfolio,Markets,
  Leaderboard; `VITE_CUSTOM_MENUS` adds Points and The Court (links to throne.network).
- `app/utils/config.tsx`: nav right side = language, account, connect only (chain menu, total
  value, QR, device-link removed: single chain, Robinhood). Mounts `<ThroneSounds/>` (desktop).
  Points tab in mobile bottom nav. Logo URLs cache-busted (`?v=green2`).
- `app/components/ThroneSounds.tsx` (new): Web Audio cues on fill (buy up / sell down),
  position close/reduce (gavel + chime), and risk siren at mmr/marginRatio ≥ 0.8 (re-arms < 0.65,
  repeats every 30s). Mute pill bottom-right, state in `localStorage.throne_sounds`.
- `app/locales/en.json`: restricted notice without the IP; footer "in the seat" /
  "join us on twitter".
- `app/utils/storage.ts`: default symbol `PERP_NVDA_USDC`.
- `app/main.tsx`: `config.js` loaded with a per-minute cache-buster.
- `public/favicon.webp`, `logo.webp`, `logo-secondary.webp`: green crown. `public/sw.js`
  cache version bumped to v2 so old assets are purged. `index.html`: title "throne",
  favicon URLs cache-busted.
