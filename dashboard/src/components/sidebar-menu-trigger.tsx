import { cn } from "@/lib/utils";
import { SidebarMenuButton, useSidebar } from "./ui/sidebar";
import { PanelLeftIcon } from "lucide-react";

export function SidebarMenuTrigger({
  className,
  onClick,
  children,
  ...props
}: React.ComponentProps<typeof SidebarMenuButton>) {
  const { toggleSidebar } = useSidebar();

  return (
    <SidebarMenuButton
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
      <span>{children}</span>
    </SidebarMenuButton>
  );
}
