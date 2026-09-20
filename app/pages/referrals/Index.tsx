// THRONE: Referrals page (our referral page; replaces Orderly's Affiliates tab).
import { generatePageTitle } from "@/utils/utils";
import { getPageMeta } from "@/utils/seo";
import { renderSEOTags } from "@/utils/seo-tags";
import ReferralsPage from "@/throne/referrals/ReferralsPage";

export default function ReferralsIndex() {
  const pageMeta = getPageMeta();
  const pageTitle = generatePageTitle("Referrals");
  return (
    <>
      {renderSEOTags(pageMeta, pageTitle)}
      <ReferralsPage />
    </>
  );
}
