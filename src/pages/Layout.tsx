import { Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default function Layout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* min-w-0: wide content (graph, compare row) scrolls, not the page. */}
      <SidebarInset className="min-w-0">
        <header className="flex h-12 shrink-0 items-center px-3">
          <SidebarTrigger />
        </header>
        <div className="flex-1 p-4 pt-0">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
