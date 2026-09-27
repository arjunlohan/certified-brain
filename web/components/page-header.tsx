import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/** Top bar plus the display-type hero every page opens with. */
export function PageHeader({ crumb, kicker, title, children }: { crumb: string; kicker: string; title: ReactNode; children?: ReactNode }) {
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 px-3">
        <SidebarTrigger />
        <Separator className="mr-1 data-[orientation=vertical]:h-4" orientation="vertical" />
        <h1 className="min-w-0 flex-1 truncate font-medium text-sm">{crumb}</h1>
      </header>
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pt-6 sm:px-6">
        <p className="font-medium text-signal text-xs uppercase tracking-[0.25em]">{kicker}</p>
        <h2 className="font-display font-semibold text-4xl uppercase leading-[0.95] tracking-tight sm:text-5xl">{title}</h2>
        {children ? <div className="max-w-3xl text-muted-foreground text-pretty">{children}</div> : null}
      </div>
    </>
  );
}

export function Section({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.08em]">{eyebrow}</p>
        <h3 className="font-display font-medium text-2xl uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function Stat({ value, label, tone }: { value: ReactNode; label: ReactNode; tone?: "good" | "bad" | "signal" }) {
  const color = tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-destructive" : tone === "signal" ? "text-signal" : "";
  return (
    <div className="rounded-xl border bg-card p-4 shadow-[var(--card-shadow)]">
      <div className={`font-display text-3xl tabular-nums leading-none ${color}`}>{value}</div>
      <div className="mt-2 text-muted-foreground text-xs">{label}</div>
    </div>
  );
}
