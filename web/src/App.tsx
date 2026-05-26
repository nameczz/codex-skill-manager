import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Archive,
  Box,
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
  Loader2,
  PlusCircle,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
  X
} from "lucide-react";
import type { ApiStatus, LocalSkillSource, SkillRow, StatusReport, SyncResult, UsageHookStatus } from "./types";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Checkbox } from "./components/ui/checkbox";
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

type Filter = (typeof filters)[number];
type SetupPaths = {
  syncRepo: string;
  codexSkillsDir: string;
  agentsSkillsDir: string;
  cacheDir: string;
};
type SetupPathField = keyof SetupPaths | "setupRoot";
type View = "skills" | "settings";
type EditorState = {
  rowKey: string;
  path: string;
  content: string;
  dirty: boolean;
};

export function App() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("skills");
  const [checkedRowKeys, setCheckedRowKeys] = useState<string[]>([]);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
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

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/status");
      const payload = (await response.json()) as ApiStatus;
      setStatus(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load status.");
    } finally {
      setLoading(false);
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

  const selected = rows.find((row) => rowKey(row) === selectedRowKey) ?? null;
  const editorRow = editorState ? rows.find((row) => rowKey(row) === editorState.rowKey) ?? null : null;
  const selectedRows = useMemo(() => {
    const checked = new Set(checkedRowKeys);
    return rows.filter((row) => checked.has(rowKey(row)));
  }, [checkedRowKeys, rows]);
  const importableSelectedRows = selectedRows.filter(canAddToSync);
  const installableSelectedRows = selectedRows.filter(canInstallLocal);
  const updatableSelectedRows = selectedRows.filter(canUpdateLocal);
  const visibleRowsSelected = filteredRows.length > 0 && filteredRows.every((row) => checkedRowKeys.includes(rowKey(row)));
  const someVisibleRowsSelected = filteredRows.some((row) => checkedRowKeys.includes(rowKey(row)));
  const configured = status?.configured === true;
  const activeView = configured ? view : "skills";
  const report = configured ? status.report : null;
  const repoHasPendingChanges = configured && status.gitStatus.trim().length > 0;
  const cleanCount = rows.filter((row) => row.syncState === "clean").length;
  const reviewCount = rows.filter((row) => row.syncState !== "clean").length;
  const setupRepoSelected = setupPaths.syncRepo.trim().length > 0;

  useEffect(() => {
    if (selectedRowKey && !rows.some((row) => rowKey(row) === selectedRowKey)) {
      setSelectedRowKey(null);
      setDetailOpen(false);
    }
  }, [rows, selectedRowKey]);

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
      } else if (detailOpen) {
        setDetailOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [detailOpen, editorState]);

  useEffect(() => {
    function syncShortcut(event: globalThis.KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== "s") {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.matches("input, textarea, select")) {
        return;
      }

      if (!configured || activeView !== "skills" || editorState || busyId !== null || selectedRows.length === 0) {
        return;
      }

      event.preventDefault();
      void runSyncSelected();
    }

    window.addEventListener("keydown", syncShortcut);
    return () => window.removeEventListener("keydown", syncShortcut);
  }, [activeView, busyId, configured, editorState, selectedRows]);

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

  async function runSkillAction(
    endpoint: "import" | "install" | "update-local" | "archive" | "remove-local",
    row: SkillRow
  ) {
    if (!confirmSkillAction(endpoint, row)) {
      return;
    }

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
      await refresh();
      setSelectedRowKey(endpoint === "import" && row.source !== "repo" ? `managed:${row.source}:${row.id}` : rowKey(row));
    } catch (err) {
      setError(err instanceof Error ? err.message : `${endpoint} failed.`);
    } finally {
      setBusyId(null);
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
      for (const row of targetRows) {
        const response = await fetch(`/api/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(skillActionBody(row))
        });
        if (!response.ok) {
          throw new Error(await readError(response));
        }
      }

      const completedKeys = new Set(targetRows.map(rowKey));
      setCheckedRowKeys((current) => current.filter((key) => !completedKeys.has(key)));
      await refresh();
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

      await refresh();
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

  async function openSkillEditor(row: SkillRow) {
    if (!canEditLocal(row)) {
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
        body: JSON.stringify(skillActionBody(row))
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as { path: string; content: string };
      setSelectedRowKey(key);
      setDetailOpen(false);
      setEditorState({ rowKey: key, path: payload.path, content: payload.content, dirty: false });
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
        body: JSON.stringify({ ...skillActionBody(row), content: editorState.content })
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setEditorState((current) => (current?.rowKey === key ? { ...current, dirty: false } : current));
      await refresh();
      setSelectedRowKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save SKILL.md.");
    } finally {
      setBusyId(null);
    }
  }

  async function runSyncSelected() {
    if (!configured || busyId !== null || (selectedRows.length === 0 && !repoHasPendingChanges)) {
      return;
    }

    setError(null);
    setNotice(null);
    setBusyId("sync");
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(syncActionBody(selectedRows))
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as { result: SyncResult };
      setNotice(syncResultMessage(payload.result));
      setCheckedRowKeys([]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setBusyId(null);
    }
  }

  function toggleVisibleRows(checked: boolean) {
    const visibleKeys = filteredRows.map(rowKey);
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
          <Button className="nav-item disabled" variant="outline" size="sm" type="button" disabled>
            <Archive size={16} aria-hidden="true" />
            Archive
            <span>Planned</span>
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
            <h1>{activeView === "settings" ? "Settings" : "Skills"}</h1>
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
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={() => void runSyncSelected()}
              disabled={!configured || activeView !== "skills" || busyId !== null || (selectedRows.length === 0 && !repoHasPendingChanges)}
            >
              {busyId === "sync" ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
              {selectedRows.length > 0 ? "Sync selected" : repoHasPendingChanges ? "Sync repo changes" : "Sync selected"}
            </Button>
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
                <Button className="path-stack-action" variant="secondary" size="sm" type="button" onClick={() => setView("settings")}>
                  <Settings size={14} aria-hidden="true" />
                  Change paths
                </Button>
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
                  className="button primary"
                  type="button"
                  onClick={() => void runSyncSelected()}
                  disabled={busyId !== null || selectedRows.length === 0}
                >
                  {busyId === "sync" ? <Loader2 className="spin" size={14} aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                  Sync selected
                </Button>
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
                filteredRows.map((row) => (
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
                    <RowAction row={row} busyId={busyId} onAction={runSkillAction} onEdit={openSkillEditor} />
                  </div>
                ))}
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

function buildRows(report: StatusReport): SkillRow[] {
  const managed: SkillRow[] = report.managed.map((skill) => ({
    kind: "managed",
    id: skill.id,
    name: skill.name,
    description: skill.description,
    status: skill.status,
    syncState: skill.syncState,
    installed: skill.installed,
    source: skill.localSource ?? "codex",
    repoHash: skill.currentRepoHash,
    localHash: skill.currentLocalHash,
    lastUsedAt: skill.lastUsedAt,
    repoPath: `${report.syncRepo}/skills/${skill.id}`,
    localPath: `${localRootForSource(report, skill.localSource ?? "codex")}/${skill.id}`,
    updatedAt: skill.updatedAt
  }));

  const unmanaged: SkillRow[] = report.unmanagedLocal.map((skill) => ({
    kind: "unmanaged",
    id: skill.id,
    name: skill.name,
    description: skill.description,
    syncState: "unmanaged",
    source: skill.source === "agents" ? "agents" : "codex",
    installed: true,
    repoHash: null,
    localHash: skill.hash,
    lastUsedAt: null,
    repoPath: null,
    localPath: skill.path,
    updatedAt: null
  }));

  const repoOnly: SkillRow[] = report.repoOnly.map((skill) => ({
    kind: "repo-only",
    id: skill.id,
    name: skill.name,
    description: skill.description,
    syncState: "repo_only",
    source: "repo",
    installed: false,
    repoHash: skill.hash,
    localHash: null,
    lastUsedAt: null,
    repoPath: skill.path,
    localPath: null,
    updatedAt: null
  }));

  return [...managed, ...unmanaged, ...repoOnly].sort((a, b) => a.id.localeCompare(b.id));
}

function localRootForSource(report: StatusReport, source: LocalSkillSource): string {
  return source === "agents" ? report.agentsSkillsDir : report.codexSkillsDir;
}

function rowKey(row: SkillRow) {
  return `${row.kind}:${row.source}:${row.id}`;
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

function canEditLocal(row: SkillRow) {
  return row.installed && (row.source === "codex" || row.source === "agents") && Boolean(row.localPath);
}

function canArchive(row: SkillRow) {
  return row.kind === "managed";
}

function canRemoveLocal(row: SkillRow) {
  return row.installed && (row.source === "codex" || row.source === "agents");
}

function skillActionBody(row: SkillRow): { skillId: string; source?: LocalSkillSource } {
  return row.source === "codex" || row.source === "agents" ? { skillId: row.id, source: row.source } : { skillId: row.id };
}

function syncActionBody(rows: SkillRow[]): { skills: Array<{ skillId: string; source?: LocalSkillSource }> } {
  return { skills: rows.map(skillActionBody) };
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

function actionBusyId(endpoint: "import" | "install" | "update-local" | "archive" | "remove-local", row: SkillRow) {
  return `${endpoint}:${rowKey(row)}`;
}

function confirmSkillAction(endpoint: "import" | "install" | "update-local" | "archive" | "remove-local", row: SkillRow) {
  if (endpoint === "archive") {
    return window.confirm(`Archive "${row.name || row.id}" in the sync repository? The local copy is not removed.`);
  }

  if (endpoint === "remove-local") {
    return window.confirm(`Remove the local copy of "${row.name || row.id}" from this machine? The sync repository copy is not archived.`);
  }

  return true;
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

function RowAction({
  row,
  busyId,
  onAction,
  onEdit
}: {
  row: SkillRow;
  busyId: string | null;
  onAction: (
    endpoint: "import" | "install" | "update-local" | "archive" | "remove-local",
    row: SkillRow
  ) => Promise<void>;
  onEdit: (row: SkillRow) => Promise<void>;
}) {
  const importBusy = busyId === actionBusyId("import", row);
  const installBusy = busyId === actionBusyId("install", row);
  const updateBusy = busyId === actionBusyId("update-local", row);
  const archiveBusy = busyId === actionBusyId("archive", row);
  const removeBusy = busyId === actionBusyId("remove-local", row);
  const editBusy = busyId === `editor-open:${rowKey(row)}`;
  const hasAction = canEditLocal(row) || canAddToSync(row) || canInstallLocal(row) || canUpdateLocal(row) || canArchive(row) || canRemoveLocal(row);

  if (!hasAction) {
    return <span className="row-actions muted">View</span>;
  }

  return (
    <span className="row-actions">
      {canEditLocal(row) ? (
        <Button
          variant="ghost"
          size="sm"
          className="row-action"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onEdit(row);
          }}
          disabled={busyId !== null && !editBusy}
        >
          {editBusy ? <Loader2 className="spin" size={14} aria-hidden="true" /> : <FilePenLine size={14} aria-hidden="true" />}
          Edit
        </Button>
      ) : null}
      {canAddToSync(row) ? (
        <Button
          variant="ghost"
          size="sm"
          className="row-action"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onAction("import", row);
          }}
          disabled={busyId !== null && !importBusy}
        >
          {importBusy ? <Loader2 className="spin" size={14} aria-hidden="true" /> : <PlusCircle size={14} aria-hidden="true" />}
          Add to sync
        </Button>
      ) : null}
      {canInstallLocal(row) ? (
        <Button
          variant="ghost"
          size="sm"
          className="row-action"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onAction("install", row);
          }}
          disabled={busyId !== null && !installBusy}
        >
          {installBusy ? <Loader2 className="spin" size={14} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
          Install local
        </Button>
      ) : null}
      {canUpdateLocal(row) ? (
        <Button
          variant="ghost"
          size="sm"
          className="row-action"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onAction("update-local", row);
          }}
          disabled={busyId !== null && !updateBusy}
        >
          {updateBusy ? <Loader2 className="spin" size={14} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
          Update local
        </Button>
      ) : null}
      {canArchive(row) ? (
        <Button
          variant="ghost"
          size="sm"
          className="row-action"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onAction("archive", row);
          }}
          disabled={busyId !== null && !archiveBusy}
        >
          {archiveBusy ? <Loader2 className="spin" size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
          Archive repo
        </Button>
      ) : null}
      {canRemoveLocal(row) ? (
        <Button
          variant="ghost"
          size="sm"
          className="row-action"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onAction("remove-local", row);
          }}
          disabled={busyId !== null && !removeBusy}
        >
          {removeBusy ? <Loader2 className="spin" size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
          Remove local
        </Button>
      ) : null}
    </span>
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
          <DetailField label="Updated" value={formatTimestamp(selected.updatedAt)} />
        </div>

        <div className="detail-section">
          <h3>Paths</h3>
          <KeyValue label="Local copy" value={selected.localPath ?? "Missing on this machine"} />
          <KeyValue label="Sync repo" value={selected.repoPath ?? "Not added to sync"} />
        </div>

        <div className="detail-section">
          <h3>Hashes</h3>
          <KeyValue label="Local hash" value={shortHash(selected.localHash)} />
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
            <span className={`source-badge ${row.source}`}>{sourceLabel(row.source)}</span>
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

function sourceLabel(source: SkillRow["source"]) {
  const labels: Record<SkillRow["source"], string> = {
    codex: "Codex local",
    agents: "Agents local",
    repo: "Sync repo"
  };

  return labels[source];
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
