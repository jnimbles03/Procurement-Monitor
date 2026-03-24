import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { LayoutDashboard, List, Search, Settings, BarChart, ShieldAlert, LogOut } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const navigation = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Watchlist", href: "/watchlist", icon: List },
  { title: "Run Scan", href: "/scan", icon: Search },
  { title: "Analytics", href: "/analytics", icon: BarChart },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <Sidebar variant="sidebar" className="border-r border-sidebar-border shadow-xl">
      <SidebarContent className="flex flex-col h-full bg-sidebar">
        
        {/* Header */}
        <div className="p-6 flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-lg text-primary">
            <ShieldAlert className="w-6 h-6 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h2 className="font-display font-bold text-lg text-sidebar-foreground leading-tight">Procurement Monitor</h2>
            <p className="text-xs text-sidebar-foreground/60 font-medium">Public Sector Intelligence</p>
          </div>
        </div>

        {/* Navigation */}
        <SidebarGroup className="flex-1 px-3">
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {navigation.map((item) => {
                const isActive = location === item.href;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      className={`
                        h-11 px-4 rounded-xl transition-all duration-200 hover-elevate active-elevate-2
                        ${isActive 
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm' 
                          : 'text-sidebar-foreground/70 hover:text-sidebar-foreground font-medium'}
                      `}
                    >
                      <Link href={item.href} className="flex items-center gap-3">
                        <item.icon className={`w-5 h-5 ${isActive ? 'text-primary' : ''}`} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border/50 flex flex-col gap-3">
          {user ? (
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                {user.email.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-sidebar-foreground/50 truncate">{user.email}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-sidebar-foreground/50 hover:text-sidebar-foreground shrink-0"
                onClick={logout}
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-sidebar-foreground/60 font-medium">System Active</span>
            </div>
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={style}>
      <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/20">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="relative h-16 flex items-center px-6 bg-background border-b border-border/60 shrink-0 z-20">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors hover-elevate" />
          </header>
          <main className="flex-1 overflow-auto bg-background">
            <div className="max-w-7xl mx-auto w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
