/**
 * THRONE desktop layout plugin.
 *
 * Intercepts Orderly's `Trading.Layout.Desktop` target and renders our own grid using the
 * SDK's exported widgets. Widget internals (order validation, submission, streams, TP/SL,
 * leverage dialogs) stay Orderly's; we only own where things sit and how dense they are.
 *
 * Grid (desktop, >= 1024px; mobile layout is untouched):
 *
 *   ┌──────────┬─────────────────────────────┬────────────┬──────────────┐
 *   │          │ symbol bar                  │            │ risk rate    │
 *   │ markets  ├─────────────────────────────┤ orderbook  │ assets       │
 *   │ (left)   │ chart                       │ + trades   │ order entry  │
 *   │          ├─────────────────────────────┴────────────┤              │
 *   │          │ positions / orders / history             │              │
 *   └──────────┴──────────────────────────────────────────┴──────────────┘
 *
 * See docs/THRONE_CHANGES.md.
 */
import { Suspense, useMemo } from "react";
import { createInterceptor } from "@orderly.network/plugin-core";
import type { OrderlyPlugin } from "@orderly.network/plugin-core";
import {
  AssetViewWidget,
  DataListWidget,
  OrderBookAndTradesWidget,
  RiskRateWidget,
} from "@orderly.network/trading";
import type { DesktopLayoutProps } from "@orderly.network/trading";
import { OrderEntryWidget } from "@orderly.network/ui-order-entry";
import {
  SideMarketsWidget,
  SymbolInfoBarFullWidget,
} from "@orderly.network/markets";
import { TradingviewWidget } from "@orderly.network/ui-tradingview";
import { useAccount } from "@orderly.network/hooks";
import { AccountStatusEnum } from "@orderly.network/types";
import "./throne-layout.css";

const MARKETS_W = 236;
const ORDERBOOK_W = 272;
const ORDER_ENTRY_W = 296;
const SYMBOL_BAR_H = 44;
const DATA_LIST_H = 272;

const ThroneDesktopLayout = (props: DesktopLayoutProps) => {
  const { state } = useAccount();
  const connected = state.status >= AccountStatusEnum.Connected;

  const { library_path, ...restTradingViewConfig } = props.tradingViewConfig ?? ({} as any);

  const gridStyle = useMemo(
    () => ({
      gridTemplateColumns: `${MARKETS_W}px minmax(420px, 1fr) ${ORDERBOOK_W}px ${ORDER_ENTRY_W}px`,
      gridTemplateRows: `${SYMBOL_BAR_H}px minmax(360px, 1fr) ${DATA_LIST_H}px`,
    }),
    [],
  );

  return (
    <div className={`throne-desk ${props.className ?? ""}`} style={gridStyle}>
      {/* markets: full height, left */}
      <section className="throne-panel throne-markets oui-trading-markets-container">
        <SideMarketsWidget
          symbol={props.symbol}
          onSymbolChange={props.onSymbolChange}
          panelSize="large"
        />
      </section>

      {/* symbol bar over the chart */}
      <section className="throne-panel throne-symbolbar oui-trading-symbolInfoBar-container">
        <SymbolInfoBarFullWidget
          symbol={props.symbol}
          onSymbolChange={props.onSymbolChange}
          trailing={null}
        />
      </section>

      {/* chart */}
      <section className="throne-panel throne-chart oui-trading-tradingview-container">
        <TradingviewWidget
          symbol={props.symbol}
          {...restTradingViewConfig}
          libraryPath={library_path}
        />
      </section>

      {/* orderbook + last trades: spans symbol bar row and chart row */}
      <section className="throne-panel throne-orderbook oui-trading-orderBook-container">
        <Suspense fallback={null}>
          <OrderBookAndTradesWidget symbol={props.symbol} />
        </Suspense>
      </section>

      {/* right column: risk, assets (when connected), order entry */}
      <aside className="throne-side oui-trading-orderEntry-container">
        {connected && (
          <div className="throne-panel throne-risk oui-trading-riskRate-container">
            <Suspense fallback={null}>
              <RiskRateWidget />
            </Suspense>
          </div>
        )}
        {connected && (
          <div className="throne-panel throne-assets oui-trading-assetsView-container">
            <Suspense fallback={null}>
              <AssetViewWidget isFirstTimeDeposit={props.isFirstTimeDeposit} />
            </Suspense>
          </div>
        )}
        <div className="throne-panel throne-entry">
          <OrderEntryWidget
            symbol={props.symbol}
            disableFeatures={props.disableFeatures as any}
          />
        </div>
      </aside>

      {/* positions / orders / history: under chart + orderbook */}
      <section className="throne-panel throne-datalist oui-trading-dataList-container">
        <Suspense fallback={null}>
          <DataListWidget
            current={undefined}
            symbol={props.symbol}
            sharePnLConfig={props.sharePnLConfig}
          />
        </Suspense>
      </section>
    </div>
  );
};

export const throneLayoutPlugin: OrderlyPlugin = {
  id: "throne-layout",
  name: "THRONE desktop layout",
  version: "0.1.0",
  interceptors: [
    createInterceptor("Trading.Layout.Desktop", (_Original, props) => (
      <ThroneDesktopLayout {...(props as unknown as DesktopLayoutProps)} />
    )),
  ],
};

export default throneLayoutPlugin;
