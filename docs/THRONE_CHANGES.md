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

### 2026-09-20 · Banner page (our referral page) at /banner

Vocabulary on this page: referral code = **banner**, referrer = **banner holder**, referee has
**sworn to a banner**, rebate = **tribute**. The words referral/referee/affiliate only appear in
the small print. Design: Claude Design handoff `design_handoff_throne/banner` v5.

- `app/throne/banner/BannerPage.tsx` (new): the page. States: connect → sign in → loading →
  error → holder (hero with code, copy link, share on X, sworn traders / their volume (all|30d) /
  tribute earned / unpaid tribute; split bar with edit-split modal; tribute-over-time chart 30d|90d
  with volume line; sworn traders table with server-side sort + 25/page paging + address search;
  collapsible payout ledger) · sworn-only card (discount %, saved so far, effective taker fee) ·
  claim/join (raise a banner: auto-referral progress if the desk enabled it in Orderly One,
  otherwise "ask the desk" → @thronedefi; swear to a banner: live code check + bind).
  A wallet that is both holder and sworn sees the holder view plus a sworn strip.
- `app/throne/banner/useBannerData.ts` (new): all data from `@orderly.network/hooks` 3.2.1, no
  THRONE backend. `/v1/referral/info` (codes, totals, 30d fields, referee side),
  `useRefereeInfo` (sworn traders: address, bound time, volume, fee, rebate),
  `useReferralRebateSummary` (daily volume/tribute for chart + ledger; rows dated before today
  UTC are "settled", today is "pending" = unpaid tribute), `useRefereeRebateSummary` (actual
  discount received), `useAccountInfo` (taker fee; `futures_taker_fee_rate / 10` = bps),
  `/v1/referral/auto_referral/progress`, mutations `/v1/referral/edit_split` and `/v1/referral/bind`.
  Orderly's `?ref=CODE` handling is untouched: react-app stores it, ui-connector binds it at
  account creation, so `trade.throne.network/?ref=RAFI` works with no code here.
- `app/throne/banner/economics.ts` (new): preview constants. Taker 4.5 bps, tribute pool 0.8 bps
  (40% of THRONE's 2 bps). Drives only the per-$100k previews and the effective-fee readout;
  Orderly computes the real rebates. **If fees or the commission share change in Orderly One,
  change this file.** Referee discount prefers actuals (Σ referee_rebate / Σ fee) over rates.
- `app/throne/banner/format.ts`, `banner.css` (new): lowercase THRONE voice, mono numbers,
  hairlines, gold/green tokens; responsive (table rows become cards under 900px).
- `app/pages/banner/Layout.tsx`, `Index.tsx` (new): Scaffold shell + SEO title, same pattern as
  Points/Leaderboard.
- `app/main.tsx`: `/banner` route (lazy). `app/utils/config.tsx`: `Banner` menu item (id
  `Banner`, href `/banner`) and a flag tab in the mobile bottom nav when enabled.
  `public/config.js`: `VITE_ENABLED_MENUS` now `Trading,Portfolio,Markets,Leaderboard,Banner`.
  The stock `/rewards/affiliate` route still exists but is not in the nav.
- Not done yet (follow-ups): top-10 crown glyph per trader (needs the public broker leaderboard
  endpoint), trades count / last trade per trader (not in Orderly's referee API), per-row 30d
  volume (same), tx links in the ledger (rebates are internal balance credits, no on-chain tx).
- Operator side (Orderly One → Growth → Affiliates): program enabled, default split 60/40.
  KOL banners are created there (e.g. `RAFI`); they show up on this page for that wallet.

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
