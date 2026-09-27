"use client";

import { BookOpenIcon, ImageIcon, MessagesSquareIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ModeToggle } from "@/components/mode-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const PAGES = [
  { href: "/", label: "How it works", icon: BookOpenIcon },
  { href: "/reuse", label: "Certified reuse", icon: ShieldCheckIcon },
  { href: "/ask", label: "Ask the brain · A/B", icon: MessagesSquareIcon },
  { href: "/infographic", label: "Infographics · A/B", icon: ImageIcon },
] as const;

const REPOS = [
  { href: "https://github.com/arjunlohan/certified-brain", label: "certified-brain" },
  { href: "https://github.com/arjunlohan/gbrain/tree/cycle-contradiction-probe", label: "gbrain fork" },
  { href: "https://github.com/arjunlohan/qm/tree/fix-1452-recall-providers", label: "qm fork" },
] as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    <Sidebar className="border-r-0">
      <SidebarHeader>
        <Link className="flex items-center gap-2 px-2 py-1.5" href="/">
          <span className="flex size-6 items-center justify-center rounded-md bg-sidebar-primary font-display font-semibold text-sidebar-primary-foreground text-sm">
            Y
          </span>
          <span className="font-display text-base uppercase tracking-[0.18em]">YC demo</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Demo</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PAGES.map((p) => (
                <SidebarMenuItem key={p.href}>
                  <SidebarMenuButton asChild isActive={pathname === p.href}>
                    <Link href={p.href}>
                      <p.icon />
                      <span>{p.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Verify it</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {REPOS.map((r) => (
                <SidebarMenuItem key={r.href}>
                  <SidebarMenuButton asChild>
                    <a href={r.href} rel="noreferrer" target="_blank">
                      <span className="font-mono text-xs">{r.label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <ModeToggle />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
