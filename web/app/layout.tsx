import type { Metadata } from "next";
import { Geist, Geist_Mono, Oswald } from "next/font/google";
import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

const sans = Geist({ variable: "--font-geist", subsets: ["latin"], weight: "variable", display: "swap" });
const display = Oswald({ variable: "--font-oswald", subsets: ["latin"], weight: "variable", display: "swap" });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], weight: "variable", display: "swap" });

export const metadata: Metadata = {
  title: "YC demo · Certified brain",
  description: "Own your intelligence: a memory (GBrain) whose cached judgments survive prompt and model changes with a statistical certificate, judged and written by models trained on River.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html className={cn(sans.variable, mono.variable, display.variable)} lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange enableSystem>
          <TooltipProvider>
            <SidebarProvider>
              <AppNav />
              <SidebarInset className="min-w-0 text-foreground">{children}</SidebarInset>
            </SidebarProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
