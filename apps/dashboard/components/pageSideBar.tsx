'use client';

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
} from "@/components/ui/sidebar";
import {
  Mail,
  Home,
  Send,
  FileText,
  User,
  HardDrive,
  Layout,
  Cpu,
  BookOpen,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function PageSideBar() {
  const pathname = usePathname();

  const navigationItems = [
    {
      title: "Overview",
      href: "/",
      icon: Home,
      description: "System overview and stats",
    },
    {
      title: "Workers",
      href: "/workers",
      icon: Cpu,
      description: "Active worker instances",
    },
    {
      title: "Send Mail",
      href: "/send",
      icon: Send,
      description: "Queue a mail job",
    },
    {
      title: "Delivery Logs",
      href: "/logs",
      icon: FileText,
      description: "View delivery history",
    },
    {
      title: "Accounts",
      href: "/accounts",
      icon: User,
      description: "SMTP account management",
    },
    {
      title: "Buckets",
      href: "/buckets",
      icon: HardDrive,
      description: "S3 bucket management",
    },
    {
      title: "Templates",
      href: "/templates",
      icon: Layout,
      description: "Email template management",
    },
    {
      title: "API Docs",
      href: "/api/docs",
      icon: BookOpen,
      description: "Swagger API documentation",
    },
  ];

  return (
    <Sidebar className="w-64 border-r bg-sidebar text-sidebar-foreground">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2">
          <Mail className="h-6 w-6 text-sidebar-primary" />
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-sidebar-foreground">Simple Mailer</h2>
            <p className="text-xs text-sidebar-foreground/70">Operations Panel</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.description}
                    >
                      <Link href={item.href}>
                        <Icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-2 text-xs text-sidebar-foreground/60">
          <p>Simple Mailer v2.0.0</p>
          <p>© 2026 All rights reserved</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
