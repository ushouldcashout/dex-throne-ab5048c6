// THRONE: Banner page (our referral page; replaces Orderly's Affiliates tab).
import { generatePageTitle } from "@/utils/utils";
import { getPageMeta } from "@/utils/seo";
import { renderSEOTags } from "@/utils/seo-tags";
import BannerPage from "@/throne/banner/BannerPage";

export default function BannerIndex() {
  const pageMeta = getPageMeta();
  const pageTitle = generatePageTitle("Banner");
  return (
    <>
      {renderSEOTags(pageMeta, pageTitle)}
      <BannerPage />
    </>
  );
}
