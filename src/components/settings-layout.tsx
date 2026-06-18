import type { ReactNode } from "react";

export function SettingsSectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
    </div>
  );
}

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-muted-foreground text-sm font-semibold tracking-[0.18em] uppercase">
        {title}
      </h3>
      <div className="divide-border divide-y overflow-hidden rounded-2xl border backdrop-blur-sm">
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex min-h-[72px] items-center justify-between gap-6 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description ? (
          <div className="text-muted-foreground mt-1 text-xs leading-5">{description}</div>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
