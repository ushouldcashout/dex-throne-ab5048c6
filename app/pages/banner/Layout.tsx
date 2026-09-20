// THRONE: Banner page (referral) shell. Same Scaffold as the other pages so nav/footer match.
import { Outlet } from "react-router-dom";
import { Scaffold } from "@orderly.network/ui-scaffold";
import { useOrderlyConfig } from "@/utils/config";
import { useNav } from "@/hooks/useNav";

export default function BannerLayout() {
  const config = useOrderlyConfig();
  const { onRouteChange } = useNav();

  return (
    <Scaffold
      classNames={{ content: "lg:oui-mb-0", topNavbar: "oui-bg-base-9" }}
      mainNavProps={{
        ...config.scaffold.mainNavProps,
        initialMenu: "/banner",
      }}
      footerProps={config.scaffold.footerProps}
      routerAdapter={{ onRouteChange }}
      bottomNavProps={config.scaffold.bottomNavProps}
    >
      <Outlet />
    </Scaffold>
  );
}
