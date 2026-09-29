/**
 * THRONE desktop layout plugin.
 *
 * Intercepts Orderly's `Trading.Layout.Desktop` target and renders our own grid using the
 * SDK's exported widgets. Widget internals (order validation, submission, streams, TP/SL,
 * leverage dialogs) stay Orderly's; we only own where things sit and how dense they are.
 *
 * Grid (desktop, >= 1024px; mobile layout is untouched). Like Hyperliquid there is no
 * persistent markets sidebar: the symbol in the symbol bar opens Orderly's markets popout
 * (search, tabs, favourites), so the chart gets the full width.
 *
 *   ┌─────────────────────────────────────────┬────────────┬──────────────┐
 *   │ symbol bar (click symbol → markets)     │            │ risk rate    │
 *   ├─────────────────────────────────────────┤ orderbook  │ assets       │
 *   │ chart                                   │ + trades   │ order entry  │
 *   ├─────────────────────────────────────────┴────────────┤              │
 *   │ positions / orders / history                         │              │
 *   └──────────────────────────────────────────────────────┴──────────────┘
 *
 * The chart / positions boundary is a drag handle (row-resize). Height persists in
 * localStorage under "throne_datalist_h". Founder feedback: the fixed split made the chart
 * impossible to enlarge, and TradingView's own pane divider was too thin to grab.
 *
 * See docs/THRONE_CHANGES.md.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
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
import { SymbolInfoBarFullWidget } from "@orderly.network/markets";
import { TradingviewWidget } from "@orderly.network/ui-tradingview";
import { useAccount } from "@orderly.network/hooks";
import { AccountStatusEnum } from "@orderly.network/types";
import "./throne-layout.css";

const ORDERBOOK_W = 272;
const ORDER_ENTRY_W = 296;
const SYMBOL_BAR_H = 44;
const DATA_LIST_H = 272;
const DATA_LIST_MIN = 120;
const CHART_MIN = 300;
const DATA_LIST_KEY = "throne_datalist_h";

const readDataListH = () => {
  if (typeof window === "undefined") return DATA_LIST_H;
  const v = Number(window.localStorage.getItem(DATA_LIST_KEY));
  return Number.isFinite(v) && v >= DATA_LIST_MIN ? v : DATA_LIST_H;
};

const ThroneDesktopLayout = (props: DesktopLayoutProps) => {
  const { state } = useAccount();
  const connected = state.status >= AccountStatusEnum.Connected;

  const { library_path, ...restTradingViewConfig } = props.tradingViewConfig ?? ({} as any);

  // draggable split between the chart and the positions panel
  const deskRef = useRef<HTMLDivElement>(null);
  const [dataH, setDataH] = useState<number>(readDataListH);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onSplitDown = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startH: dataH };
      setDragging(true);
      (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
    },
    [dataH],
  );
  const onSplitMove = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const total = deskRef.current?.clientHeight ?? 900;
    const max = Math.max(DATA_LIST_MIN, total - SYMBOL_BAR_H - CHART_MIN);
    const next = Math.min(max, Math.max(DATA_LIST_MIN, d.startH + (d.startY - e.clientY)));
    setDataH(next);
  }, []);
  const onSplitUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(DATA_LIST_KEY, String(Math.round(dataH)));
    } catch {
      /* ignore */
    }
  }, [dataH]);
  const resetSplit = useCallback(() => setDataH(DATA_LIST_H), []);

  const gridStyle = useMemo(
    () => ({
      gridTemplateColumns: `minmax(560px, 1fr) ${ORDERBOOK_W}px ${ORDER_ENTRY_W}px`,
      gridTemplateRows: `${SYMBOL_BAR_H}px minmax(${CHART_MIN}px, 1fr) ${Math.round(dataH)}px`,
    }),
    [dataH],
  );

  return (
    <div
      ref={deskRef}
      className={`throne-desk ${dragging ? "is-resizing" : ""} ${props.className ?? ""}`}
      style={gridStyle}
    >
      {/* symbol bar over the chart; the symbol itself opens the markets popout */}
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
        <div
          className="throne-split"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize chart"
          title="Drag to resize the chart. Double-click to reset."
          onPointerDown={onSplitDown}
          onPointerMove={onSplitMove}
          onPointerUp={onSplitUp}
          onPointerCancel={onSplitUp}
          onDoubleClick={resetSplit}
        >
          <span className="throne-split-pill" />
        </div>
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
