"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "대시보드" },
  { href: "/transactions/new", label: "가계부" },
  { href: "/cards", label: "내 카드" },
];

const isActivePath = (pathname: string, href: string) => {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
};

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 px-5 py-2.5 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <Link href="/" className="group flex w-fit items-center">
          <Image
            src="/logo.png"
            alt="Moniq"
            width={280}
            height={96}
            className="h-12 w-auto object-contain transition group-hover:opacity-80"
            priority
          />
        </Link>

        <nav className="flex gap-2 overflow-x-auto pb-1 text-sm font-medium lg:pb-0">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "shrink-0 rounded-full bg-slate-950 px-4 py-2 text-white shadow-sm"
                    : "shrink-0 rounded-full border border-transparent px-4 py-2 text-slate-600 transition hover:border-slate-200 hover:bg-slate-100 hover:text-slate-950"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
