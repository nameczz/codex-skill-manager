import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Archive,
  ArrowUpDown,
  Box,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CloudDownload,
  Download,
  FilePenLine,
  FolderGit2,
  HardDrive,
  Layers3,
  GitCompareArrows,
  Loader2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  RefreshCw,
  Save,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  Trash2,
  Unlink2,
  X
} from "lucide-react";
import type {
  ApiStatus,
  AutoSyncStatus,
  GitBranchSyncStatus,
  LocalSkillSource,
  CodexArchivePreviewResponse,
  CodexArchiveListResponse,
  CodexArchiveSession,
  DependencyInstallInfo,
  RepoConflictsResponse,
  RepoConflictSource,
  RepoSkillConflict,
  ResolveConflictResult,
  SkillRow,
  SkillVersion,
  SkillVersionsResponse,
  StatusReport,
  SyncResult,
  UsageMonitorStatus
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
import { CommandPalette, type CommandPaletteAction } from "./components/CommandPalette";
import { SettingsPanel, PathInput, PathSummary, type SetupPathField, type SetupPaths } from "./components/SettingsPanel";
import { Input } from "./components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Skeleton } from "./components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Textarea } from "./components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";

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
type View = "skills" | "settings" | "archive";
type Theme = "light" | "dark";
type SortDirection = "asc" | "desc";
type SortState<T extends string> = {
  key: T;
  direction: SortDirection;
};
type SkillSortKey = "name" | "source" | "state" | "local_copy" | "local_modified" | "last_used";
type CodexArchiveState = "active" | "trash";
type ArchiveSortKey = "title" | "archived_at" | "updated_at" | "cwd" | "source" | "size";
const viewRoutes: Record<View, string> = {
  skills: "/skills",
  archive: "/codex-archive",
  settings: "/settings"
};
const themeStorageKey = "csm-theme";

