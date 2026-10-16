import { useState } from "react";
import { Link, useMatch, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ExternalLink,
  Monitor,
  Moon,
  Plus,
  Settings,
  Sun,
  Trash2,
} from "lucide-react";
import { GenerateDialog } from "@/components/GenerateDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme } from "@/context/ThemeProvider";
import { db, deleteCase, type CaseRecord } from "@/lib/db";

const THEMES = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;

export function AppSidebar() {
  const [generating, setGenerating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toDelete, setToDelete] = useState<CaseRecord | null>(null);
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const activeId = useMatch("/cases/:caseId/*")?.params.caseId;

  const cases = useLiveQuery(() =>
    db.cases.orderBy("createdAt").reverse().toArray()
  );
  const runs = useLiveQuery(() => db.runs.toArray());

  const summary = (caseId: number) => {
    const counts: Record<string, number> = {};
    for (const r of runs ?? []) {
      if (r.caseId === caseId) counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([status, n]) => `${n} ${status}`)
      .join(" · ");
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    await deleteCase(toDelete.id);
    if (String(toDelete.id) === activeId) navigate("/");
    setToDelete(null);
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">AetioMed</span>
          <Button size="sm" onClick={() => setGenerating(true)}>
            <Plus data-icon="inline-start" />
            New case
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {cases?.map((c) => (
              <SidebarMenuItem key={c.id}>
                <SidebarMenuButton
                  className="h-auto"
                  isActive={String(c.id) === activeId}
                  render={<Link to={`/cases/${c.id}`} />}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{c.request.diagnosis}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {c.createdAt.toLocaleString([], {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {summary(c.id)}
                    </span>
                  </div>
                </SidebarMenuButton>
                <SidebarMenuAction
                  showOnHover
                  aria-label="Delete case"
                  onClick={() => setToDelete(c)}
                >
                  <Trash2 />
                </SidebarMenuAction>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings data-icon="inline-start" />
            Settings
          </Button>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Theme"
            value={[theme]}
            onValueChange={([v]) => v && setTheme(v as typeof theme)}
          >
            {THEMES.map(({ value, icon: Icon }) => (
              <ToggleGroupItem key={value} value={value} aria-label={value}>
                <Icon />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="justify-start"
          render={
            <a href="http://localhost:3000" target="_blank" rel="noreferrer" />
          }
        >
          <ExternalLink data-icon="inline-start" />
          Grafana
        </Button>
      </SidebarFooter>

      <GenerateDialog open={generating} onOpenChange={setGenerating} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete case?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.request.diagnosis}" and all its runs are removed from
              this browser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
