import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getSymbol } from "@/utils/storage";
import { RouteOption } from "@orderly.network/types";

export function useNav() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const onRouteChange = useCallback(
    (option: RouteOption) => {
      const searchParamsString = searchParams.toString();
      const queryString = searchParamsString ? `?${searchParamsString}` : "";

      if (option.target === "_blank") {
        window.open(option.href);
        return;
      }

      if (option.href === "/") {
        const symbol = getSymbol();
        navigate(`/perp/${symbol}${queryString}`);
        return;
      }

      const routeMap = {
        //   "/portfolio": "/portfolio",
        "/portfolio/feeTier": "/portfolio/fee",
        "/portfolio/apiKey": "/portfolio/api-key",
        //   "/portfolio/positions": "/portfolio/positions",
        //   "/portfolio/orders": "/portfolio/orders",
        //   "/portfolio/setting": "/portfolio/setting",
      } as Record<string, string>;

      const path = routeMap[option.href] || option.href;

      // THRONE 2026-10-27: SDK round links may carry their own query/hash and ask for a
      // history replace (Up/Down picks the current round and rewrites /prediction in place).
      const hasOwnQuery = path.includes("?") || path.includes("#");
      navigate(hasOwnQuery ? path : `${path}${queryString}`, {
        replace: option.replace,
      });
    },
    [navigate, searchParams]
  );

  return { onRouteChange };
}