type EditorState = {
  rowKey: string;
  source: LocalSkillSource;
  path: string;
  content: string;
  dirty: boolean;
};
type SkillActionEndpoint = "import" | "install" | "update-local" | "stop-syncing" | "remove-local";
type CodexArchiveRow = CodexArchiveSession & {
  state: CodexArchiveState;
  sourceLabel: string;
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
  const [view, setView] = useState<View>(() => viewFromLocation());
  const [checkedRowKeys, setCheckedRowKeys] = useState<string[]>([]);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingSkillAction | null>(null);
  const [pendingArchiveDelete, setPendingArchiveDelete] = useState<CodexArchiveRow | null>(null);
  const [pendingEditRow, setPendingEditRow] = useState<SkillRow | null>(null);
  const [compareState, setCompareState] = useState<{ row: SkillRow; versions: SkillVersion[] } | null>(null);
  const [repoConflictState, setRepoConflictState] = useState<{ conflicts: RepoSkillConflict[]; selections: Record<string, RepoConflictSource> } | null>(null);
  const [skillSort, setSkillSort] = useState<SortState<SkillSortKey>>({ key: "name", direction: "asc" });
  const [archiveSort, setArchiveSort] = useState<SortState<ArchiveSortKey>>({ key: "title", direction: "asc" });
  const [detailOpen, setDetailOpen] = useState(false);
  const [archiveDetailOpen, setArchiveDetailOpen] = useState(false);
  const [archiveState, setArchiveState] = useState<CodexArchiveState>("active");
  const [archiveSessionRows, setArchiveSessionRows] = useState<CodexArchiveRow[]>([]);
  const [archiveSession, setArchiveSession] = useState<CodexArchivePreviewResponse | null>(null);
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
  const [theme, setTheme] = useState<Theme>(() => readInitialTheme());
  const [commandOpen, setCommandOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navigateView = useCallback((nextView: View, options: { replace?: boolean } = {}) => {
    setView(nextView);

    if (typeof window === "undefined") {
      return;
    }

    const nextPath = viewRoutes[nextView];
    if (normalizeRoutePath(window.location.pathname) === nextPath) {
      return;
    }

    const update = options.replace ? window.history.replaceState.bind(window.history) : window.history.pushState.bind(window.history);
    update(null, "", nextPath);
  }, []);

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

  async function loadCodexArchiveSessions(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await fetch(`/api/codex-archive?state=${archiveState}`);
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const payload = (await response.json()) as CodexArchiveListResponse;
      setArchiveSessionRows(payload.items.map((item) => ({ ...item, state: payload.state, sourceLabel: item.source || "Unknown" })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Codex archive.");
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
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(themeStorageKey, theme);
    }
  }, [theme]);

  useEffect(() => {
    const openCommandPalette = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") {
        return;
      }

      event.preventDefault();
      setCommandOpen((open) => !open);
    };

    window.addEventListener("keydown", openCommandPalette);
    return () => window.removeEventListener("keydown", openCommandPalette);
  }, []);

  useEffect(() => {
    navigateView(viewFromLocation(), { replace: true });

    function handlePopState() {
      setView(viewFromLocation());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [navigateView]);

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

  useEffect(() => {
    if (status?.configured === false && view !== "skills") {
      navigateView("skills", { replace: true });
    }
  }, [navigateView, status?.configured, view]);

  const rows = useMemo(() => {
    if (!status?.configured) {
      return [];
    }

    return buildRows(status.report);
  }, [status]);

  const archiveRows = useMemo(() => {
    return archiveSessionRows.map((row) => ({
      ...row,
      state: archiveState,
      sourceLabel: row.source || "Unknown"
    }));
  }, [archiveSessionRows, archiveState]);
  const configured = status?.configured === true;
  const activeView = configured ? view : "skills";
  const report = configured ? status.report : null;
  const autoSyncStatus = configured ? status.autoSync : null;

  useEffect(() => {
    if (activeView !== "archive") {
      return;
    }

    void loadCodexArchiveSessions();
  }, [activeView, archiveState]);

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
    }).sort((a, b) => compareSkillRows(a, b, skillSort));
  }, [filter, query, rows, skillSort]);

  const filteredArchiveRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return archiveRows.filter((row) => {
      const matchesQuery =
        !normalized ||
        row.title.toLowerCase().includes(normalized) ||
        row.sessionId.toLowerCase().includes(normalized) ||
        row.fileName.toLowerCase().includes(normalized) ||
        (row.cwd ?? "").toLowerCase().includes(normalized) ||
        (row.source ?? "").toLowerCase().includes(normalized);
      return matchesQuery;
    }).sort((a, b) => compareArchiveRows(a, b, archiveSort));
  }, [archiveRows, archiveSort, query]);

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
  const repoInstallRows = rows.filter(canInstallLocal);
  const repoUpdateRows = rows.filter(canUpdateLocal);
  const repoApplyCount = repoInstallRows.length + repoUpdateRows.length;
  const localChangeRows = rows.filter((row) => row.syncState === "local_modified" || row.syncState === "missing_repo");
  const conflictRows = rows.filter((row) => row.syncState === "conflict");
  const unmanagedRows = rows.filter((row) => row.kind === "unmanaged");
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
  }, [archiveSort, archiveState, filter, pageSize, query, skillSort]);

  useEffect(() => {
    setArchiveSession(null);
    setArchiveDetailOpen(false);
  }, [archiveState]);

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
      } else if (repoConflictState) {
        setRepoConflictState(null);
      } else if (archiveDetailOpen) {
        setArchiveDetailOpen(false);
      } else if (detailOpen) {
        setDetailOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [archiveDetailOpen, compareState, detailOpen, editorState, repoConflictState]);

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
    const action = pendingAction;
    if (!action) {
      return;
    }

    setPendingAction(null);
    void runSkillAction(action.endpoint, action.row);
  }

  async function openArchiveSession(row: CodexArchiveRow) {
    const busyKey = `archive-preview:${archiveRowKey(row)}`;
    setError(null);
    setNotice(null);
    setBusyId(busyKey);
    try {
      const response = await fetch("/api/codex-archive/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: row.state, fileName: row.fileName })
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as CodexArchivePreviewResponse;
      setArchiveSession(payload);
      setArchiveDetailOpen(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load archived session preview.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function runArchiveSessionAction(action: "delete" | "restore", row: CodexArchiveRow) {
    const busyKey = `archive-${action}:${archiveRowKey(row)}`;
    setError(null);
    setNotice(null);
    setBusyId(busyKey);
    try {
      const response = await fetch(`/api/codex-archive/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: row.state, fileName: row.fileName })
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setNotice(action === "delete" ? `Moved ${row.title} to archive trash.` : `Restored ${row.title} to active archive.`);
      setArchiveSession(null);
      setArchiveDetailOpen(false);
      await loadCodexArchiveSessions({ silent: true });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action === "delete" ? "Delete" : "Restore"} archived session failed.`);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function confirmArchiveDelete() {
    if (!pendingArchiveDelete) {
      return;
    }

    const deleted = await runArchiveSessionAction("delete", pendingArchiveDelete);
    if (deleted) {
      setPendingArchiveDelete(null);
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
      const payload = await requestBulkAction(endpoint, targetRows);
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

  async function applyRepoChangesToLocal() {
    if (repoApplyCount === 0) {
      return;
    }

    setError(null);
    setNotice(null);
    setBusyId("apply-repo");
    try {
      const messages: string[] = [];
      let installedDependencyCount = 0;

      if (repoInstallRows.length > 0) {
        const payload = await requestBulkAction("install", repoInstallRows);
        if (payload.result) {
          messages.push(syncResultMessage(payload.result));
        }
        installedDependencyCount += payload.dependencyInstalls?.filter((install) => install.status === "installed").length ?? 0;
      }

      if (repoUpdateRows.length > 0) {
        const payload = await requestBulkAction("update-local", repoUpdateRows);
        if (payload.result) {
          messages.push(syncResultMessage(payload.result));
        }
        installedDependencyCount += payload.dependencyInstalls?.filter((install) => install.status === "installed").length ?? 0;
      }

      if (installedDependencyCount > 0) {
        messages.push(`Installed dependencies for ${installedDependencyCount} skill${installedDependencyCount === 1 ? "" : "s"}.`);
      }

      setNotice(messages.length > 0 ? messages.join(" ") : "Applied repository changes to local skills.");
      await refresh({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply repo changes failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function requestBulkAction(endpoint: "import" | "install" | "update-local", targetRows: SkillRow[]) {
    const response = await fetch("/api/bulk-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, skills: targetRows.map(skillActionBody) })
    });
    if (!response.ok) {
      throw new Error(await readError(response));
    }

    return (await response.json()) as { result?: SyncResult; dependencyInstalls?: Array<DependencyInstallInfo & { skillId: string }> };
  }

  async function pullFromRemote() {
    setError(null);
    setNotice(null);
    setBusyId("pull");
    try {
      const response = await fetch("/api/pull", {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      await refresh({ silent: true });
      setNotice("Pulled latest changes from sync repository.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Pull failed.";
      if (message.includes("Cannot auto-resolve sync conflict") || message.includes("Review these paths manually")) {
        setBusyId(null);
        await openRepoConflicts();
        return;
      }
      setError(message);
    } finally {
      setBusyId(null);
    }
  }

  async function openRepoConflicts() {
    setError(null);
    setNotice(null);
    setBusyId("repo-conflicts");
    try {
      const response = await fetch("/api/repo-conflicts");
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as RepoConflictsResponse;
      if (payload.conflicts.length === 0) {
        setNotice("No skill-level repo conflicts need review.");
        await refresh({ silent: true });
        return;
      }

      const selections: Record<string, RepoConflictSource> = {};
      for (const conflict of payload.conflicts) {
        selections[conflict.skillId] = conflict.versions.find((version) => version.exists)?.source ?? "github";
      }
      setRepoConflictState({ conflicts: payload.conflicts, selections });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load repo conflicts.");
    } finally {
      setBusyId(null);
    }
  }

  async function resolveRepoConflicts() {
    if (!repoConflictState) {
      return;
    }

    setError(null);
    setNotice(null);
    setBusyId("repo-conflicts-resolve");
    try {
      const response = await fetch("/api/repo-conflicts/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolutions: repoConflictState.conflicts.map((conflict) => ({
            skillId: conflict.skillId,
            source: repoConflictState.selections[conflict.skillId]
          }))
        })
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setRepoConflictState(null);
      await refresh({ silent: true });
      setNotice("Resolved repo skill conflicts and pushed the merge.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resolve repo conflicts.");
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

  function updateSkillSort(key: SkillSortKey) {
    setSkillSort((current) => nextSortState(current, key));
  }

  function updateArchiveSort(key: ArchiveSortKey) {
    setArchiveSort((current) => nextSortState(current, key));
  }

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const commandActions = useMemo<CommandPaletteAction[]>(
    () => [
      {
        id: "go-skills",
        label: "Go to Skills",
        description: "Open skill sync table",
        group: "Navigation",
        keywords: ["skill", "sync"],
        onSelect: () => navigateView("skills")
      },
      {
        id: "go-archive",
        label: "Go to Codex Archive",
        description: "Review archived Codex sessions",
        group: "Navigation",
        disabled: !configured,
        keywords: ["archive", "session"],
        onSelect: () => navigateView("archive")
      },
      {
        id: "go-settings",
        label: "Go to Settings",
        description: "Change local paths",
        group: "Navigation",
        disabled: !configured,
        keywords: ["paths", "config"],
        onSelect: () => navigateView("settings")
      },
      {
        id: "refresh",
        label: "Refresh",
        description: "Reload local status",
        group: "Actions",
        disabled: busyId !== null,
        onSelect: () => void refresh()
      },
      {
        id: "pull",
        label: "Pull remote changes",
        description: "Fetch and apply Git repo updates",
        group: "Actions",
        disabled: !configured || activeView !== "skills" || busyId !== null,
        keywords: ["git", "remote"],
        onSelect: () => void pullFromRemote()
      },
      {
        id: "apply-repo",
        label: "Apply repo changes",
        description: repoApplyCount > 0 ? `${repoApplyCount} local install/update action${repoApplyCount === 1 ? "" : "s"}` : "No repo changes to apply",
        group: "Actions",
        disabled: !configured || activeView !== "skills" || busyId !== null || repoApplyCount === 0,
        keywords: ["install", "update"],
        onSelect: () => void applyRepoChangesToLocal()
      },
      {
        id: "toggle-theme",
        label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        description: "Toggle interface theme",
        group: "Actions",
        keywords: ["dark", "light"],
        onSelect: toggleTheme
      },
      {
        id: "clear-search",
        label: "Clear search",
        description: query ? "Clear the current search query" : "Search is already empty",
        group: "Actions",
        disabled: query.length === 0,
        keywords: ["filter"],
        onSelect: () => setQuery("")
      }
    ],
    [activeView, busyId, configured, navigateView, query, repoApplyCount, theme, toggleTheme]
  );

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"} data-theme={theme}>
      <CommandPalette actions={commandActions} open={commandOpen} onOpenChange={setCommandOpen} />
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark">
            <Layers3 size={18} aria-hidden="true" />
          </div>
          <div>
            <strong>Skill Manager</strong>
            <span>Local sync workbench</span>
          </div>
          <Button
            className="sidebar-toggle"
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={15} aria-hidden="true" /> : <PanelLeftClose size={15} aria-hidden="true" />}
          </Button>
        </div>

        <nav className="nav-list">
          <Button
            className={activeView === "skills" ? "nav-item active" : "nav-item"}
            variant="outline"
            size="sm"
            type="button"
            onClick={() => navigateView("skills")}
          >
            <Box size={16} aria-hidden="true" />
            Skills
          </Button>
          <Button
            className={configured && activeView === "archive" ? "nav-item active" : configured ? "nav-item" : "nav-item disabled"}
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              if (configured) {
                navigateView("archive");
              }
            }}
            disabled={!configured}
          >
            <Archive size={16} aria-hidden="true" />
            Codex Archive
          </Button>
          <Button
            className={configured && activeView === "settings" ? "nav-item active" : configured ? "nav-item" : "nav-item disabled"}
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              if (configured) {
                navigateView("settings");
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
            <h1>{viewTitle(activeView)}</h1>
          </div>
          <div className="topbar-actions">
            <Button
              className="theme-toggle"
              variant="secondary"
              size="sm"
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
              {theme === "dark" ? "Light" : "Dark"}
            </Button>
            <Button variant="secondary" size="sm" type="button" onClick={() => void refresh()}>
              <RefreshCw size={15} aria-hidden="true" />
              Refresh
            </Button>
            <Button variant="secondary" size="sm" type="button" onClick={() => setCommandOpen(true)} title="Command palette (⌘K)">
              <Search size={15} aria-hidden="true" />
              Command
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
            busyId={busyId}
            selectingPath={selectingPath}
            onPathChange={(field, value) => setSetupPaths((current) => ({ ...current, [field]: value }))}
            onChoose={(field, title) => void chooseDirectory(field, title)}
            onSave={() => void saveSettings()}
          />
        ) : null}

        {configured && activeView === "skills" ? (
          <Card className="skill-panel">
            <section className="repo-strip" aria-label="Repository status">
              <StatusTile label="Managed" value={String(report?.managed.length ?? 0)} />
              <StatusTile label="Clean" value={String(cleanCount)} tone="good" />
              <StatusTile label="Review" value={String(reviewCount)} tone={reviewCount > 0 ? "risk" : "neutral"} />
              <div className="path-stack">
                <div className="path-stack-lines">
                  <PathLine icon={<FolderGit2 size={14} aria-hidden="true" />} label="Sync repo" value={report?.syncRepo ?? ""} />
                  <PathLine icon={<HardDrive size={14} aria-hidden="true" />} label="Codex skills" value={report?.codexSkillsDir ?? ""} />
                  <PathLine icon={<HardDrive size={14} aria-hidden="true" />} label="Agents skills" value={report?.agentsSkillsDir ?? ""} />
                </div>
                <div className="path-stack-controls">
                  <BranchSyncBadge
                    status={status.gitBranchStatus}
                    busy={busyId === "repo-conflicts"}
                    onReview={status.gitBranchStatus.state === "diverged" ? () => void openRepoConflicts() : undefined}
                  />
                  <Button
                    className="path-stack-action"
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => void applyRepoChangesToLocal()}
                    disabled={!configured || activeView !== "skills" || busyId !== null || repoApplyCount === 0}
                    title={
                      repoApplyCount === 0
                        ? "No repo changes to apply locally"
                        : `Install ${repoInstallRows.length} missing and update ${repoUpdateRows.length} changed local copies`
                    }
                  >
                    {busyId === "apply-repo" ? <Loader2 className="spin" size={14} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
                    Apply repo changes{repoApplyCount > 0 ? ` (${repoApplyCount})` : ""}
                  </Button>
                  <Button className="path-stack-action" variant="secondary" size="sm" type="button" onClick={() => navigateView("settings")}>
                    <Settings size={14} aria-hidden="true" />
                    Change paths
                  </Button>
                </div>
              </div>
            </section>

            <section className="skills-summary-strip" aria-label="Sync and usage summary">
              <SummaryAction
                icon={<Download size={15} aria-hidden="true" />}
                label="Repo changes"
                value={String(repoApplyCount)}
                detail={`${repoInstallRows.length} install, ${repoUpdateRows.length} update`}
                disabled={repoApplyCount === 0}
                onClick={() => setFilter(repoInstallRows.length > 0 ? "missing_local" : "repo_modified")}
              />
              <SummaryAction
                icon={<RefreshCw size={15} aria-hidden="true" />}
                label="Local changes"
                value={String(localChangeRows.length + unmanagedRows.length)}
                detail={`${localChangeRows.length} tracked, ${unmanagedRows.length} local only`}
                disabled={localChangeRows.length + unmanagedRows.length === 0}
                onClick={() => setFilter(localChangeRows.length > 0 ? "local_modified" : "unmanaged")}
              />
              <SummaryAction
                icon={<ShieldAlert size={15} aria-hidden="true" />}
                label="Conflicts"
                value={String(conflictRows.length)}
                detail="Compare and accept a copy"
                tone={conflictRows.length > 0 ? "risk" : "neutral"}
                disabled={conflictRows.length === 0}
                onClick={() => setFilter("conflict")}
              />
              <UsageTraceStatus status={status.usageMonitor} />
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
                <Select value={filter} onValueChange={(value) => setFilter(value as Filter)}>
                  <SelectTrigger aria-label="Filter by state">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {filters.map((item) => (
                      <SelectItem key={item} value={item}>
                        {filterLabel(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
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
              <div className="skill-table-scroll skills-table-scroll">
                <Table className="skills-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="select-cell">
                        <SelectAllCheckbox
                          checked={visibleRowsSelected}
                          mixed={someVisibleRowsSelected && !visibleRowsSelected}
                          onChange={toggleVisibleRows}
                        />
                      </TableHead>
                      <TableHead><SortableHeader label="Name" sortKey="name" sort={skillSort} onSort={updateSkillSort} /></TableHead>
                      <TableHead><SortableHeader label="Source" sortKey="source" sort={skillSort} onSort={updateSkillSort} /></TableHead>
                      <TableHead><SortableHeader label="State" sortKey="state" sort={skillSort} onSort={updateSkillSort} /></TableHead>
                      <TableHead><SortableHeader label="Local copy" sortKey="local_copy" sort={skillSort} onSort={updateSkillSort} /></TableHead>
                      <TableHead><SortableHeader label="Local modified" sortKey="local_modified" sort={skillSort} onSort={updateSkillSort} /></TableHead>
                      <TableHead><SortableHeader label="Last used" sortKey="last_used" sort={skillSort} onSort={updateSkillSort} /></TableHead>
                      <TableHead className="action-cell">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? <SkeletonRows columns={8} /> : null}

                    {!loading && filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8}>
                          <div className="empty-state">
                            <h2>No skills match this view</h2>
                            <p>Clear the search or switch filters to see available local and managed skills.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}

                    {!loading &&
                      pageRows.map((row) => (
                        <TableRow
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
                          <TableCell className="select-cell" onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={checkedRowKeys.includes(rowKey(row))}
                              onChange={(event) => toggleRowChecked(row, event.target.checked)}
                              aria-label={`Select ${row.name || row.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <span className="skill-main">
                              <strong>{row.name || row.id}</strong>
                              <small>{row.id}</small>
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`source-badge ${row.source}`}>
                              {sourceLabel(row.source)}
                            </Badge>
                          </TableCell>
                          <TableCell><SyncBadge state={row.syncState} /></TableCell>
                          <TableCell>
                            <span className={row.installed ? "install-state installed" : "install-state"}>
                              {row.installed ? "Installed" : "Missing"}
                            </span>
                          </TableCell>
                          <TableCell><span className="skill-time">{formatLocalModified(row.localModifiedAt)}</span></TableCell>
                          <TableCell><span className="skill-time">{formatLastUsed(row.lastUsedAt)}</span></TableCell>
                          <TableCell className="action-cell">
                            <RowAction
                              row={row}
                              busyId={busyId}
                              onAction={requestSkillAction}
                              onEdit={requestSkillEditor}
                              onCompare={() => void openCompareVersions(row)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
              <div className="pagination-bar" aria-label="Skill table pagination">
                <div className="pagination-summary">
                  <strong>{filteredRows.length === 0 ? "0" : `${pageStart}-${pageEnd}`}</strong>
                  <span>of {filteredRows.length}</span>
                </div>
                <label className="page-size-select">
                  <span>Rows</span>
                  <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value) as PageSize)}>
                    <SelectTrigger aria-label="Rows per page">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pageSizes.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
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
            <section className="repo-strip" aria-label="Codex archive status">
              <StatusTile label={archiveState === "active" ? "Archived" : "Trash"} value={String(archiveRows.length)} tone="neutral" />
              <StatusTile label="Showing" value={archiveState === "active" ? "Active" : "Trash"} tone={archiveState === "active" ? "good" : "risk"} />
              <StatusTile label="Preview" value={archiveSession ? "Loaded" : "On demand"} tone="neutral" />
              <div className="path-stack">
                <div className="path-stack-lines">
                  <PathLine icon={<Archive size={14} aria-hidden="true" />} label="Archive source" value="~/.codex/archived_sessions" />
                  <PathLine icon={<Trash2 size={14} aria-hidden="true" />} label="Trash" value="~/.codex/archived_sessions/.trash" />
                </div>
                <div className="path-stack-controls">
                  <Button className="path-stack-action" variant="secondary" size="sm" type="button" onClick={() => void loadCodexArchiveSessions()}>
                    <RefreshCw size={14} aria-hidden="true" />
                    Refresh archive
                  </Button>
                </div>
              </div>
            </section>

            <section className="toolbar" aria-label="Archive filters">
              <label className="search-box">
                <Search size={16} aria-hidden="true" />
                <span className="sr-only">Search archived sessions</span>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search archived sessions"
                  autoComplete="off"
                />
              </label>
              <label className="filter-select">
                <span>State</span>
                <Select value={archiveState} onValueChange={(value) => setArchiveState(value as CodexArchiveState)}>
                  <SelectTrigger aria-label="Archive state">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active archive</SelectItem>
                    <SelectItem value="trash">Trash</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </section>

            <section className="skill-list codex-archive-list" aria-label="Archived Codex sessions">
              <div className="skill-table-scroll codex-archive-scroll">
                <Table className="codex-archive-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead><SortableHeader label="Title" sortKey="title" sort={archiveSort} onSort={updateArchiveSort} /></TableHead>
                      <TableHead><SortableHeader label="Archived at" sortKey="archived_at" sort={archiveSort} onSort={updateArchiveSort} /></TableHead>
                      <TableHead><SortableHeader label="Updated" sortKey="updated_at" sort={archiveSort} onSort={updateArchiveSort} /></TableHead>
                      <TableHead><SortableHeader label="Workspace" sortKey="cwd" sort={archiveSort} onSort={updateArchiveSort} /></TableHead>
                      <TableHead><SortableHeader label="Source" sortKey="source" sort={archiveSort} onSort={updateArchiveSort} /></TableHead>
                      <TableHead><SortableHeader label="Size" sortKey="size" sort={archiveSort} onSort={updateArchiveSort} /></TableHead>
                      <TableHead className="action-cell">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? <SkeletonRows columns={7} /> : null}

                    {!loading && filteredArchiveRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <div className="empty-state">
                            <h2>No archived sessions</h2>
                            <p>{archiveState === "active" ? "Archived Codex sessions will appear here." : "Deleted archived sessions are kept here until restored."}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}

                    {!loading &&
                      archivePageRows.map((row) => (
                        <TableRow
                          className={archiveSession?.item.fileName === row.fileName ? "skill-row codex-archive-row selected" : "skill-row codex-archive-row"}
                          key={archiveRowKey(row)}
                          tabIndex={0}
                          onClick={() => void openArchiveSession(row)}
                          onKeyDown={(event) =>
                            selectRowWithKeyboard(event, archiveRowKey(row), () => {
                              void openArchiveSession(row);
                            })
                          }
                        >
                          <TableCell>
                            <span className="skill-main archive-title-cell" title={`${row.title}\n${row.sessionId}`}>
                              <strong>{row.title}</strong>
                              <small>{shortSessionId(row.sessionId)}</small>
                            </span>
                          </TableCell>
                          <TableCell><span className="skill-time">{formatArchiveDate(row.archivedAt)}</span></TableCell>
                          <TableCell><span className="skill-time">{formatTimestamp(row.updatedAt)}</span></TableCell>
                          <TableCell><span className="archive-cwd archive-workspace-cell" title={row.cwd ?? "Unknown workspace"}>{row.cwd ?? "Unknown"}</span></TableCell>
                          <TableCell><span className="archive-cwd" title={row.sourceLabel}>{row.sourceLabel}</span></TableCell>
                          <TableCell><span className="skill-time">{formatFileSize(row.fileSize)}</span></TableCell>
                          <TableCell className="action-cell" onClick={(event) => event.stopPropagation()}>
                            {archiveState === "active" ? (
                              <ActionIconButton
                                label={`Delete archived session ${row.title}`}
                                busy={busyId === `archive-delete:${archiveRowKey(row)}`}
                                disabled={busyId !== null && busyId !== `archive-delete:${archiveRowKey(row)}`}
                                icon={<Trash2 size={14} aria-hidden="true" />}
                                tone="danger"
                                onClick={() => setPendingArchiveDelete(row)}
                              />
                            ) : (
                              <ActionIconButton
                                label={`Restore archived session ${row.title}`}
                                busy={busyId === `archive-restore:${archiveRowKey(row)}`}
                                disabled={busyId !== null && busyId !== `archive-restore:${archiveRowKey(row)}`}
                                icon={<RotateCcw size={14} aria-hidden="true" />}
                                onClick={() => void runArchiveSessionAction("restore", row)}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
              <div className="pagination-bar" aria-label="Archived skill pagination">
                <div className="pagination-summary">
                  <strong>{filteredArchiveRows.length === 0 ? "0" : `${pageStart}-${pageEnd}`}</strong>
                  <span>of {filteredArchiveRows.length}</span>
                </div>
                <label className="page-size-select">
                  <span>Rows</span>
                  <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value) as PageSize)}>
                    <SelectTrigger aria-label="Rows per page">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pageSizes.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <div className="pagination-actions">
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                    disabled={loading || filteredArchiveRows.length === 0 || currentPageIndex === 0}
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                    <span className="sr-only">Previous page</span>
                  </Button>
                  <span className="pagination-page">Page {currentPageIndex + 1} / {pageCount}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
                    disabled={loading || filteredArchiveRows.length === 0 || currentPageIndex >= pageCount - 1}
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                    <span className="sr-only">Next page</span>
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

      {configured && activeView === "archive" && archiveDetailOpen && archiveSession ? (
        <CodexArchiveDrawer
          preview={archiveSession}
          busyId={busyId}
          onClose={() => setArchiveDetailOpen(false)}
          onDelete={(row) => setPendingArchiveDelete(row)}
          onRestore={(row) => void runArchiveSessionAction("restore", row)}
        />
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

      <ArchiveDeleteDialog
        row={pendingArchiveDelete}
        busyId={busyId}
        onClose={() => setPendingArchiveDelete(null)}
        onConfirm={() => void confirmArchiveDelete()}
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

      <RepoConflictsDialog
        state={repoConflictState}
        busyId={busyId}
        onClose={() => setRepoConflictState(null)}
        onSelect={(skillId, source) => {
          setRepoConflictState((current) =>
            current ? { ...current, selections: { ...current.selections, [skillId]: source } } : current
          );
        }}
        onResolve={() => void resolveRepoConflicts()}
      />

    </div>
  );
}

function SortableHeader<TSortKey extends string>({
  label,
  sortKey,
  sort,
  onSort
}: {
  label: string;
  sortKey: TSortKey;
  sort: SortState<TSortKey>;
  onSort: (key: TSortKey) => void;
}) {
  const active = sort.key === sortKey;
  const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
  const Icon = active ? (sort.direction === "asc" ? ChevronUp : ChevronDown) : ArrowUpDown;

  return (
    <span className="sortable-head" data-sort={ariaSort}>
      <button
        className={active ? "table-sort-button active" : "table-sort-button"}
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        <Icon size={13} aria-hidden="true" />
      </button>
    </span>
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
  return (
    <Checkbox
      checked={mixed ? "indeterminate" : checked}
      onChange={(event) => onChange(event.target.checked)}
      aria-label="Select visible skills"
      aria-checked={mixed ? "mixed" : checked}
    />
  );
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
    lastUsedAt: skill.lastUsedAt ?? null,
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
      lastUsedAt: latestScannedUsageAt(skills),
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

function latestScannedUsageAt(skills: Array<{ lastUsedAt?: string | null }>): string | null {
  return latestTimestamp(skills.map((skill) => skill.lastUsedAt ?? null));
}

function latestTimestamp(values: Array<string | null>): string | null {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
  );
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

function archiveRowKey(row: CodexArchiveSession | CodexArchiveRow) {
  return `${"state" in row ? row.state : "active"}:${row.fileName}`;
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

function canStopSyncing(row: SkillRow) {
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

function requiresConfirmation(endpoint: SkillActionEndpoint) {
  return endpoint === "stop-syncing" || endpoint === "remove-local";
}

function StatusTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "risk" }) {
  return (
    <div className={`status-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SummaryAction({
  icon,
  label,
  value,
  detail,
  tone = "neutral",
  disabled,
  onClick
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "risk";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`summary-action ${tone}`} type="button" onClick={onClick} disabled={disabled}>
      <span className="summary-action-head">
        <span className="summary-action-icon">{icon}</span>
        <span>{label}</span>
      </span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </button>
  );
}

function UsageTraceStatus({ status }: { status: UsageMonitorStatus }) {
  const healthy = status.enabled && !status.lastError;
  const label = status.running ? "Scanning" : status.enabled ? "Listening" : "Paused";

  return (
    <div className={`usage-trace-status ${status.lastError ? "risk" : healthy ? "good" : "neutral"}`}>
      <span className="summary-action-head">
        <span className="summary-action-icon">
          <Clock3 size={15} aria-hidden="true" />
        </span>
        <span>Usage scan</span>
      </span>
      <strong>{label}</strong>
      <small>
        {status.lastError
          ? status.lastError
          : `Tool-call scan every ${Math.round(status.intervalMs / 1000)}s. Last scan ${formatMonitorTime(status.lastScanCompletedAt)}.`}
      </small>
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

function BranchSyncBadge({ status, busy, onReview }: { status: GitBranchSyncStatus; busy?: boolean; onReview?: () => void }) {
  const label = branchSyncLabel(status);
  const needsAttention = status.state === "ahead" || status.state === "behind" || status.state === "diverged";
  const className = `branch-sync-badge ${status.state}${needsAttention ? " attention" : ""}`;
  const content = (
    <>
      {busy ? <Loader2 className="spin" size={13} aria-hidden="true" /> : needsAttention ? <CircleAlert size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
      {label}
    </>
  );

  if (onReview) {
    return (
      <button className={`${className} branch-sync-button`} title="Review repo conflicts" type="button" onClick={onReview} disabled={busy}>
        {content}
      </button>
    );
  }

  return (
    <span className={className} title={branchSyncTitle(status)} role="status" aria-live="polite">
      {content}
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
  const stopSyncingBusy = busyId === actionBusyId("stop-syncing", row);
  const removeBusy = busyId === actionBusyId("remove-local", row);
  const editBusy = busyId === `editor-open:${rowKey(row)}`;
  const compareBusy = busyId === actionBusyId("compare", row);
  const hasAction =
    canCompareVersions(row) ||
    canEditLocal(row) ||
    canAddToSync(row) ||
    canInstallLocal(row) ||
    canUpdateLocal(row) ||
    canStopSyncing(row) ||
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
      {canStopSyncing(row) ? (
        <ActionIconButton
          label="Stop syncing"
          busy={stopSyncingBusy}
          disabled={busyId !== null && !stopSyncingBusy}
          icon={<Unlink2 size={14} aria-hidden="true" />}
          onClick={() => onAction("stop-syncing", row)}
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
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`row-action icon-only${tone ? ` ${tone}` : ""}`}
            type="button"
            aria-label={label}
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
            disabled={disabled}
          >
            {busy ? <Loader2 className="spin" size={14} aria-hidden="true" /> : icon}
            <span className="sr-only">{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

function RepoConflictsDialog({
  state,
  busyId,
  onClose,
  onSelect,
  onResolve
}: {
  state: { conflicts: RepoSkillConflict[]; selections: Record<string, RepoConflictSource> } | null;
  busyId: string | null;
  onClose: () => void;
  onSelect: (skillId: string, source: RepoConflictSource) => void;
  onResolve: () => void;
}) {
  const busy = busyId !== null && state !== null;
  const resolving = busyId === "repo-conflicts-resolve";
  const conflictCount = state?.conflicts.length ?? 0;

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
          <DialogContent className="confirm-dialog compare-dialog repo-conflict-dialog" aria-labelledby="repo-conflicts-title" aria-describedby="repo-conflicts-description">
            <DialogHeader className="compare-header">
              <div className="confirm-icon" aria-hidden="true">
                <GitCompareArrows size={16} />
              </div>
              <div>
                <DialogTitle id="repo-conflicts-title">Review repo conflicts</DialogTitle>
                <DialogDescription id="repo-conflicts-description">
                  Choose the canonical version for each conflicted skill. System metadata is merged automatically.
                </DialogDescription>
              </div>
            </DialogHeader>
            <div className="repo-conflict-stack">
              {state.conflicts.map((conflict) => {
                const selectedSource = state.selections[conflict.skillId];
                return (
                  <section className="repo-conflict-card" key={conflict.skillId}>
                    <div className="repo-conflict-card-head">
                      <div>
                        <h3>{conflict.skillId}</h3>
                        <p>{conflict.files.length} conflicted file{conflict.files.length === 1 ? "" : "s"}</p>
                      </div>
                      <Badge variant="destructive">Needs choice</Badge>
                    </div>
                    <div className="repo-conflict-files">
                      {conflict.files.slice(0, 4).map((filePath) => (
                        <code key={filePath}>{filePath}</code>
                      ))}
                      {conflict.files.length > 4 ? <span>+{conflict.files.length - 4} more</span> : null}
                    </div>
                    <div className="compare-source-grid">
                      {conflict.versions.map((version) => {
                        const selected = selectedSource === version.source;
                        return (
                          <section className={`compare-source repo-version-card${selected ? " selected" : ""}`} key={version.source}>
                            <div className="compare-source-title">
                              <strong>{repoConflictSourceLabel(version.source)}</strong>
                              <span>{version.exists ? (selected ? "Selected" : "Available") : "Missing"}</span>
                            </div>
                            <p className="compare-source-path">{version.path}</p>
                            <pre className="compare-source-content">
                              <code>{version.content ?? "No SKILL.md present in this source."}</code>
                            </pre>
                            <div className="compare-source-actions">
                              <Button
                                variant={selected ? "default" : "secondary"}
                                size="sm"
                                type="button"
                                onClick={() => onSelect(conflict.skillId, version.source)}
                                disabled={busy || !version.exists}
                                title={version.exists ? `Use ${repoConflictSourceLabel(version.source)} for ${conflict.skillId}` : `${version.label} is missing`}
                              >
                                <CheckCircle2 size={14} aria-hidden="true" />
                                Use this version
                              </Button>
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            <DialogFooter className="compare-footer">
              <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
                <X size={15} aria-hidden="true" />
                Cancel
              </Button>
              <Button type="button" onClick={onResolve} disabled={busy || conflictCount === 0}>
                {resolving ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <GitCompareArrows size={15} aria-hidden="true" />}
                Resolve and push
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

function confirmDialogCopy(endpoint: SkillActionEndpoint, row: SkillRow) {
  const skillName = row.name || row.id;
  if (endpoint === "stop-syncing") {
    return {
      title: `Stop syncing ${skillName}?`,
      description:
        "This deletes the synced repository copy and metadata record. Installed local copies stay available on this machine.",
      confirmLabel: "Stop syncing",
      icon: <Unlink2 size={16} aria-hidden="true" />,
      danger: true,
      scope: [
        { label: "Local copies", value: "Kept installed" },
        { label: "Sync repo", value: "Delete repo/skills copy and metadata" },
        { label: "Git remote", value: "Commit and push the removal" }
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
      { label: "Git remote", value: "No sync state change" }
    ]
  };
}

function ArchiveDeleteDialog({
  row,
  busyId,
  onClose,
  onConfirm
}: {
  row: CodexArchiveRow | null;
  busyId: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const busy = row ? busyId === `archive-delete:${archiveRowKey(row)}` : false;

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
          <DialogContent className="confirm-dialog" aria-labelledby="archive-delete-title" aria-describedby="archive-delete-description">
            <DialogHeader className="confirm-dialog-header">
              <div className="confirm-icon" aria-hidden="true">
                <Trash2 size={16} />
              </div>
              <div>
                <DialogTitle id="archive-delete-title">Delete archived session?</DialogTitle>
                <DialogDescription id="archive-delete-description">
                  This moves the archived session to Trash. You can restore it from the Trash view.
                </DialogDescription>
              </div>
            </DialogHeader>
            <DialogFooter className="confirm-dialog-footer">
              <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button variant="destructive" type="button" onClick={onConfirm} disabled={busy}>
                {busy ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </DialogPortal>
    </Dialog>
  );
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
              <SheetTitle>{selected.name || selected.id}</SheetTitle>
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

function CodexArchiveDrawer({
  preview,
  busyId,
  onClose,
  onDelete,
  onRestore
}: {
  preview: CodexArchivePreviewResponse;
  busyId: string | null;
  onClose: () => void;
  onDelete: (row: CodexArchiveRow) => void;
  onRestore: (row: CodexArchiveRow) => void;
}) {
  const row: CodexArchiveRow = {
    ...preview.item,
    state: preview.state,
    sourceLabel: preview.item.source || "Unknown"
  };
  const action = preview.state === "active" ? "delete" : "restore";
  const actionBusyId = `archive-${action}:${archiveRowKey(row)}`;
  const busy = busyId === actionBusyId;

  return (
    <Sheet open={true} onOpenChange={onClose}>
      <SheetContent className="detail-drawer codex-archive-drawer">
        <SheetHeader>
          <div className="drawer-title-row">
            <div>
              <p className="eyebrow">{preview.state === "active" ? "Archived session" : "Archive trash"}</p>
              <SheetTitle>{row.title}</SheetTitle>
            </div>
            <Button className="icon-button" variant="outline" size="icon" type="button" onClick={onClose} aria-label="Close archived session">
              <X size={18} aria-hidden="true" />
            </Button>
          </div>
          <p>{row.sessionId}</p>
          <div className="drawer-badges">
            <span className={`source-badge repo`}>{row.sourceLabel}</span>
            <Badge variant={preview.state === "active" ? "success" : "warning"}>{preview.state === "active" ? "Active archive" : "Trash"}</Badge>
          </div>
        </SheetHeader>

        <div className="detail-metadata" aria-label="Archived session summary">
          <DetailField label="Archived" value={formatArchiveDate(row.archivedAt)} />
          <DetailField label="Updated" value={formatTimestamp(row.updatedAt)} />
          <DetailField label="Source" value={row.sourceLabel} />
          <DetailField label="File size" value={formatFileSize(row.fileSize)} />
        </div>

        <div className="detail-section">
          <h3>Metadata</h3>
          <KeyValue label="File" value={row.fileName} />
          <KeyValue label="Session id" value={row.sessionId} />
          <KeyValue label="Workspace" value={row.cwd ?? "Unknown"} />
        </div>

        <div className="detail-section">
          <h3>Preview</h3>
          <pre className="archive-preview">
            <code>{preview.preview.join("\n") || "No preview available."}</code>
          </pre>
          {preview.truncated ? <p className="preview-note">Preview is truncated. Full session content is not loaded by default.</p> : null}
        </div>

        <div className="editor-footer">
          {preview.state === "active" ? (
            <Button variant="destructive" type="button" onClick={() => onDelete(row)} disabled={busyId !== null && !busy}>
              {busy ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
              Delete
            </Button>
          ) : (
            <Button variant="primary" type="button" onClick={() => onRestore(row)} disabled={busyId !== null && !busy}>
              {busy ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}
              Restore
            </Button>
          )}
          <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
            <X size={15} aria-hidden="true" />
            Close
          </Button>
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
              <SheetTitle>Edit SKILL.md</SheetTitle>
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

function SkeletonRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 9 }).map((_, index) => (
        <TableRow className="skeleton-row" key={index} aria-hidden="true">
          <TableCell colSpan={columns}>
            <Skeleton className="skeleton-line" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function filterLabel(filter: Filter) {
  if (filter === "all") return "All";
  return syncLabel(filter);
}

function viewTitle(view: View) {
  const titles: Record<View, string> = {
    skills: "Skills",
    archive: "Codex Archive",
    settings: "Settings"
  };

  return titles[view];
}

function viewFromLocation(): View {
  if (typeof window === "undefined") {
    return "skills";
  }

  return viewFromPath(window.location.pathname);
}

function viewFromPath(pathname: string): View {
  switch (normalizeRoutePath(pathname)) {
    case "/codex-archive":
    case "/archive":
      return "archive";
    case "/settings":
      return "settings";
    case "/":
    case "/skills":
    default:
      return "skills";
  }
}

function normalizeRoutePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function readInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(themeStorageKey);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function nextSortState<TSortKey extends string>(current: SortState<TSortKey>, key: TSortKey): SortState<TSortKey> {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc"
    };
  }

  return {
    key,
    direction: defaultSortDirection(key)
  };
}

function defaultSortDirection(key: string): SortDirection {
  return key.includes("used") || key.includes("modified") || key.includes("archived") ? "desc" : "asc";
}

function compareSkillRows(a: SkillRow, b: SkillRow, sort: SortState<SkillSortKey>) {
  let result = 0;
  switch (sort.key) {
    case "name":
      result = compareRowNames(a, b, sort.direction);
      break;
    case "source":
      result = compareTextValues(sourceLabel(a.source), sourceLabel(b.source), sort.direction);
      break;
    case "state":
      result = compareTextValues(syncLabel(a.syncState), syncLabel(b.syncState), sort.direction);
      break;
    case "local_copy":
      result = compareTextValues(a.installed ? "Installed" : "Missing", b.installed ? "Installed" : "Missing", sort.direction);
      break;
    case "local_modified":
      result = compareTimestampValues(a.localModifiedAt, b.localModifiedAt, sort.direction);
      break;
    case "last_used":
      result = compareTimestampValues(a.lastUsedAt, b.lastUsedAt, sort.direction);
      break;
  }

  return result || compareRowNames(a, b, "asc");
}

function compareArchiveRows(a: CodexArchiveRow, b: CodexArchiveRow, sort: SortState<ArchiveSortKey>) {
  let result = 0;
  switch (sort.key) {
    case "title":
      result = compareTextValues(a.title, b.title, sort.direction);
      break;
    case "archived_at":
      result = compareTimestampValues(a.archivedAt, b.archivedAt, sort.direction);
      break;
    case "updated_at":
      result = compareTimestampValues(a.updatedAt, b.updatedAt, sort.direction);
      break;
    case "cwd":
      result = compareTextValues(a.cwd ?? "", b.cwd ?? "", sort.direction);
      break;
    case "source":
      result = compareTextValues(a.source ?? "", b.source ?? "", sort.direction);
      break;
    case "size":
      result = sort.direction === "asc" ? a.fileSize - b.fileSize : b.fileSize - a.fileSize;
      break;
  }

  return result || compareTextValues(a.title, b.title, "asc") || compareTextValues(a.sessionId, b.sessionId, "asc");
}

function compareRowNames(a: SkillRow, b: SkillRow, direction: SortDirection) {
  return compareNamedRecords(a, b, direction);
}

function compareNamedRecords(a: { id: string; name: string }, b: { id: string; name: string }, direction: SortDirection) {
  return compareTextValues(a.name || a.id, b.name || b.id, direction) || compareTextValues(a.id, b.id, direction);
}

function compareTextValues(a: string, b: string, direction: SortDirection) {
  const result = a.localeCompare(b, undefined, { sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

function compareTimestampValues(a: string | null, b: string | null, direction: SortDirection) {
  const aTime = parseTimestamp(a);
  const bTime = parseTimestamp(b);
  if (aTime !== null && bTime !== null) {
    return direction === "asc" ? aTime - bTime : bTime - aTime;
  }

  if (aTime !== null) {
    return -1;
  }

  if (bTime !== null) {
    return 1;
  }

  return 0;
}

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
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
    return `Push needed ${status.ahead}`;
  }

  if (status.state === "behind") {
    return `Remote changes ${status.behind}`;
  }

  if (status.state === "diverged") {
    return `Sync conflict +${status.ahead}/-${status.behind}`;
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

function repoConflictSourceLabel(source: RepoConflictSource) {
  const labels: Record<RepoConflictSource, string> = {
    github: "GitHub version",
    syncRepo: "Sync repo local",
    codex: "Codex installed copy",
    agents: "Agents installed copy"
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

function shortSessionId(sessionId: string) {
  return sessionId.length > 18 ? `${sessionId.slice(0, 8)}…${sessionId.slice(-6)}` : sessionId;
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
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

function formatMonitorTime(value: string | null) {
  return value ? formatTimestamp(value) : "Not yet";
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

function selectRowWithKeyboard(event: KeyboardEvent<HTMLElement>, id: string, setSelectedId: (id: string) => void) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  setSelectedId(id);
}
