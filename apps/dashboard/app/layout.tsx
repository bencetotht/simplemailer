import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PageSideBar } from "@/components/pageSideBar";
import { SidebarTrigger, SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { ConnectionStatus } from "@/components/connection-status";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Simple Mailer - Dashboard",
  description: "Email management system dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SidebarProvider>
            <div className="flex h-screen w-full">
              <PageSideBar />
              <div className="flex-1 flex flex-col min-w-0">
                <header className="flex h-16 shrink-0 items-center justify-between border-b px-4">
                  <div className="flex items-center gap-2">
                    <SidebarTrigger />
                    <h1 className="text-lg font-semibold">Simple Mailer Dashboard</h1>
                  </div>
                  <div className="flex items-center space-x-4">
                    <ConnectionStatus />
                    <ThemeToggle />
                  </div>
                </header>
                <main className="flex-1 p-4 overflow-auto">
                  {children}
                </main>
              </div>
            </div>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
