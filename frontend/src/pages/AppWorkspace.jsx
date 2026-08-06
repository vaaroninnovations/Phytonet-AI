// AppWorkspace — /app tabbed dashboard.
// Home tab (always) + N project/module tabs that persist across reloads.
// Tabs stay MOUNTED (display:none when hidden) so state, scroll position,
// and iframe navigation are preserved when switching between them.
import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, authApi } from "@/context/AuthContext";
import { useTabState } from "@/hooks/useTabState";

import { TabBar } from "@/components/workspace/TabBar";
import { HomeTab } from "@/components/workspace/HomeTab";
import { ProjectTab } from "@/components/workspace/ProjectTab";
import { ModuleTab } from "@/components/workspace/ModuleTab";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AppWorkspace() {
  const { user, loading, openModal } = useAuth();
  const navigate = useNavigate();
  const { tabs, activeId, panelSizes, scrollPos,
          openTab, closeTab, activate, setPanelSize, setScrollPos } =
    useTabState(user?.id);

  // Auth guard — bounce guests to home with modal open.
  useEffect(() => {
    if (loading) return;
    if (!user) { openModal("signin"); navigate("/", { replace: true }); }
  }, [user, loading, openModal, navigate]);

  // ─── Actions from Home ──────────────────────────────────────────
  const openProjectTab = useCallback((project) => {
    openTab({
      id: `project:${project.id}`,
      type: "project",
      title: project.title || "Untitled",
      projectId: project.id,
      closable: true,
    });
  }, [openTab]);

  const openModuleTab = useCallback((mod) => {
    openTab({
      id: `module:${mod.key}`,
      type: "module",
      title: mod.title,
      modulePath: mod.path,
      closable: true,
    });
  }, [openTab]);

  const startNewChat = useCallback(async (prompt) => {
    try {
      const { data } = await authApi.post("/research/projects", {
        title: (prompt || "New Research").slice(0, 80),
      });
      // Open new project tab and stash the initial prompt so ProjectTab
      // sends it on first render.
      openTab({
        id: `project:${data.id}`,
        type: "project",
        title: data.title || "New Research",
        projectId: data.id,
        initialPrompt: prompt || null,
        closable: true,
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to start chat");
    }
  }, [openTab]);

  if (loading || !user) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#0B0B18] via-[#141024] to-[#1A0F2E]">
        <Loader2 className="animate-spin text-[#a48bff]" size={26} />
      </div>
    );
  }

  return (
    <div data-testid="app-workspace"
         className="fixed inset-0 flex flex-col bg-gradient-to-br from-[#0B0B18] via-[#141024] to-[#1A0F2E] text-slate-100">
      <TabBar tabs={tabs} activeId={activeId}
              onActivate={activate} onClose={closeTab} />

      <div className="flex-1 min-h-0 min-w-0 relative">
        {tabs.map((t) => {
          const visible = t.id === activeId;
          const style = { display: visible ? "flex" : "none" };
          if (t.type === "home") {
            return (
              <div key={t.id} style={style}
                   className="h-full w-full flex-col absolute inset-0">
                <HomeTab
                  user={user}
                  onStartChat={startNewChat}
                  onOpenProject={openProjectTab}
                  onOpenModule={openModuleTab}
                />
              </div>
            );
          }
          if (t.type === "project") {
            return (
              <div key={t.id} style={style}
                   className="h-full w-full flex-col absolute inset-0">
                <ProjectTab
                  tabId={t.id}
                  projectId={t.projectId}
                  initialPrompt={t.initialPrompt}
                  panelRatio={panelSizes[t.id]}
                  onPanelRatioChange={(r) => setPanelSize(t.id, r)}
                  savedScroll={scrollPos[t.id]}
                  onScrollChange={(key, pos) => setScrollPos(t.id, key, pos)}
                  onTitleChange={(_) => { /* keep tab title stable */ }}
                />
              </div>
            );
          }
          if (t.type === "module") {
            return (
              <div key={t.id} style={style}
                   className="h-full w-full flex-col absolute inset-0">
                <ModuleTab path={t.modulePath} title={t.title} visible={visible} />
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
