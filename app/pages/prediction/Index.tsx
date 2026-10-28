// THRONE 2026-10-27: Up/Down page. One route for both /prediction (the SDK picks the current
// round and replaces the URL) and /prediction/:symbol (one exact round, pinned by the URL).
// The venue settles rounds off-chain; its Supplemental Terms are linked below the page.
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { PredictionPage } from "@orderly.network/prediction";
import { useFeatureEnabled } from "@orderly.network/react-app";
import { perpRoute } from "@orderly.network/types";
import { useNav } from "@/hooks/useNav";
import { getSymbol } from "@/utils/storage";
import { getPageMeta } from "@/utils/seo";
import { renderSEOTags } from "@/utils/seo-tags";

const TERMS_URL =
  "https://orderly.network/docs/introduction/trade-on-orderly/orderly-predict/supplemental-terms";

export default function PredictionIndex() {
  const { symbol } = useParams();
  const enabled = useFeatureEnabled("prediction");
  const { onRouteChange } = useNav();

  useEffect(() => {
    if (!enabled) {
      onRouteChange(perpRoute(getSymbol(), { replace: true }));
    }
  }, [enabled, onRouteChange]);

  const pageMeta = getPageMeta();

  if (!enabled) return null;

  return (
    <div className="h-full">
      {renderSEOTags(pageMeta, "Up/Down | THRONE")}
      <PredictionPage symbol={symbol} />
      <div className="px-3 pb-3 pt-2 text-center">
        <span className="oui-text-2xs oui-text-base-contrast-36">
          Up/Down rounds settle every 5 minutes on the venue&apos;s BTC index price. Settlement is
          run by the venue off-chain and a round cannot be voided or refunded. No leverage, no
          liquidation. Not available in restricted regions.{" "}
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Terms for Up/Down rounds
          </a>
          .
        </span>
      </div>
    </div>
  );
}
