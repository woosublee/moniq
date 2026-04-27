export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-slate-200 pb-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-600">
            {eyebrow}
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            {title}
          </h1>
          <p className="text-xs leading-5 text-slate-500 sm:text-sm">
            {description}
          </p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}
