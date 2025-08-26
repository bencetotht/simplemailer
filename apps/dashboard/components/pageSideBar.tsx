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
  BarChart3, 
  Settings, 
  FileText, 
  Users, 
  Home,
  Send
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function PageSideBar() {
  const pathname = usePathname();

  const navigationItems = [
    {
      title: "Dashboard",
      href: "/",
      icon: Home,
      description: "Overview and statistics"
    },
    {
      title: "Mail Jobs",
      href: "/jobs",
      icon: Send,
      description: "Manage email campaigns"
    },
    {
      title: "Logs",
      href: "/logs",
      icon: FileText,
      description: "View system logs"
    },
    {
      title: "Analytics",
      href: "/analytics",
      icon: BarChart3,
      description: "Performance metrics"
    },
    {
      title: "Users",
      href: "/users",
      icon: Users,
      description: "User management"
    },
    {
      title: "Settings",
      href: "/settings",
      icon: Settings,
      description: "System configuration"
    }
  ];

  return (
    <Sidebar className="w-64 border-r bg-sidebar text-sidebar-foreground">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2">
          <Mail className="h-6 w-6 text-sidebar-primary" />
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-sidebar-foreground">Simple Mailer</h2>
            <p className="text-xs text-sidebar-foreground/70">Email Management System</p>
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
          <p>Simple Mailer v1.0.0</p>
          <p>© 2024 All rights reserved</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
