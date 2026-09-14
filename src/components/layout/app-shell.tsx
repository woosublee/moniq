import { Suspense } from "react";
import { SiteHeader } from "@/components/layout/site-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell">
    <Suspense fallback={<header className="site-header"><div className="site-header-inner site-brand">Moniq</div></header>}><SiteHeader /></Suspense>
    <main id="main-content" className="app-main">{children}</main>
  </div>;
}
