import { getRuntimeConfigArray } from "./runtime-config";
import type { API } from "@orderly.network/types";
import type { ConfigProviderProps } from "@orderly.network/hooks";

/**
 * Orderly symbols are PERP_<BASE>_<QUOTE>. Permissionless ("community") listings
 * created by another broker carry that broker's id as a 4th segment, e.g.
 * PERP_PONS_USDC_mythos. Those books are operated by the listing broker, not by
 * Orderly's shared liquidity, and they duplicate names we already list (a second
 * TSLA at 20x, QQQ, etc.). THRONE hides them.
 */
const isCommunityListing = (symbol: string): boolean =>
  symbol.split("_").length > 3;

/**
 * Create a dataAdapter with symbolList function for filtering symbols
 * based on runtime configuration.
 *
 * Format: Comma-separated list of full symbol names (e.g., "PERP_BTC_USDC,PERP_ETH_USDC")
 * - Only symbols in the list will be included
 * - If empty, all Orderly-native symbols are returned (community listings are always dropped)
 */
export function createSymbolDataAdapter(): NonNullable<
  ConfigProviderProps["dataAdapter"]
> {
  const symbolList = getRuntimeConfigArray("VITE_SYMBOL_LIST");

  return {
    symbolList: (original: API.MarketInfoExt[]) => {
      const native = original.filter((item) => !isCommunityListing(item.symbol));

      if (symbolList.length === 0) {
        return native;
      }

      const symbolSet = new Set(symbolList);
      return native.filter((item) => symbolSet.has(item.symbol));
    },
  };
}
