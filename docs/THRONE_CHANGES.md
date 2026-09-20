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
- `package.json`: added direct deps already present in the lockfile as transitive deps
  (`@orderly.network/plugin-core`, `ui-order-entry`, `ui-tradingview`, `ui-positions`,
  `ui-orders`) so the plugin can import them explicitly. Same version 3.2.1, lockfile unchanged.

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
