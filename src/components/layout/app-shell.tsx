import { SiteHeader } from "@/components/layout/site-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-5 py-5 sm:px-8 lg:px-10">
        {children}
      </div>
    </div>
  );
}
