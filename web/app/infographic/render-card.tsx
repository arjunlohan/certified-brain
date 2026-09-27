"use client";

import { AlertTriangleIcon, ChevronDownIcon, ExternalLinkIcon, Maximize2Icon, ShieldCheckIcon } from "lucide-react";
import { useState } from "react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type Review = {
  verdict: "publish" | "fix";
  score: number;
  contract: number;
  wrongOrMissing: { expected: string; found: string }[];
  invented: string[];
};

export type Render = { image: string; url?: string; review: Review };

/** One rendered infographic with its vision fact-check, styled like the infographic studio's card. */
export function RenderCard({
  label,
  title,
  meta,
  render,
  tone,
  children,
}: {
  label: string;
  title: string;
  meta: string;
  render: Render;
  tone?: "good" | "bad";
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const r = render.review;
  const src = `/${render.image.replace(/^\/+/, "")}`;
  const wrong = r.wrongOrMissing.length;

  return (
    <figure
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[var(--card-shadow)]",
        tone === "bad" && "border-destructive/50",
        tone === "good" && "border-emerald-600/40 dark:border-emerald-400/40",
      )}
    >
      <figcaption className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">{label}</p>
          <p className="truncate font-display text-base uppercase tracking-wide">{title}</p>
          <p className="text-muted-foreground text-xs">{meta}</p>
        </div>
        <VerdictBadge review={r} />
      </figcaption>

      <AspectRatio ratio={3 / 4}>
        <button
          aria-label={`View ${title} full size`}
          className="group relative block size-full cursor-zoom-in bg-muted focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] focus-visible:outline-none dark:bg-black/40"
          onClick={() => setOpen(true)}
          type="button"
        >
          {/* biome-ignore lint/performance/noImgElement: static render, shown as-is */}
          <img alt={title} className="size-full object-contain" loading="lazy" src={src} />
          <span className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity duration-[var(--duration-fast)] group-focus-visible:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
            <Maximize2Icon className="size-4" />
          </span>
        </button>
      </AspectRatio>

      <div className="flex flex-1 flex-col gap-3 border-t px-4 py-3">
        <div className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
          <span>
            <span className={cn("font-display text-2xl", wrong > 1 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
              {wrong}
            </span>
            <span className="text-muted-foreground"> wrong or missing of {r.contract}</span>
          </span>
          <span className="text-muted-foreground text-xs">score {r.score}/10</span>
        </div>

        {wrong > 0 ? (
          <ul className="space-y-1.5 text-xs">
            {r.wrongOrMissing.map((w) => (
              <li className="rounded-lg bg-muted/60 p-2" key={`${w.expected}|${w.found}`}>
                <span className="text-muted-foreground">expected </span>
                <span className="break-words font-medium">"{w.expected}"</span>
                <br />
                <span className="text-muted-foreground">found </span>
                <span className="break-words font-medium text-destructive">"{w.found}"</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-emerald-600 text-xs dark:text-emerald-400">Every required string found.</p>
        )}

        {r.invented.length > 0 ? (
          <div className="rounded-lg bg-destructive/10 p-2 text-xs">
            <p className="font-medium text-destructive">Not in the spec (stale or invented)</p>
            <ul className="mt-1 space-y-0.5">
              {r.invented.map((s) => (
                <li className="break-words" key={s}>
                  · "{s}"
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">Nothing invented.</p>
        )}

        {children}
      </div>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent
          className="flex max-h-[calc(100dvh-2rem)] w-auto max-w-[calc(100vw-2rem)] flex-col items-center gap-4 border-none bg-transparent p-0 shadow-none sm:max-w-[calc(100vw-4rem)]"
          overlayClassName="bg-black/85 backdrop-blur-sm"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {/* biome-ignore lint/performance/noImgElement: static render, shown as-is */}
          <img alt={title} className="max-h-[calc(100dvh-7rem)] w-auto rounded-lg object-contain" src={src} />
          <div className="flex flex-wrap justify-center gap-2">
            <button className="glass-button" onClick={() => setOpen(false)} type="button">
              Close
            </button>
            {render.url ? (
              <a className="glass-button" href={render.url} rel="noreferrer" target="_blank">
                <ExternalLinkIcon className="size-3.5" />
                Open original
              </a>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </figure>
  );
}

function VerdictBadge({ review }: { review: Review }) {
  const passed = review.verdict === "publish";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-xs tabular-nums",
        passed
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-amber-400/20 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
      )}
    >
      {passed ? <ShieldCheckIcon className="size-3.5" /> : <AlertTriangleIcon className="size-3.5" />}
      {passed ? "Publish" : "Fix"}
      <span className="opacity-70">· {review.score}/10</span>
    </span>
  );
}

/** A collapsible block of monospace text (the edit prompt, a spec). */
export function Reveal({ label, text }: { label: string; text: string }) {
  return (
    <Collapsible className="text-xs">
      <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground">
        <ChevronDownIcon className="size-3.5 transition-transform duration-[var(--duration-fast)] group-data-[state=open]:rotate-180" />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 font-mono text-[11px] leading-relaxed">
          {text}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
