import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type ApiResponse } from "@/lib/api";

export type WorkspaceOption = { workspace_id: number; workspace_name: string };

type WorkspaceContextValue = {
  workspaces: WorkspaceOption[];
  selectedWorkspaceId: string;
  setSelectedWorkspaceId: (id: string) => void;
  loading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const STORAGE_KEY = "ops-selected-workspace";

function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStored(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceIdState] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api<ApiResponse<{ results?: WorkspaceOption[] } | WorkspaceOption[]>>("/api/workspace/list/")
      .then((data) => {
        if (cancelled) return;
        if (data?.code !== 200 || !data.data) return;
        const list = Array.isArray(data.data) ? data.data : (data.data.results ?? []);
        setWorkspaces(list);
        const stored = readStored();
        if (stored && list.some((w) => String(w.workspace_id) === stored)) {
          setSelectedWorkspaceIdState(stored);
        } else if (list.length > 0) {
          const first = String(list[0].workspace_id);
          setSelectedWorkspaceIdState(first);
          writeStored(first);
        }
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const setSelectedWorkspaceId = useCallback((id: string) => {
    setSelectedWorkspaceIdState(id);
    writeStored(id);
  }, []);

  return (
    <WorkspaceContext.Provider value={{ workspaces, selectedWorkspaceId, setSelectedWorkspaceId, loading }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) return { workspaces: [], selectedWorkspaceId: "", setSelectedWorkspaceId: () => {}, loading: false };
  return ctx;
}
