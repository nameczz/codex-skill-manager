import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Archive,
  Box,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CloudDownload,
  Download,
  FilePenLine,
  FolderGit2,
  FolderOpen,
  HardDrive,
  Layers3,
  GitCompareArrows,
  Loader2,
  PlusCircle,
  RefreshCw,
  Save,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
  X
} from "lucide-react";
import type {
  ApiStatus,
  AutoSyncStatus,
  ArchiveCopyStatus,
  GitBranchSyncStatus,
  LocalSkillSource,
  DependencyInstallInfo,
  ResolveConflictResult,
  SkillRow,
  SkillVersion,
  SkillVersionsResponse,
  StatusReport,
  SyncResult,
  UsageHookStatus
} from "./types";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Checkbox } from "./components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Sheet, SheetContent, SheetHeader } from "./components/ui/sheet";
import { Select } from "./components/ui/select";
import { Textarea } from "./components/ui/textarea";

const filters = [
  "all",
  "clean",
  "local_modified",
  "repo_modified",
  "conflict",
  "missing_local",
  "unmanaged"
] as const;

const pageSizes = [10, 20, 50, 100] as const;

type Filter = (typeof filters)[number];
type PageSize = (typeof pageSizes)[number];
type SetupPaths = {
  syncRepo: string;
  codexSkillsDir: string;
  agentsSkillsDir: string;
  cacheDir: string;
};
type SetupPathField = keyof SetupPaths | "setupRoot";
type View = "skills" | "settings" | "archive";
type EditorState = {
  rowKey: string;
  source: LocalSkillSource;
  path: string;
  content: string;
  dirty: boolean;
};
type SkillActionEndpoint = "import" | "install" | "update-local" | "archive" | "remove-local";
type ArchiveRow = {
  id: string;
  name: string;
  description: string;
  archivedAt: string | null;
  archivePath: string;
  archiveCopyStatus: ArchiveCopyStatus;
  status: "archived";
};
type ResolveStrategy = "codex" | "agents" | "repo";
type PendingSkillAction = {
  endpoint: SkillActionEndpoint;
  row: SkillRow;
};

