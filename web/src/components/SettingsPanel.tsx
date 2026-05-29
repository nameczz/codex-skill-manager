import type { ReactNode } from "react";
import { FolderGit2, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

export type SetupPaths = {
  syncRepo: string;
  codexSkillsDir: string;
  agentsSkillsDir: string;
  cacheDir: string;
};

export type SetupPathField = keyof SetupPaths | "setupRoot";

type SettingsPanelProps = {
  paths: SetupPaths;
  busyId: string | null;
  selectingPath: SetupPathField | null;
  onPathChange: (field: keyof SetupPaths, value: string) => void;
  onChoose: (field: keyof SetupPaths, title: string) => void;
  onSave: () => void;
};

export function SettingsPanel({
  paths,
  busyId,
  selectingPath,
  onPathChange,
  onChoose,
  onSave
}: SettingsPanelProps) {
  const saving = busyId === "save-config";

  return (
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
  );
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

export function PathInput({
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

export function PathSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="path-summary">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}