export function App() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [view, setView] = useState<View>("skills");
  const [checkedRowKeys, setCheckedRowKeys] = useState<string[]>([]);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingSkillAction | null>(null);
  const [pendingRestore, setPendingRestore] = useState<ArchiveRow | null>(null);
  const [pendingEditRow, setPendingEditRow] = useState<SkillRow | null>(null);
  const [compareState, setCompareState] = useState<{ row: SkillRow; versions: SkillVersion[] } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [setupRoot, setSetupRoot] = useState("");
  const [setupPaths, setSetupPaths] = useState<SetupPaths>({
    syncRepo: "",
    codexSkillsDir: "",
    agentsSkillsDir: "",
    cacheDir: ""
  });
  const [advancedPathsOpen, setAdvancedPathsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectingPath, setSelectingPath] = useState<SetupPathField | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await fetch("/api/status");
      const payload = (await response.json()) as ApiStatus;
      setStatus(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load status.");
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (status?.configured === false) {
      const defaultRoot = status.defaults.syncRepo;
      setSetupRoot((current) => current || defaultRoot);
      setSetupPaths((current) => ({
        syncRepo: current.syncRepo || defaultRoot,
        codexSkillsDir: current.codexSkillsDir || status.defaults.codexSkillsDir,
        agentsSkillsDir: current.agentsSkillsDir || status.defaults.agentsSkillsDir,
        cacheDir: current.cacheDir || status.defaults.cacheDir
      }));
    } else if (status?.configured === true) {
      setSetupPaths({
        syncRepo: status.config.syncRepo,
        codexSkillsDir: status.config.codexSkillsDir,
        agentsSkillsDir: status.config.agentsSkillsDir,
        cacheDir: status.config.cacheDir
      });
    }
  }, [status]);

  const rows = useMemo(() => {
    if (!status?.configured) {
      return [];
    }

    return buildRows(status.report);
  }, [status]);

  const archiveRows = useMemo(() => {
    if (!status?.configured) {
      return [];
    }

    return buildArchiveRows(status.report);
  }, [status]);
  const configured = status?.configured === true;
  const activeView = configured ? view : "skills";
  const report = configured ? status.report : null;
  const autoSyncStatus = configured ? status.autoSync : null;

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !normalized ||
        row.id.toLowerCase().includes(normalized) ||
        row.name.toLowerCase().includes(normalized) ||
        row.description.toLowerCase().includes(normalized);
      const matchesFilter = filter === "all" || row.syncState === filter;
      return matchesQuery && matchesFilter;
    });
  }, [filter, query, rows]);

  const filteredArchiveRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return archiveRows.filter((row) => {
      const matchesQuery =
        !normalized ||
        row.id.toLowerCase().includes(normalized) ||
        row.name.toLowerCase().includes(normalized) ||
        row.description.toLowerCase().includes(normalized);
      return matchesQuery;
    });
  }, [archiveRows, query]);

  const skillPageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const archivePageCount = Math.max(1, Math.ceil(filteredArchiveRows.length / pageSize));
  const activePageCount = activeView === "archive" ? archivePageCount : skillPageCount;
  const pageCount = activePageCount;
  const currentPageIndex = Math.min(pageIndex, activePageCount - 1);
  const pageRows = useMemo(() => {
    const start = currentPageIndex * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [currentPageIndex, filteredRows, pageSize]);
  const archivePageRows = useMemo(() => {
    const start = currentPageIndex * pageSize;
    return filteredArchiveRows.slice(start, start + pageSize);
  }, [currentPageIndex, filteredArchiveRows, pageSize]);
  const activePageRows = activeView === "archive" ? archivePageRows : pageRows;
  const activeFilteredRows = activeView === "archive" ? filteredArchiveRows : filteredRows;
  const pageStart = activeFilteredRows.length === 0 ? 0 : currentPageIndex * pageSize + 1;
  const pageEnd = activeFilteredRows.length === 0 ? 0 : Math.min(activeFilteredRows.length, pageStart + activePageRows.length - 1);
  const selected = rows.find((row) => rowKey(row) === selectedRowKey) ?? null;
  const editorRow = editorState ? rows.find((row) => rowKey(row) === editorState.rowKey) ?? null : null;
  const selectedRows = useMemo(() => {
    const checked = new Set(checkedRowKeys);
    return rows.filter((row) => checked.has(rowKey(row)));
  }, [checkedRowKeys, rows]);
  const importableSelectedRows = selectedRows.filter(canAddToSync);
  const installableSelectedRows = selectedRows.filter(canInstallLocal);
  const updatableSelectedRows = selectedRows.filter(canUpdateLocal);
  const visibleRowsSelected = activeView === "skills" && pageRows.length > 0 && pageRows.every((row) => checkedRowKeys.includes(rowKey(row)));
  const someVisibleRowsSelected = activeView === "skills" && pageRows.some((row) => checkedRowKeys.includes(rowKey(row)));
  const cleanCount = rows.filter((row) => row.syncState === "clean").length;
  const reviewCount = rows.filter((row) => row.syncState !== "clean").length;
  const setupRepoSelected = setupPaths.syncRepo.trim().length > 0;

  useEffect(() => {
    if (!configured) {
      return;
    }

    const timer = window.setInterval(() => {
      void refresh({ silent: true });
    }, 5000);

    return () => window.clearInterval(timer);
  }, [configured]);

  useEffect(() => {
    if (selectedRowKey && !rows.some((row) => rowKey(row) === selectedRowKey)) {
      setSelectedRowKey(null);
      setDetailOpen(false);
    }
  }, [rows, selectedRowKey]);

  useEffect(() => {
    setPageIndex(0);
  }, [filter, pageSize, query]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [activePageCount]);

  useEffect(() => {
    const availableKeys = new Set(rows.map(rowKey));
    setCheckedRowKeys((current) => current.filter((key) => availableKeys.has(key)));
  }, [rows]);

  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (editorState) {
        setEditorState(null);
      } else if (compareState) {
        setCompareState(null);
      } else if (detailOpen) {
        setDetailOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [compareState, detailOpen, editorState]);

  async function initialize() {
    setError(null);
    setNotice(null);
    if (!setupPaths.syncRepo.trim()) {
      setError("Choose a sync repository before initializing.");
      return;
    }

    setBusyId("init");
    try {
      const response = await fetch("/api/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setupPaths)
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Initialization failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveSettings() {
    setError(null);
    setNotice(null);
    setBusyId("save-config");
    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setupPaths)
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const payload = (await response.json()) as Extract<ApiStatus, { configured: true }>;
      setStatus(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save settings.");
    } finally {
      setBusyId(null);
    }
  }

  function updateSetupRoot(value: string) {
    setSetupRoot(value);
    setSetupPaths((current) => ({
      ...current,
      syncRepo: value
    }));
  }

  async function chooseDirectory(field: SetupPathField, title: string) {
    setError(null);
    setNotice(null);
    setSelectingPath(field);
    try {
      const response = await fetch("/api/select-directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as { canceled: true } | { canceled: false; path: string };
      if (!payload.canceled) {
        if (field === "setupRoot") {
          updateSetupRoot(payload.path);
        } else {
          setSetupPaths((current) => ({ ...current, [field]: payload.path }));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Directory selection failed.");
    } finally {
      setSelectingPath(null);
    }
  }

  function requestSkillAction(endpoint: SkillActionEndpoint, row: SkillRow) {
    if (requiresConfirmation(endpoint)) {
      setPendingAction({ endpoint, row });
      return;
    }

    void runSkillAction(endpoint, row);
  }

  async function runSkillAction(endpoint: SkillActionEndpoint, row: SkillRow): Promise<boolean> {
    setError(null);
    setNotice(null);
    setBusyId(actionBusyId(endpoint, row));
    try {
      const response = await fetch(`/api/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(skillActionBody(row))
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const payload = (await response.json()) as { result?: SyncResult; dependencyInstall?: DependencyInstallInfo };
      const messages: string[] = [];
      if (payload.result) {
        messages.push(syncResultMessage(payload.result));
      }
      if (payload.dependencyInstall) {
        const dependencyMessage = dependencyInstallMessage(payload.dependencyInstall);
        if (dependencyMessage) {
          messages.push(dependencyMessage);
        }
      }
      if (messages.length > 0) {
        setNotice(messages.join(" "));
      }
      await refresh({ silent: true });
      setSelectedRowKey(endpoint === "import" ? `managed:${row.id}` : rowKey(row));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : `${endpoint} failed.`);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction) {
      return;
    }

    const completed = await runSkillAction(pendingAction.endpoint, pendingAction.row);
    if (completed) {
      setPendingAction(null);
    }
  }

  function requestRestore(row: ArchiveRow) {
    setPendingRestore(row);
  }

  async function runRestoreArchived(row: ArchiveRow): Promise<boolean> {
    const busyKey = restoreBusyId(row);
    const payloadForNotice = row.name || row.id;
    setError(null);
    setNotice(null);
    setBusyId(busyKey);
    try {
      const response = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: row.id })
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as { result?: SyncResult };
      if (payload.result) {
        setNotice(syncResultMessage(payload.result));
      } else {
        setNotice(`Restored ${payloadForNotice}.`);
      }

      await refresh({ silent: true });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : `Restore ${payloadForNotice} failed.`);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function confirmPendingRestore() {
    if (!pendingRestore) {
      return;
    }

    const completed = await runRestoreArchived(pendingRestore);
    if (completed) {
      setPendingRestore(null);
    }
  }

  async function runBulkAction(endpoint: "import" | "install" | "update-local", targetRows: SkillRow[]) {
    if (targetRows.length === 0) {
      return;
    }

    setError(null);
    setNotice(null);
    setBusyId(`bulk:${endpoint}`);
    try {
      const response = await fetch("/api/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, skills: targetRows.map(skillActionBody) })
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as { result?: SyncResult; dependencyInstalls?: Array<DependencyInstallInfo & { skillId: string }> };
      const messages: string[] = [];
      if (payload.result) {
        messages.push(syncResultMessage(payload.result));
      }
      const installedDependencyCount = payload.dependencyInstalls?.filter((install) => install.status === "installed").length ?? 0;
      if (installedDependencyCount > 0) {
        messages.push(`Installed dependencies for ${installedDependencyCount} skill${installedDependencyCount === 1 ? "" : "s"}.`);
      }
      if (messages.length > 0) {
        setNotice(messages.join(" "));
      }
      const completedKeys = new Set(targetRows.map(rowKey));
      setCheckedRowKeys((current) => current.filter((key) => !completedKeys.has(key)));
      await refresh({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function pullFromRemote() {
    setError(null);
    setNotice(null);
    setBusyId("pull");
    try {
      const response = await fetch("/api/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      await refresh({ silent: true });
      setNotice("Pulled latest changes from sync repository.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pull failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function installCodexHook() {
    setError(null);
    setNotice(null);
    setBusyId("hook-install");
    try {
      const response = await fetch("/api/codex-hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as { usageHook: UsageHookStatus };
      setStatus((current) => (current?.configured ? { ...current, usageHook: payload.usageHook } : current));
      setNotice(payload.usageHook.needsUpdate ? "Codex usage hook needs another install attempt." : "Codex usage hook installed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to install Codex hook.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeCodexHook() {
    setError(null);
    setNotice(null);
    setBusyId("hook-remove");
    try {
      const response = await fetch("/api/codex-hook", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as { usageHook: UsageHookStatus };
      setStatus((current) => (current?.configured ? { ...current, usageHook: payload.usageHook } : current));
      setNotice("Codex usage hook removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove Codex hook.");
    } finally {
      setBusyId(null);
    }
  }

  function toggleRowChecked(row: SkillRow, checked: boolean) {
    const key = rowKey(row);
    setCheckedRowKeys((current) => {
      if (checked) {
        return current.includes(key) ? current : [...current, key];
      }
      return current.filter((item) => item !== key);
    });
  }

  function requestSkillEditor(row: SkillRow) {
    if (!canEditLocal(row)) {
      return;
    }

    if (row.localSources.length > 1) {
      setPendingEditRow(row);
      return;
    }

    const source = row.localSources[0];
    if (source) {
      void openSkillEditor(row, source);
    }
  }

  async function openSkillEditor(row: SkillRow, source: LocalSkillSource) {
    if (!canEditLocal(row) || !localSourcesForRow(row).includes(source)) {
      return;
    }

    const key = rowKey(row);
    setError(null);
    setNotice(null);
    setBusyId(`editor-open:${key}`);
    try {
      const response = await fetch("/api/skill-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: row.id, source })
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as { path: string; content: string };
      setSelectedRowKey(key);
      setDetailOpen(false);
      setEditorState({ rowKey: key, source, path: payload.path, content: payload.content, dirty: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open SKILL.md.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveSkillEditor(row: SkillRow) {
    const key = rowKey(row);
    if (!editorState || editorState.rowKey !== key) {
      return;
    }

    setError(null);
    setNotice(null);
    setBusyId(`editor-save:${key}`);
    try {
      const response = await fetch("/api/skill-file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: row.id, source: editorState.source, content: editorState.content })
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setEditorState((current) => (current?.rowKey === key ? { ...current, dirty: false } : current));
      await refresh({ silent: true });
      setSelectedRowKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save SKILL.md.");
    } finally {
      setBusyId(null);
    }
  }

  async function openCompareVersions(row: SkillRow) {
    const key = rowKey(row);
    setError(null);
    setNotice(null);
    setBusyId(`compare:${key}`);
    try {
      const response = await fetch("/api/skill-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: row.id })
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as SkillVersionsResponse;
      setCompareState({ row, versions: payload.versions });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load version snapshot.");
    } finally {
      setBusyId(null);
    }
  }

  async function runCompareVersionResolution(strategy: ResolveStrategy) {
    if (!compareState) {
      return;
    }

    await runResolveConflictWithTarget(strategy, compareState.row);
  }

  async function runResolveConflictWithTarget(
    strategy: ResolveStrategy,
    targetRow: SkillRow
  ) {
    const key = rowKey(targetRow);
    setError(null);
    setNotice(null);
    setBusyId(compareResolveBusyId(targetRow, strategy));
    try {
      const response = await fetch("/api/resolve-conflict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: targetRow.id, strategy })
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as ResolveConflictResult;
      if (payload.result) {
        setNotice(syncResultMessage(payload.result));
      } else {
        setNotice(`Resolved ${targetRow.name || targetRow.id} with ${strategy} copy.`);
      }
      setCompareState(null);
      await refresh({ silent: true });
      setSelectedRowKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conflict resolution failed.");
    } finally {
      setBusyId(null);
    }
  }

  function toggleVisibleRows(checked: boolean) {
    const visibleKeys = pageRows.map(rowKey);
    setCheckedRowKeys((current) => {
      if (!checked) {
        return current.filter((key) => !visibleKeys.includes(key));
      }

      const next = new Set(current);
      visibleKeys.forEach((key) => next.add(key));
      return [...next];
    });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark">
            <Layers3 size={18} aria-hidden="true" />
          </div>
          <div>
            <strong>Skill Manager</strong>
            <span>Local sync workbench</span>
          </div>
        </div>

        <nav className="nav-list">
          <Button
            className={activeView === "skills" ? "nav-item active" : "nav-item"}
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setView("skills")}
          >
            <Box size={16} aria-hidden="true" />
            Skills
          </Button>
          <Button className="nav-item disabled" variant="outline" size="sm" type="button" disabled>
            <RefreshCw size={16} aria-hidden="true" />
            Sync
            <span>Planned</span>
          </Button>
          <Button className="nav-item disabled" variant="outline" size="sm" type="button" disabled>
            <Clock3 size={16} aria-hidden="true" />
            Usage
            <span>Planned</span>
          </Button>
          <Button
            className={configured && activeView === "archive" ? "nav-item active" : configured ? "nav-item" : "nav-item disabled"}
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              if (configured) {
                setView("archive");
              }
            }}
            disabled={!configured}
          >
            <Archive size={16} aria-hidden="true" />
            Archive
          </Button>
          <Button
            className={configured && activeView === "settings" ? "nav-item active" : configured ? "nav-item" : "nav-item disabled"}
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              if (configured) {
                setView("settings");
              }
            }}
            disabled={!configured}
          >
            <Settings size={16} aria-hidden="true" />
            Settings
            {!configured ? <span>Planned</span> : null}
          </Button>
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Codex Skill Manager</p>
            <h1>{activeView === "settings" ? "Settings" : activeView === "archive" ? "Archive" : "Skills"}</h1>
          </div>
          <div className="topbar-actions">
            <Button variant="secondary" size="sm" type="button" onClick={() => void refresh()}>
              <RefreshCw size={15} aria-hidden="true" />
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => void pullFromRemote()}
              disabled={!configured || activeView !== "skills" || busyId !== null}
            >
              {busyId === "pull" ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <CloudDownload size={15} aria-hidden="true" />}
              Pull
            </Button>
            {autoSyncStatus ? <AutoSyncIndicator status={autoSyncStatus} /> : null}
          </div>
        </header>

        {error ? (
          <div className="notice error" role="alert">
            <CircleAlert size={17} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {notice ? (
          <div className="notice success" role="status">
            <CheckCircle2 size={17} aria-hidden="true" />
            <span>{notice}</span>
          </div>
        ) : null}

        {!configured && !loading ? (
          <section className="setup-panel" aria-labelledby="setup-title">
            <Card className="setup-copy">
              <CardHeader>
                <p className="eyebrow">Setup required</p>
                <CardTitle id="setup-title">Initialize a local sync repository</CardTitle>
                <CardDescription>
                  Choose the Git-backed sync repository for your skills. Codex will still read installed skills from
                  its local runtime folder, and cache stays outside Git by default.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="setup-fields">
                  <PathInput
                    id="setup-root-path"
                    label="Sync repository directory"
                    value={setupRoot}
                    onChange={updateSetupRoot}
                    onChoose={() => void chooseDirectory("setupRoot", "Choose a sync repository directory")}
                    choosing={selectingPath === "setupRoot"}
                    placeholder="Choose a folder before initializing"
                  />
                  <div className="setup-derived" aria-label="Derived setup paths">
                    <PathSummary label="Will be committed" value={setupPaths.syncRepo || "Not selected"} />
                    <PathSummary label="Codex skills" value={setupPaths.codexSkillsDir} />
                    <PathSummary label="Agents skills" value={setupPaths.agentsSkillsDir} />
                    <PathSummary label="Local cache" value={setupPaths.cacheDir} />
                  </div>
                  <Button
                    variant="ghost"
                    className="advanced-toggle"
                    type="button"
                    aria-expanded={advancedPathsOpen}
                    onClick={() => setAdvancedPathsOpen((open) => !open)}
                  >
                    {advancedPathsOpen ? "Hide advanced paths" : "Advanced paths"}
                  </Button>
                  {advancedPathsOpen ? (
                    <div className="advanced-paths">
                      <PathInput
                        id="sync-repo-path"
                        label="Git sync repository"
                        value={setupPaths.syncRepo}
                        onChange={(value) => setSetupPaths((current) => ({ ...current, syncRepo: value }))}
                        onChoose={() => void chooseDirectory("syncRepo", "Choose a sync repository directory")}
                        choosing={selectingPath === "syncRepo"}
                      />
                      <PathInput
                        id="codex-skills-path"
                        label="Codex skills directory"
                        value={setupPaths.codexSkillsDir}
                        onChange={(value) => setSetupPaths((current) => ({ ...current, codexSkillsDir: value }))}
                        onChoose={() => void chooseDirectory("codexSkillsDir", "Choose a Codex skills directory")}
                        choosing={selectingPath === "codexSkillsDir"}
                      />
                      <PathInput
                        id="agents-skills-path"
                        label="Agents skills directory"
                        value={setupPaths.agentsSkillsDir}
                        onChange={(value) => setSetupPaths((current) => ({ ...current, agentsSkillsDir: value }))}
                        onChoose={() => void chooseDirectory("agentsSkillsDir", "Choose an Agents skills directory")}
                        choosing={selectingPath === "agentsSkillsDir"}
                      />
                      <PathInput
                        id="cache-path"
                        label="Local cache directory"
                        value={setupPaths.cacheDir}
                        onChange={(value) => setSetupPaths((current) => ({ ...current, cacheDir: value }))}
                        onChoose={() => void chooseDirectory("cacheDir", "Choose a local cache directory")}
                        choosing={selectingPath === "cacheDir"}
                      />
                    </div>
                  ) : null}
                  <p className="setup-note">
                    Choose a sync repository to enable Initialize. Advanced paths are for non-default Codex installs and
                    testing.
                  </p>
                </div>
              </CardContent>
            </Card>
            <Button variant="primary" type="button" onClick={() => void initialize()} disabled={busyId === "init" || !setupRepoSelected}>
              {busyId === "init" ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <FolderGit2 size={15} aria-hidden="true" />}
              Initialize
            </Button>
          </section>
        ) : null}

        {configured && activeView === "settings" ? (
          <SettingsPanel
            paths={setupPaths}
            usageHook={status.usageHook}
            busyId={busyId}
            selectingPath={selectingPath}
            onPathChange={(field, value) => setSetupPaths((current) => ({ ...current, [field]: value }))}
            onChoose={(field, title) => void chooseDirectory(field, title)}
            onSave={() => void saveSettings()}
            onInstallHook={() => void installCodexHook()}
            onRemoveHook={() => void removeCodexHook()}
          />
        ) : null}

        {configured && activeView === "skills" ? (
          <Card className="skill-panel">
            <section className="repo-strip" aria-label="Repository status">
              <StatusTile label="Tracked" value={String(report?.managed.length ?? 0)} />
              <StatusTile label="In sync" value={String(cleanCount)} tone="good" />
              <StatusTile label="Needs action" value={String(reviewCount)} tone={reviewCount > 0 ? "risk" : "neutral"} />
              <div className="path-stack">
                <div className="path-stack-lines">
                  <PathLine icon={<FolderGit2 size={14} aria-hidden="true" />} label="Sync repo" value={report?.syncRepo ?? ""} />
                  <PathLine icon={<HardDrive size={14} aria-hidden="true" />} label="Codex skills" value={report?.codexSkillsDir ?? ""} />
                  <PathLine icon={<HardDrive size={14} aria-hidden="true" />} label="Agents skills" value={report?.agentsSkillsDir ?? ""} />
                </div>
                <div className="path-stack-controls">
                  <BranchSyncBadge status={status.gitBranchStatus} />
                  <Button className="path-stack-action" variant="secondary" size="sm" type="button" onClick={() => setView("settings")}>
                    <Settings size={14} aria-hidden="true" />
                    Change paths
                  </Button>
                </div>
              </div>
            </section>

            <section className="toolbar" aria-label="Skill filters">
              <label className="search-box">
                <Search size={16} aria-hidden="true" />
                <span className="sr-only">Search skills</span>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search skills"
                  autoComplete="off"
                />
              </label>

              <label className="filter-select">
                <span>State</span>
                <Select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label="Filter by state">
                  {filters.map((item) => (
                    <option key={item} value={item}>
                      {filterLabel(item)}
                    </option>
                  ))}
                </Select>
              </label>
            </section>

            {checkedRowKeys.length > 0 ? (
              <section className="bulk-bar" aria-label="Bulk actions">
                <div className="bulk-summary">
                  <strong>{selectedRows.length}</strong>
                  <span>{selectedRows.length === 1 ? "skill selected" : "skills selected"}</span>
                </div>
                <Button
                  className="button secondary"
                  type="button"
                  onClick={() => void runBulkAction("import", importableSelectedRows)}
                  disabled={busyId !== null || importableSelectedRows.length === 0}
                >
                  {busyId === "bulk:import" ? <Loader2 className="spin" size={14} aria-hidden="true" /> : <PlusCircle size={14} aria-hidden="true" />}
                  Add to sync ({importableSelectedRows.length})
                </Button>
                <Button
                  className="button secondary"
                  type="button"
                  onClick={() => void runBulkAction("install", installableSelectedRows)}
                  disabled={busyId !== null || installableSelectedRows.length === 0}
                >
                  {busyId === "bulk:install" ? <Loader2 className="spin" size={14} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
                  Install local ({installableSelectedRows.length})
                </Button>
                <Button
                  className="button secondary"
                  type="button"
                  onClick={() => void runBulkAction("update-local", updatableSelectedRows)}
                  disabled={busyId !== null || updatableSelectedRows.length === 0}
                >
                  {busyId === "bulk:update-local" ? (
                    <Loader2 className="spin" size={14} aria-hidden="true" />
                  ) : (
                    <Download size={14} aria-hidden="true" />
                  )}
                  Update local ({updatableSelectedRows.length})
                </Button>
                <Button className="button ghost" variant="ghost" size="sm" type="button" onClick={() => setCheckedRowKeys([])} disabled={busyId !== null}>
                  <X size={14} aria-hidden="true" />
                  Clear
                </Button>
                <span className="bulk-note">Only supported actions are enabled.</span>
              </section>
            ) : null}

            <section className="skill-list" aria-label="Skills">
              <div className="skill-table-scroll">
                <div className="table-head" role="row">
                  <span className="select-cell">
                    <SelectAllCheckbox
                      checked={visibleRowsSelected}
                      mixed={someVisibleRowsSelected && !visibleRowsSelected}
                      onChange={toggleVisibleRows}
                    />
                  </span>
                  <span>Name</span>
                  <span>Source</span>
                  <span>State</span>
                  <span>Local copy</span>
                  <span>Last used</span>
                  <span>Action</span>
                </div>

                {loading ? <SkeletonRows /> : null}

                {!loading && filteredRows.length === 0 ? (
                  <div className="empty-state">
                    <h2>No skills match this view</h2>
                    <p>Clear the search or switch filters to see available local and managed skills.</p>
                  </div>
                ) : null}

                {!loading &&
                  pageRows.map((row) => (
                    <div
                      tabIndex={0}
                      className={selected && rowKey(selected) === rowKey(row) ? "skill-row selected" : "skill-row"}
                      key={rowKey(row)}
                      onClick={() => {
                        setSelectedRowKey(rowKey(row));
                        setDetailOpen(true);
                      }}
                      onKeyDown={(event) =>
                        selectRowWithKeyboard(event, rowKey(row), (key) => {
                          setSelectedRowKey(key);
                          setDetailOpen(true);
                        })
                      }
                    >
                      <label className="row-checkbox" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={checkedRowKeys.includes(rowKey(row))}
                          onChange={(event) => toggleRowChecked(row, event.target.checked)}
                          aria-label={`Select ${row.name || row.id}`}
                        />
                      </label>
                      <span className="skill-main">
                        <strong>{row.name || row.id}</strong>
                        <small>{row.id}</small>
                      </span>
                      <span>
                        <Badge variant="outline" className={`source-badge ${row.source}`}>
                          {sourceLabel(row.source)}
                        </Badge>
                      </span>
                      <SyncBadge state={row.syncState} />
                      <span className={row.installed ? "install-state installed" : "install-state"}>
                        {row.installed ? "Installed" : "Missing"}
                      </span>
                      <span>{formatLastUsed(row.lastUsedAt)}</span>
                      <RowAction
                        row={row}
                        busyId={busyId}
                        onAction={requestSkillAction}
                        onEdit={requestSkillEditor}
                        onCompare={() => void openCompareVersions(row)}
                      />
                    </div>
                  ))}
              </div>
              <div className="pagination-bar" aria-label="Skill table pagination">
                <div className="pagination-summary">
                  <strong>{filteredRows.length === 0 ? "0" : `${pageStart}-${pageEnd}`}</strong>
                  <span>of {filteredRows.length}</span>
                </div>
                <label className="page-size-select">
                  <span>Rows</span>
                  <Select
                    value={String(pageSize)}
                    onChange={(event) => setPageSize(Number(event.target.value) as PageSize)}
                    aria-label="Rows per page"
                  >
                    {pageSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </Select>
                </label>
                <div className="pagination-actions">
                  <Button
                    variant="secondary"
                    size="icon"
                    type="button"
                    onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                    disabled={loading || filteredRows.length === 0 || currentPageIndex === 0}
                    aria-label="Previous page"
                    title="Previous page"
                  >
                    <ChevronLeft size={15} aria-hidden="true" />
                  </Button>
                  <span className="pagination-page">
                    Page {currentPageIndex + 1} / {pageCount}
                  </span>
                  <Button
                    variant="secondary"
                    size="icon"
                    type="button"
                    onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
                    disabled={loading || filteredRows.length === 0 || currentPageIndex >= pageCount - 1}
                    aria-label="Next page"
                    title="Next page"
                  >
                    <ChevronRight size={15} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </section>
          </Card>
        ) : null}

        {configured && activeView === "archive" ? (
          <Card className="skill-panel">
            <section className="repo-strip" aria-label="Archive status">
              <StatusTile label="Archived" value={String(report?.archived.length ?? 0)} tone="neutral" />
              <StatusTile
                label="Copy present"
                value={String(report?.archived.filter((row) => row.archiveCopyStatus === "present").length ?? 0)}
                tone="good"
              />
              <StatusTile
                label="Copy missing"
                value={String(report?.archived.filter((row) => row.archiveCopyStatus === "missing").length ?? 0)}
                tone="risk"
              />
              <div className="path-stack">
                <div className="path-stack-lines">
                  <PathLine icon={<FolderGit2 size={14} aria-hidden="true" />} label="Sync repo" value={report?.syncRepo ?? ""} />
                  <PathLine icon={<Archive size={14} aria-hidden="true" />} label="Archive root" value={report?.syncRepo ? `${report.syncRepo}/archive` : ""} />
                </div>
                <div className="path-stack-controls">
                  <BranchSyncBadge status={status.gitBranchStatus} />
                </div>
              </div>
            </section>

            <section className="toolbar" aria-label="Archive filters">
              <label className="search-box">
                <Search size={16} aria-hidden="true" />
                <span className="sr-only">Search archived skills</span>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search archived skills"
                  autoComplete="off"
                />
              </label>
            </section>

            <section className="skill-list" aria-label="Archived skills">
              <div className="skill-table-scroll">
                <div className="table-head archive-table-head" role="row">
                  <span>Name</span>
                  <span>Archived at</span>
                  <span>Archive path</span>
                  <span>Copy</span>
                  <span>Action</span>
                </div>

                {loading ? <SkeletonRows /> : null}

                {!loading && filteredArchiveRows.length === 0 ? (
                  <div className="empty-state">
                    <h2>No archived skills</h2>
                    <p>When you archive a tracked skill, it appears here.</p>
                  </div>
                  ) : null}

                {!loading &&
                  archivePageRows.map((row) => (
                    <div className="skill-row archive-row" key={`archive:${row.id}`} tabIndex={0}>
                      <span className="skill-main">
                        <strong>{row.name || row.id}</strong>
                        <small>{row.id}</small>
                      </span>
                      <span>{formatArchiveDate(row.archivedAt)}</span>
                      <code>{row.archivePath}</code>
                      <ArchiveCopyBadge status={row.archiveCopyStatus} />
                      <span className="row-actions">
                        <ActionIconButton
                          label={`Restore ${row.name || row.id}`}
                          busy={busyId === restoreBusyId(row)}
                          disabled={busyId !== null && busyId !== restoreBusyId(row)}
                          icon={<RotateCcw size={14} aria-hidden="true" />}
                          onClick={() => requestRestore(row)}
                        />
                      </span>
                    </div>
                  ))}
              </div>
              <div className="pagination-bar" aria-label="Archived skill pagination">
                <div className="pagination-summary">
                  <strong>{filteredArchiveRows.length === 0 ? "0" : `${pageStart}-${pageEnd}`}</strong>
                  <span>of {filteredArchiveRows.length}</span>
                </div>
                <label className="page-size-select">
                  <span>Rows</span>
                  <Select
                    value={String(pageSize)}
                    onChange={(event) => setPageSize(Number(event.target.value) as PageSize)}
                    aria-label="Rows per page"
                  >
                    {pageSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </Select>
                </label>
                <div className="pagination-actions">
                  <Button
                    variant="secondary"
                    size="icon"
                    type="button"
                    onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                    disabled={loading || filteredArchiveRows.length === 0 || currentPageIndex === 0}
                    aria-label="Previous page"
                    title="Previous page"
                  >
                    <ChevronLeft size={15} aria-hidden="true" />
                  </Button>
                  <span className="pagination-page">
                    Page {currentPageIndex + 1} / {pageCount}
                  </span>
                  <Button
                    variant="secondary"
                    size="icon"
                    type="button"
                    onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
                    disabled={loading || filteredArchiveRows.length === 0 || currentPageIndex >= pageCount - 1}
                    aria-label="Next page"
                    title="Next page"
                  >
                    <ChevronRight size={15} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </section>
          </Card>
        ) : null}
      </main>

      {configured && activeView === "skills" && detailOpen && selected ? (
        <DetailDrawer selected={selected} onClose={() => setDetailOpen(false)} />
      ) : null}

      {configured && activeView === "skills" && editorState && editorRow ? (
        <SkillEditorDrawer
          row={editorRow}
          editorState={editorState}
          busyId={busyId}
          onSave={saveSkillEditor}
          onClose={() => setEditorState(null)}
          onChange={(content) => {
            setEditorState((current) => (current ? { ...current, content, dirty: true } : current));
          }}
        />
      ) : null}

      <ConfirmActionDialog
        action={pendingAction}
        busyId={busyId}
        onClose={() => setPendingAction(null)}
        onConfirm={() => void confirmPendingAction()}
      />

      <EditSourceDialog
        row={pendingEditRow}
        busyId={busyId}
        onClose={() => setPendingEditRow(null)}
        onChoose={(row, source) => {
          setPendingEditRow(null);
          void openSkillEditor(row, source);
        }}
      />

      <CompareVersionsDialog
        state={compareState}
        busyId={busyId}
        onClose={() => setCompareState(null)}
        onAcceptVersion={runCompareVersionResolution}
      />

      <RestoreArchiveDialog
        row={pendingRestore}
        busyId={busyId}
        onClose={() => setPendingRestore(null)}
        onConfirm={() => void confirmPendingRestore()}
      />
    </div>
  );
}

function SettingsPanel({
  paths,
  usageHook,
  busyId,
  selectingPath,
  onPathChange,
  onChoose,
  onSave,
  onInstallHook,
  onRemoveHook
}: {
  paths: SetupPaths;
  usageHook: UsageHookStatus;
  busyId: string | null;
  selectingPath: SetupPathField | null;
  onPathChange: (field: keyof SetupPaths, value: string) => void;
  onChoose: (field: keyof SetupPaths, title: string) => void;
  onSave: () => void;
  onInstallHook: () => void;
  onRemoveHook: () => void;
}) {
  const saving = busyId === "save-config";
  const installingHook = busyId === "hook-install";
  const removingHook = busyId === "hook-remove";

  return (
    <div className="settings-stack">
      <Card className="settings-panel" aria-labelledby="settings-title">
        <CardHeader className="settings-head">
          <div>
            <p className="eyebrow">Local configuration</p>
            <CardTitle id="settings-title">Paths</CardTitle>
          </div>
          <Button variant="primary" type="button" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <FolderGit2 size={15} aria-hidden="true" />}
            Save paths
          </Button>
        </CardHeader>

        <CardContent className="settings-paths">
          <PathSetting
            title="Git sync repository"
            body="Tracked by Git. Skills, metadata, and future sync commits live here."
            input={
              <PathInput
                id="settings-sync-repo-path"
                label="Path"
                value={paths.syncRepo}
                onChange={(value) => onPathChange("syncRepo", value)}
                onChoose={() => onChoose("syncRepo", "Choose a sync repository directory")}
                choosing={selectingPath === "syncRepo"}
              />
            }
          />
          <details className="advanced-settings">
            <summary>Advanced local paths</summary>
            <div className="advanced-settings-body">
              <PathSetting
                title="Codex skills directory"
                body="Local Codex skills on this machine. Usually ~/.codex/skills."
                input={
                  <PathInput
                    id="settings-codex-skills-path"
                    label="Path"
                    value={paths.codexSkillsDir}
                    onChange={(value) => onPathChange("codexSkillsDir", value)}
                    onChoose={() => onChoose("codexSkillsDir", "Choose a Codex skills directory")}
                    choosing={selectingPath === "codexSkillsDir"}
                  />
                }
              />
              <PathSetting
                title="Agents skills directory"
                body="Local skills used by the agents skill system. Usually ~/.agents/skills."
                input={
                  <PathInput
                    id="settings-agents-skills-path"
                    label="Path"
                    value={paths.agentsSkillsDir}
                    onChange={(value) => onPathChange("agentsSkillsDir", value)}
                    onChoose={() => onChoose("agentsSkillsDir", "Choose an Agents skills directory")}
                    choosing={selectingPath === "agentsSkillsDir"}
                  />
                }
              />
              <PathSetting
                title="Local cache directory"
                body="Local-only app state. Defaults to ~/.codex-skill-manager/cache and is never meant for Git sync."
                input={
                  <PathInput
                    id="settings-cache-path"
                    label="Path"
                    value={paths.cacheDir}
                    onChange={(value) => onPathChange("cacheDir", value)}
                    onChoose={() => onChoose("cacheDir", "Choose a local cache directory")}
                    choosing={selectingPath === "cacheDir"}
                  />
                }
              />
            </div>
          </details>
        </CardContent>
      </Card>

      <Card className="settings-panel" aria-labelledby="usage-hook-title">
        <CardHeader className="settings-head">
          <div>
            <p className="eyebrow">Usage tracking</p>
            <CardTitle id="usage-hook-title">Codex hook</CardTitle>
          </div>
          <div className="settings-actions">
            <Button
              variant="primary"
              type="button"
              onClick={onInstallHook}
              disabled={installingHook || removingHook || !usageHook.installable}
            >
              {installingHook ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}
              {usageHook.installed ? (usageHook.needsUpdate ? "Update hook" : "Reinstall hook") : "Install hook"}
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={onRemoveHook}
              disabled={installingHook || removingHook || !usageHook.installed}
            >
              {removingHook ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
              Remove
            </Button>
          </div>
        </CardHeader>

        <CardContent className="settings-paths">
          <div className="hook-summary">
            <Badge variant={usageHook.installed && !usageHook.needsUpdate ? "success" : "warning"}>
              {usageHook.installed ? (usageHook.needsUpdate ? "Update available" : "Installed") : "Not installed"}
            </Badge>
            <p>
              Records explicit skill file mentions from Codex prompts through a UserPromptSubmit hook. It writes only the
              skill id and timestamp to the sync repository usage log.
            </p>
          </div>
          {usageHook.reason ? <p className="hook-warning">{usageHook.reason}</p> : null}
          <PathSetting
            title="Hook config"
            body="Skill Manager merges one UserPromptSubmit command into this file and leaves other hooks in place."
            input={<ReadOnlyCode value={usageHook.hooksPath} />}
          />
          <PathSetting
            title="Command"
            body="Codex will ask you to trust this hook before it runs."
            input={<ReadOnlyCode value={usageHook.command || usageHook.installedCommand || "Build the CLI before installing."} />}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ReadOnlyCode({ value }: { value: string }) {
  return <code className="readonly-code">{value}</code>;
}

function PathSetting({ title, body, input }: { title: string; body: string; input: ReactNode }) {
  return (
    <div className="path-setting">
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      {input}
    </div>
  );
}

function PathInput({
  id,
  label,
  value,
  onChange,
  onChoose,
  choosing,
  placeholder
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onChoose: () => void;
  choosing: boolean;
  placeholder?: string;
}) {
  return (
    <div className="path-input">
      <label htmlFor={id}>{label}</label>
      <div className="path-input-row">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          spellCheck={false}
        />
        <Button className="button secondary path-choose" variant="secondary" size="sm" type="button" onClick={onChoose} disabled={choosing}>
          {choosing ? <Loader2 className="spin" size={14} aria-hidden="true" /> : <FolderOpen size={14} aria-hidden="true" />}
          Choose
        </Button>
      </div>
    </div>
  );
}

function PathSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="path-summary">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function SelectAllCheckbox({
  checked,
  mixed,
  onChange
}: {
  checked: boolean;
  mixed: boolean;
  onChange: (checked: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = mixed;
    }
  }, [mixed]);

  return (
    <Checkbox
      ref={inputRef}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      aria-label="Select visible skills"
      aria-checked={mixed ? "mixed" : checked}
    />
  );
}

function buildArchiveRows(report: StatusReport): ArchiveRow[] {
  return report.archived
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      archivedAt: skill.archivedAt,
      archivePath: skill.archivePath ?? `${report.syncRepo}/archive/${skill.id}`,
      archiveCopyStatus: skill.archiveCopyStatus ?? "missing",
      status: "archived" as const
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function buildRows(report: StatusReport): SkillRow[] {
  const managed: SkillRow[] = report.managed.map((skill) => {
    const localSources = normalizeLocalSources(skill.localSources ?? (skill.localSource ? [skill.localSource] : []));
    return {
      kind: "managed",
      id: skill.id,
      name: skill.name,
      description: skill.description,
      status: skill.status,
      syncState: skill.syncState,
      installed: skill.installed,
      source: sourceForLocalSources(localSources, skill.installed ? "codex" : "repo"),
      localSources,
      localCopiesDiffer: skill.localCopiesDiffer ?? false,
      repoHash: skill.currentRepoHash,
      localHash: skill.currentLocalHash,
      lastUsedAt: skill.lastUsedAt,
      repoPath: `${report.syncRepo}/skills/${skill.id}`,
      localPath: formatLocalPaths(report, skill.id, localSources),
      localModifiedAt: skill.localModifiedAt ?? null
    };
  });

  const unmanaged: SkillRow[] = groupUnmanagedRows(report);

  const repoOnly: SkillRow[] = report.repoOnly.map((skill) => ({
    kind: "repo-only",
    id: skill.id,
    name: skill.name,
    description: skill.description,
      syncState: "repo_only",
      source: "repo",
      localSources: [],
      localCopiesDiffer: false,
      installed: false,
    repoHash: skill.hash,
    localHash: null,
    lastUsedAt: null,
    repoPath: skill.path,
    localPath: null,
    localModifiedAt: null
  }));

  return [...managed, ...unmanaged, ...repoOnly].sort((a, b) => a.id.localeCompare(b.id));
}

function localRootForSource(report: StatusReport, source: LocalSkillSource): string {
  return source === "agents" ? report.agentsSkillsDir : report.codexSkillsDir;
}

function groupUnmanagedRows(report: StatusReport): SkillRow[] {
  const grouped = new Map<string, typeof report.unmanagedLocal>();
  for (const skill of report.unmanagedLocal) {
    const existing = grouped.get(skill.id) ?? [];
    existing.push(skill);
    grouped.set(skill.id, existing);
  }

  return [...grouped.values()].map((skills) => {
    const preferred = skills.find((skill) => skill.source === "codex") ?? skills[0];
    const localSources = normalizeLocalSources(
      skills
        .map((skill) => skill.source)
        .filter((source): source is LocalSkillSource => source === "codex" || source === "agents")
    );

    return {
      kind: "unmanaged",
      id: preferred.id,
      name: preferred.name,
      description: preferred.description,
      syncState: "unmanaged",
      source: sourceForLocalSources(localSources, "codex"),
      localSources,
      localCopiesDiffer: localCandidateHashes(skills).length > 1,
      installed: true,
      repoHash: null,
      localHash: preferred.hash,
      lastUsedAt: null,
      repoPath: null,
      localPath: skills
        .map((skill) => `${sourceLabel(skill.source === "agents" ? "agents" : "codex")}: ${skill.path}`)
        .join("\n"),
      localModifiedAt: latestScannedModifiedAt(skills)
    };
  });
}

function latestScannedModifiedAt(skills: Array<{ modifiedAt: string }>): string | null {
  if (skills.length === 0) {
    return null;
  }

  return skills.map((skill) => skill.modifiedAt).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

function localCandidateHashes(skills: Array<{ hash: string }>): string[] {
  return [...new Set(skills.map((skill) => skill.hash))];
}

function normalizeLocalSources(sources: LocalSkillSource[]): LocalSkillSource[] {
  return [...new Set(sources)].sort((a, b) => a.localeCompare(b));
}

function sourceForLocalSources(sources: LocalSkillSource[], fallback: LocalSkillSource | "repo"): SkillRow["source"] {
  if (sources.length > 1) {
    return "both";
  }

  return sources[0] ?? fallback;
}

function formatLocalPaths(report: StatusReport, skillId: string, sources: LocalSkillSource[]): string {
  if (sources.length === 0) {
    return "Missing on this machine";
  }

  return sources.map((source) => `${sourceLabel(source)}: ${localRootForSource(report, source)}/${skillId}`).join("\n");
}

function rowKey(row: SkillRow) {
  return `${row.kind}:${row.id}`;
}

function canAddToSync(row: SkillRow) {
  return row.kind === "unmanaged";
}

function canInstallLocal(row: SkillRow) {
  return row.kind === "managed" && row.syncState === "missing_local" && !row.installed && Boolean(row.repoHash);
}

function canUpdateLocal(row: SkillRow) {
  return row.kind === "managed" && row.syncState === "repo_modified";
}

function canCompareVersions(row: SkillRow) {
  return row.kind === "managed" && row.syncState === "conflict";
}

function canEditLocal(row: SkillRow) {
  return row.installed && row.localSources.length > 0;
}

function canArchive(row: SkillRow) {
  return row.kind === "managed";
}

function canRemoveLocal(row: SkillRow) {
  return row.installed && row.localSources.length > 0;
}

function localSourcesForRow(row: SkillRow): LocalSkillSource[] {
  return [...row.localSources] as LocalSkillSource[];
}

function skillActionBody(row: SkillRow): { skillId: string; source?: LocalSkillSource } {
  return row.localSources.length === 1 ? { skillId: row.id, source: row.localSources[0] } : { skillId: row.id };
}

function syncResultMessage(result: SyncResult) {
  if (result.skillIds.length === 0) {
    if (result.committed && result.commitHash) {
      return `Synced repository changes. Commit ${result.commitHash} was pushed.`;
    }

    return "No new repository commit was needed. Remote is up to date.";
  }

  const target = result.skillIds.length === 1 ? result.skillIds[0] : `${result.skillIds.length} skills`;
  if (result.committed && result.commitHash) {
    return `Synced ${target}. Commit ${result.commitHash} was pushed.`;
  }

  return `No new commit was needed. Pushed ${target}.`;
}

function dependencyInstallMessage(result: DependencyInstallInfo) {
  if (result.status !== "installed") {
    return null;
  }

  return result.message;
}

function actionBusyId(endpoint: SkillActionEndpoint | "compare", row: SkillRow) {
  return `${endpoint}:${rowKey(row)}`;
}

function compareResolveBusyId(row: SkillRow, strategy: ResolveStrategy) {
  return `compare-resolve:${rowKey(row)}:${strategy}`;
}

function restoreBusyId(row: ArchiveRow) {
  return `restore:${row.id}`;
}

function requiresConfirmation(endpoint: SkillActionEndpoint) {
  return endpoint === "archive" || endpoint === "remove-local";
}

function StatusTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "risk" }) {
  return (
    <div className={`status-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PathLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="path-line">
      {icon}
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function SyncBadge({ state }: { state: SkillRow["syncState"] }) {
  const icon = state === "clean" ? <CheckCircle2 size={14} aria-hidden="true" /> : <ShieldAlert size={14} aria-hidden="true" />;
  const variant: "success" | "warning" | "destructive" | "default" =
    state === "clean" ? "success" : state === "conflict" ? "destructive" : "warning";

  return (
    <Badge variant={variant} className={`sync-badge ${state}`}>
      {icon}
      {syncLabel(state)}
    </Badge>
  );
}

function ArchiveCopyBadge({ status }: { status: ArchiveCopyStatus }) {
  const variant: "success" | "destructive" = status === "present" ? "success" : "destructive";
  const label = status === "present" ? "Present" : "Missing";

  return (
    <Badge variant={variant} className={`archive-copy-badge ${status}`}>
      {label}
    </Badge>
  );
}

function AutoSyncIndicator({ status }: { status: AutoSyncStatus }) {
  const text = formatAutoSyncLabel(status);
  const isActive = status.enabled;
  const classes = `auto-sync-indicator ${isActive ? `mode-${status.mode}` : "mode-disabled"}${status.running ? " running" : ""}`;
  const tooltip = status.lastError ? `Auto-sync blocked: ${status.lastError}` : statusMessage(status);

  return (
    <span className={classes} title={tooltip} role="status" aria-live="polite">
      {status.running ? <Loader2 className="spin" size={14} aria-hidden="true" /> : null}
      {text}
    </span>
  );
}

function BranchSyncBadge({ status }: { status: GitBranchSyncStatus }) {
  const label = branchSyncLabel(status);
  const needsAttention = status.state === "ahead" || status.state === "behind" || status.state === "diverged";
  const className = `branch-sync-badge ${status.state}${needsAttention ? " attention" : ""}`;

  return (
    <span className={className} title={branchSyncTitle(status)} role="status" aria-live="polite">
      {needsAttention ? <CircleAlert size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
      {label}
    </span>
  );
}

function RowAction({
  row,
  busyId,
  onAction,
  onEdit,
  onCompare
}: {
  row: SkillRow;
  busyId: string | null;
  onAction: (endpoint: SkillActionEndpoint, row: SkillRow) => void;
  onEdit: (row: SkillRow) => void;
  onCompare: (row: SkillRow) => void;
}) {
  const importBusy = busyId === actionBusyId("import", row);
  const installBusy = busyId === actionBusyId("install", row);
  const updateBusy = busyId === actionBusyId("update-local", row);
  const archiveBusy = busyId === actionBusyId("archive", row);
  const removeBusy = busyId === actionBusyId("remove-local", row);
  const editBusy = busyId === `editor-open:${rowKey(row)}`;
  const compareBusy = busyId === actionBusyId("compare", row);
  const hasAction =
    canCompareVersions(row) ||
    canEditLocal(row) ||
    canAddToSync(row) ||
    canInstallLocal(row) ||
    canUpdateLocal(row) ||
    canArchive(row) ||
    canRemoveLocal(row);

  if (!hasAction) {
    return <span className="row-actions muted">View</span>;
  }

  return (
    <span className="row-actions">
      {canEditLocal(row) ? (
        <ActionIconButton
          label="Edit local SKILL.md"
          busy={editBusy}
          disabled={busyId !== null && !editBusy}
          icon={<FilePenLine size={14} aria-hidden="true" />}
          onClick={() => onEdit(row)}
        />
      ) : null}
      {canAddToSync(row) ? (
        <ActionIconButton
          label="Add to sync"
          busy={importBusy}
          disabled={busyId !== null && !importBusy}
          icon={<PlusCircle size={14} aria-hidden="true" />}
          onClick={() => onAction("import", row)}
        />
      ) : null}
      {canInstallLocal(row) ? (
        <ActionIconButton
          label="Install local"
          busy={installBusy}
          disabled={busyId !== null && !installBusy}
          icon={<Download size={14} aria-hidden="true" />}
          onClick={() => onAction("install", row)}
        />
      ) : null}
      {canUpdateLocal(row) ? (
        <ActionIconButton
          label="Update local"
          busy={updateBusy}
          disabled={busyId !== null && !updateBusy}
          icon={<Download size={14} aria-hidden="true" />}
          onClick={() => onAction("update-local", row)}
        />
      ) : null}
      {canCompareVersions(row) ? (
        <ActionIconButton
          label="Compare versions"
          busy={compareBusy}
          disabled={busyId !== null && !compareBusy}
          icon={<GitCompareArrows size={14} aria-hidden="true" />}
          onClick={() => onCompare(row)}
        />
      ) : null}
      {canArchive(row) ? (
        <ActionIconButton
          label="Stop syncing"
          busy={archiveBusy}
          disabled={busyId !== null && !archiveBusy}
          icon={<Archive size={14} aria-hidden="true" />}
          onClick={() => onAction("archive", row)}
        />
      ) : null}
      {canRemoveLocal(row) ? (
        <ActionIconButton
          label={row.localSources.length > 1 ? "Remove local copies" : "Remove local copy"}
          busy={removeBusy}
          disabled={busyId !== null && !removeBusy}
          icon={<Trash2 size={14} aria-hidden="true" />}
          tone="danger"
          onClick={() => onAction("remove-local", row)}
        />
      ) : null}
    </span>
  );
}

function ActionIconButton({
  label,
  busy,
  disabled,
  icon,
  tone,
  onClick
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  icon: ReactNode;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={`row-action icon-only${tone ? ` ${tone}` : ""}`}
      type="button"
      aria-label={label}
      title={label}
      data-tooltip={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
    >
      {busy ? <Loader2 className="spin" size={14} aria-hidden="true" /> : icon}
      <span className="sr-only">{label}</span>
    </Button>
  );
}

function EditSourceDialog({
  row,
  busyId,
  onClose,
  onChoose
}: {
  row: SkillRow | null;
  busyId: string | null;
  onClose: () => void;
  onChoose: (row: SkillRow, source: LocalSkillSource) => void;
}) {
  const busy = row ? busyId === `editor-open:${rowKey(row)}` : false;

  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        {row ? (
          <DialogContent className="confirm-dialog edit-source-dialog" aria-labelledby="edit-source-title" aria-describedby="edit-source-description">
            <DialogHeader className="confirm-dialog-header">
              <div className="confirm-icon" aria-hidden="true">
                <FilePenLine size={16} />
              </div>
              <div>
                <DialogTitle id="edit-source-title">Choose local copy to edit</DialogTitle>
                <DialogDescription id="edit-source-description">
                  {row.name || row.id} is installed in more than one local skills folder. Pick the copy you want to edit.
                </DialogDescription>
              </div>
            </DialogHeader>
            <div className="edit-source-options" aria-label="Local copies">
              {localSourcesForRow(row).map((source) => (
                <button
                  className="edit-source-option"
                  type="button"
                  key={source}
                  onClick={() => onChoose(row, source)}
                  disabled={busyId !== null}
                >
                  <span>{sourceLabel(source)}</span>
                  <code>{localPathForSource(row, source)}</code>
                </button>
              ))}
            </div>
            <DialogFooter className="confirm-dialog-footer">
              <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </DialogPortal>
    </Dialog>
  );
}

function CompareVersionsDialog({
  state,
  busyId,
  onClose,
  onAcceptVersion
}: {
  state: { row: SkillRow; versions: SkillVersion[] } | null;
  busyId: string | null;
  onClose: () => void;
  onAcceptVersion: (strategy: ResolveStrategy) => Promise<void>;
}) {
  const busy = busyId !== null && state !== null;
  const row = state?.row ?? null;
  const versionDisabled = (version: SkillVersion) => !version.exists || busy;

  return (
    <Dialog
      open={Boolean(state)}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        {state ? (
          <DialogContent className="confirm-dialog compare-dialog" aria-labelledby="compare-versions-title" aria-describedby="compare-versions-description">
            <DialogHeader className="compare-header">
              <div className="confirm-icon" aria-hidden="true">
                <GitCompareArrows size={16} />
              </div>
              <div>
                <DialogTitle id="compare-versions-title">Compare {state.row.name || state.row.id}</DialogTitle>
                <DialogDescription id="compare-versions-description">Compare local and repo versions from each known source.</DialogDescription>
              </div>
            </DialogHeader>
            <div className="compare-source-grid">
              {state.versions.map((version) => (
                <section className="compare-source" key={version.source}>
                  <div className="compare-source-title">
                    <strong>{sourceLabel(version.source)}</strong>
                    <span>{version.exists ? "Available" : "Missing"}</span>
                  </div>
                  <p className="compare-source-path">{version.path}</p>
                  <pre className="compare-source-content">
                    <code>{version.content ?? "No SKILL.md present in this source."}</code>
                  </pre>
                  <div className="compare-source-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onClick={() => void onAcceptVersion(version.source)}
                      disabled={versionDisabled(version)}
                      title={
                        version.exists
                          ? `Accept ${sourceLabel(version.source)} version for ${state.row.name || state.row.id}`
                          : `${sourceLabel(version.source)} version is missing`
                      }
                    >
                      {busyId === compareResolveBusyId(state.row, version.source) ? (
                        <Loader2 className="spin" size={14} aria-hidden="true" />
                      ) : (
                        <CheckCircle2 size={14} aria-hidden="true" />
                      )}
                      Accept this version
                    </Button>
                  </div>
                </section>
              ))}
            </div>
            <DialogFooter className="compare-footer">
              <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
                {busy ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <X size={15} aria-hidden="true" />}
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </DialogPortal>
    </Dialog>
  );
}

function ConfirmActionDialog({
  action,
  busyId,
  onClose,
  onConfirm
}: {
  action: PendingSkillAction | null;
  busyId: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const busy = action ? busyId === actionBusyId(action.endpoint, action.row) : false;
  const copy = action ? confirmDialogCopy(action.endpoint, action.row) : null;

  return (
    <Dialog
      open={Boolean(action)}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        {copy ? (
          <DialogContent className="confirm-dialog" aria-labelledby="confirm-action-title" aria-describedby="confirm-action-description">
            <DialogHeader className="confirm-dialog-header">
              <div className="confirm-icon" aria-hidden="true">
                {copy.icon}
              </div>
              <div>
                <DialogTitle id="confirm-action-title">{copy.title}</DialogTitle>
                <DialogDescription id="confirm-action-description">{copy.description}</DialogDescription>
              </div>
            </DialogHeader>
            <div className="confirm-scope" aria-label="Action scope">
              {copy.scope.map((item) => (
                <div className="confirm-scope-item" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <DialogFooter className="confirm-dialog-footer">
              <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button variant={copy.danger ? "destructive" : "primary"} type="button" onClick={onConfirm} disabled={busy}>
                {busy ? <Loader2 className="spin" size={15} aria-hidden="true" /> : copy.icon}
                {copy.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </DialogPortal>
    </Dialog>
  );
}

function RestoreArchiveDialog({
  row,
  busyId,
  onClose,
  onConfirm
}: {
  row: ArchiveRow | null;
  busyId: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const busy = row ? busyId === restoreBusyId(row) : false;

  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        {row ? (
          <DialogContent
            className="confirm-dialog"
            aria-labelledby="restore-archive-title"
            aria-describedby="restore-archive-description"
          >
            <DialogHeader className="confirm-dialog-header">
              <div className="confirm-icon" aria-hidden="true">
                <RotateCcw size={16} />
              </div>
              <div>
                <DialogTitle id="restore-archive-title">Restore {row.name || row.id}?</DialogTitle>
                <DialogDescription id="restore-archive-description">This moves the archived skill copy back into the active skills folder.</DialogDescription>
              </div>
            </DialogHeader>
            <div className="confirm-scope" aria-label="Restore scope">
              <div className="confirm-scope-item">
                <span>Archive copy</span>
                <strong>{row.archivePath}</strong>
              </div>
              <div className="confirm-scope-item">
                <span>Archived at</span>
                <strong>{formatArchiveDate(row.archivedAt)}</strong>
              </div>
            </div>
            <DialogFooter className="confirm-dialog-footer">
              <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" type="button" onClick={onConfirm} disabled={busy}>
                {busy ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}
                Restore
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </DialogPortal>
    </Dialog>
  );
}

function confirmDialogCopy(endpoint: SkillActionEndpoint, row: SkillRow) {
  const skillName = row.name || row.id;
  if (endpoint === "archive") {
    return {
      title: `Stop syncing ${skillName}?`,
      description:
        "This removes the skill from the active sync set. The installed local copy stays available on this machine.",
      confirmLabel: "Stop syncing",
      icon: <Archive size={16} aria-hidden="true" />,
      danger: false,
      scope: [
        { label: "Local skill", value: "Kept installed" },
        { label: "Sync repo", value: "No longer active" },
        { label: "GitHub", value: "Updated with the archive sync" }
      ]
    };
  }

  const multipleLocalCopies = row.localSources.length > 1;
  return {
    title: multipleLocalCopies ? `Remove local copies of ${skillName}?` : `Remove local copy of ${skillName}?`,
    description: multipleLocalCopies
      ? "This deletes the skill from both local skill folders on this machine. The synced copy stays in the repository and can be installed again."
      : "This deletes the skill folder from this machine only. The synced copy stays in the repository and can be installed again.",
    confirmLabel: multipleLocalCopies ? "Remove local copies" : "Remove local copy",
    icon: <Trash2 size={16} aria-hidden="true" />,
    danger: true,
    scope: [
      { label: "This machine", value: multipleLocalCopies ? "Delete Codex and Agents copies" : "Delete local folder" },
      { label: "Sync repo", value: "Leave unchanged" },
      { label: "Git remote", value: "No archive action" }
    ]
  };
}

function DetailDrawer({
  selected,
  onClose
}: {
  selected: SkillRow;
  onClose: () => void;
}) {
  return (
    <Sheet open={true} onOpenChange={onClose}>
      <SheetContent className="detail-drawer">
        <SheetHeader>
          <div className="drawer-title-row">
            <div>
              <p className="eyebrow">{kindLabel(selected.kind)}</p>
              <h2>{selected.name || selected.id}</h2>
            </div>
            <Button className="icon-button" variant="outline" size="icon" type="button" onClick={onClose} aria-label="Close details">
              <X size={18} aria-hidden="true" />
            </Button>
          </div>
          <p>{selected.description || "No description in SKILL.md frontmatter."}</p>
          <div className="drawer-badges">
            <SyncBadge state={selected.syncState} />
            <span className={`source-badge ${selected.source}`}>{sourceLabel(selected.source)}</span>
          </div>
        </SheetHeader>

        <div className="detail-metadata" aria-label="Skill summary">
          <DetailField label="Source" value={sourceLabel(selected.source)} />
          <DetailField label="Local copy" value={selected.installed ? "Installed" : "Missing"} />
          <DetailField label="Sync state" value={syncLabel(selected.syncState)} />
          <DetailField label="Last used" value={formatLastUsed(selected.lastUsedAt)} />
          <DetailField label="Local modified" value={formatLocalModified(selected.localModifiedAt)} />
        </div>

        <div className="detail-section">
          <h3>Paths</h3>
          <KeyValue label="Local copy" value={selected.localPath ?? "Missing on this machine"} />
          <KeyValue label="Sync repo" value={selected.repoPath ?? "Not added to sync"} />
        </div>

        <div className="detail-section">
          <h3>Hashes</h3>
          <KeyValue label="Local hash" value={localHashLabel(selected)} />
          <KeyValue label="Repo hash" value={shortHash(selected.repoHash)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SkillEditorDrawer({
  row,
  editorState,
  busyId,
  onSave,
  onClose,
  onChange
}: {
  row: SkillRow;
  editorState: EditorState;
  busyId: string | null;
  onSave: (row: SkillRow) => Promise<void>;
  onClose: () => void;
  onChange: (content: string) => void;
}) {
  const saving = busyId === `editor-save:${rowKey(row)}`;

  return (
    <Sheet open={true} onOpenChange={onClose}>
      <SheetContent className="editor-drawer">
        <div className="drawer-header">
          <div className="drawer-title-row">
            <div>
              <p className="eyebrow">Local editor</p>
              <h2>Edit SKILL.md</h2>
            </div>
            <Button className="icon-button" variant="outline" size="icon" type="button" onClick={onClose} aria-label="Close editor" disabled={saving}>
              <X size={18} aria-hidden="true" />
            </Button>
          </div>
          <p>{row.name || row.id}</p>
          <div className="drawer-badges">
            <span className={`source-badge ${editorState.source}`}>{sourceLabel(editorState.source)}</span>
            {editorState.dirty ? <span className="dirty-badge">Unsaved</span> : <span className="saved-badge">Saved</span>}
          </div>
        </div>

        <div className="editor-body">
          <div className="editor-path">
            <span>File</span>
            <code>{editorState.path}</code>
          </div>
          <Textarea
            value={editorState.content}
            onChange={(event) => onChange(event.target.value)}
            aria-label={`Edit ${row.name || row.id} SKILL.md`}
            spellCheck={false}
          />
        </div>

        <div className="editor-footer">
          <Button
            variant="primary"
            type="button"
            onClick={() => void onSave(row)}
            disabled={saving || !editorState.dirty}
          >
            {saving ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
            Save local
          </Button>
          <Button
            variant="ghost"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            <X size={15} aria-hidden="true" />
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="key-value">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="skeleton-stack" aria-label="Loading skills">
      {Array.from({ length: 9 }).map((_, index) => (
        <div className="skeleton-row" key={index} />
      ))}
    </div>
  );
}

function filterLabel(filter: Filter) {
  if (filter === "all") return "All";
  return syncLabel(filter);
}

function syncLabel(state: SkillRow["syncState"] | Filter) {
  const labels: Record<string, string> = {
    clean: "In sync",
    local_modified: "Local changed",
    repo_modified: "Repo changed",
    conflict: "Conflict",
    missing_local: "Missing local copy",
    missing_repo: "Missing in repo",
    unmanaged: "Local only",
    repo_only: "Repo only",
    all: "All"
  };

  return labels[state] ?? state;
}

function formatAutoSyncLabel(status: AutoSyncStatus) {
  if (!status.enabled) {
    return "Auto-sync off";
  }

  if (status.running) {
    return "Auto-sync running";
  }

  if (status.pending) {
    return `Auto-sync queued (${status.mode})`;
  }

  if (status.watchersSupported) {
    return `Auto-sync ${status.mode}`;
  }

  return "Auto-sync polling";
}

function statusMessage(status: AutoSyncStatus) {
  if (!status.lastRunCompletedAt) {
    return status.enabled ? "Auto-sync idle" : "Auto-sync off";
  }

  const last = new Date(status.lastRunCompletedAt);
  if (Number.isNaN(last.getTime())) {
    return "Auto-sync idle";
  }

  const now = new Date();
  const mins = Math.max(0, Math.floor((now.getTime() - last.getTime()) / 60000));
  return `${mins} min ago`;
}

function branchSyncLabel(status: GitBranchSyncStatus) {
  if (status.state === "up-to-date") {
    return "Remote synced";
  }

  if (status.state === "ahead") {
    return `Push pending ${status.ahead}`;
  }

  if (status.state === "behind") {
    return `Pull pending ${status.behind}`;
  }

  if (status.state === "diverged") {
    return `Diverged +${status.ahead}/-${status.behind}`;
  }

  if (status.state === "no-upstream") {
    return "No upstream";
  }

  return "Remote unknown";
}

function branchSyncTitle(status: GitBranchSyncStatus) {
  const target = status.upstream ?? "remote";
  if (status.state === "up-to-date") {
    return `Local branch is up to date with ${target}.`;
  }

  if (status.state === "ahead") {
    return `${status.ahead} local commit(s) are not on ${target} yet.`;
  }

  if (status.state === "behind") {
    return `${target} has ${status.behind} commit(s) not pulled locally.`;
  }

  if (status.state === "diverged") {
    return `Local and ${target} both have unique commits. Next push will rebase or report a conflict.`;
  }

  if (status.state === "no-upstream") {
    return "No upstream branch is configured for this sync repository.";
  }

  return "Unable to determine remote branch state.";
}

function sourceLabel(source: SkillRow["source"]) {
  const labels: Record<SkillRow["source"], string> = {
    codex: "Codex local",
    agents: "Agents local",
    both: "Codex + Agents",
    repo: "Sync repo"
  };

  return labels[source];
}

function localPathForSource(row: SkillRow, source: LocalSkillSource) {
  const prefix = `${sourceLabel(source)}: `;
  const matchingLine = row.localPath?.split("\n").find((line) => line.startsWith(prefix));
  return matchingLine ? matchingLine.slice(prefix.length) : sourceLabel(source);
}

function localHashLabel(row: SkillRow) {
  return row.localCopiesDiffer ? "Mixed local copies" : shortHash(row.localHash);
}

function kindLabel(kind: SkillRow["kind"]) {
  const labels: Record<SkillRow["kind"], string> = {
    managed: "Tracked skill",
    unmanaged: "Local-only skill",
    "repo-only": "Repo-only skill"
  };

  return labels[kind];
}

function shortHash(hash: string | null) {
  return hash ? hash.slice(0, 12) : "None";
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Not tracked";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatArchiveDate(value: string | null) {
  return value ? formatTimestamp(value) : "Unknown";
}

function formatLocalModified(value: string | null) {
  return value ? formatTimestamp(value) : "No local copy";
}

function formatLastUsed(lastUsedAt: string | null) {
  if (!lastUsedAt) {
    return "Never";
  }

  const parsed = new Date(lastUsedAt);
  if (Number.isNaN(parsed.getTime())) {
    return lastUsedAt;
  }

  return `${parsed.toLocaleString()} (${formatAge(parsed)})`;
}

function formatAge(date: Date): string {
  const now = Date.now();
  const ageMs = Math.max(0, now - date.getTime());
  const minutes = Math.floor(ageMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  if (hours >= 1) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}

async function readError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    return payload.error ?? payload.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

function selectRowWithKeyboard(event: KeyboardEvent<HTMLDivElement>, id: string, setSelectedId: (id: string) => void) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  setSelectedId(id);
}
