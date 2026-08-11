import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CampaignNote, RuleEntry } from "../types";
import { AppView } from "../components/AppShell";
import { DropdownItem } from "../components/Modals";
import {
  BookOpen,
  FolderPlus,
  FileText,
  Palette,
  AudioLines,
  Image as ImageIcon,
  Zap,
  Swords,
  Map,
  Trash2,
} from "lucide-react";

interface FolderActionsDeps {
  setRules: React.Dispatch<React.SetStateAction<RuleEntry[]>>;
  setSelectedNoteId: (id: string) => void;
  setSelectedRuleId: (id: string) => void;
  setIsEditingNote: (editing: boolean) => void;
  setIsEditingRule: (editing: boolean) => void;
  setEditTitle: (title: string) => void;
  setEditContent: (content: string) => void;
  setEditFrontmatter: (fm: Record<string, any>) => void;
  activeEditingNoteIdRef: React.MutableRefObject<string | null>;
  setCurrentCanvasFolder: (folder: string | null) => void;
  setActiveView: (view: AppView) => void;
  saveNote: (note: CampaignNote) => Promise<void>;
  handleNewNote: (folder?: string) => Promise<void>;
  handleNewRule: (targetFolder?: string) => void;
  trashFolder: (folderName: string) => Promise<void>;
  deleteRulesFolder: (folderPath: string) => Promise<void>;
  currentNote: CampaignNote | undefined;
  currentRule: RuleEntry | undefined;
  notes: CampaignNote[];
  alert: (message: string) => void;
  showPrompt: (message: string, defaultValue?: string) => Promise<string | null>;
  confirm: (message: string, onConfirm: () => void) => void;
  pluginsList: Array<{ id: string; name: string; active?: boolean }>;
  contextMenu: {
    x: number;
    y: number;
    type: "note" | "folder" | "rule" | "rule-folder";
    targetId: string;
    path?: string;
    isRulebook?: boolean;
  } | null;
}

export const useFolderActions = (deps: FolderActionsDeps) => {
  const {
    setRules,
    setSelectedNoteId,
    setSelectedRuleId,
    setIsEditingNote,
    setIsEditingRule,
    setEditTitle,
    setEditContent,
    setEditFrontmatter,
    activeEditingNoteIdRef,
    setCurrentCanvasFolder,
    setActiveView,
    saveNote,
    handleNewNote,
    handleNewRule,
    trashFolder,
    deleteRulesFolder,
    currentNote,
    currentRule,
    notes,
    alert,
    showPrompt,
    confirm,
    pluginsList,
    contextMenu,
  } = deps;

  const [pendingAssetTarget, setPendingAssetTarget] = useState<{
    folderName: string;
    type: "audio" | "image" | "file";
    isRulebook: boolean;
  } | null>(null);
  const assetFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleNewFolder = useCallback(async (parentFolder?: string) => {
    const cleanParent = parentFolder && parentFolder !== "Root" ? parentFolder.replace(/\/+$/, "") : "";
    const defaultName = cleanParent ? `${cleanParent}/` : "";
    const folderName = await showPrompt(
      "Enter new folder name (e.g. Worldbuilding/Cities or Factions):",
      defaultName,
    );
    if (!folderName) return;
    const cleanFolderName = folderName.trim().replace(/\/+$/, "");
    if (!cleanFolderName) return;

    const newId = `note-${Date.now()}`;
    const newNote: CampaignNote = {
      id: newId,
      title: "Welcome",
      path: `${cleanFolderName}/Welcome.md`,
      frontmatter: { type: "Note", tags: ["draft"] },
      content: `# Welcome to ${cleanFolderName}\n\nStart organizing this folder!`,
    };

    setEditTitle(newNote.title);
    setEditContent(newNote.content);
    setEditFrontmatter(newNote.frontmatter);
    activeEditingNoteIdRef.current = newId;

    try {
      await saveNote(newNote);
      setSelectedNoteId(newId);
      setIsEditingNote(true);
      setActiveView("vault");
    } catch (err) {
      console.error("Failed to create new folder note:", err);
    }
  }, [saveNote, setSelectedNoteId, showPrompt]);

  const handleCreateItemInFolder = useCallback(
    async (
      folderName: string,
      type: "note" | "folder" | "canvas" | "audio" | "image",
      isRulebook: boolean = false,
    ) => {
      const cleanFolder = folderName === "Root" ? "" : folderName;
      const prefix = cleanFolder ? `${cleanFolder}/` : "";
      const timestamp = Date.now();

      if (isRulebook) {
        if (type === "note") {
          handleNewRule(cleanFolder || "General");
        } else if (type === "folder") {
          const cleanName = `Subfolder ${timestamp.toString().slice(-4)}`;
          handleNewRule(`${cleanFolder}/${cleanName}`);
        } else if (type === "canvas" || type === "audio" || type === "image") {
          const cleanName = `${type.toUpperCase()} Asset ${timestamp.toString().slice(-4)}`;
          const ext = type === "canvas" ? ".canvas" : type === "audio" ? ".mp3" : ".png";
          const newId = `rule-${timestamp}`;
          const newRule: RuleEntry = {
            id: newId,
            title: cleanName,
            path: `${prefix}${cleanName}${ext}`,
            category: type.toUpperCase(),
            source: "Asset",
            content: `# Asset: ${cleanName}\n\nType: ${type.toUpperCase()}\nPath: ${prefix}${cleanName}${ext}\n`,
          };
          setSelectedRuleId(newId);
          setIsEditingRule(true);
          setActiveView("rules");
          await saveNote(newRule as any).catch(() => {});
        }
        return;
      }

      if (type === "note") {
        await handleNewNote(cleanFolder || "Worldbuilding");
        setActiveView("vault");
      } else if (type === "folder") {
        await handleNewFolder(cleanFolder);
      } else if (type === "canvas") {
        const cleanTitle = `New Canvas ${timestamp.toString().slice(-4)}`;
        const canvasPath = `${prefix}${cleanTitle}.canvas`;
        const notePath = `${prefix}${cleanTitle}.canvas.md`;
        const newId = `note-${timestamp}`;

        const canvasNote: CampaignNote = {
          id: newId,
          title: cleanTitle,
          path: notePath,
          frontmatter: {
            type: "Canvas",
            canvasPath: canvasPath,
            tags: ["canvas"],
          },
          content: `# Canvas Board: ${cleanTitle}\n\nInteractive canvas file: \`${canvasPath}\`\n`,
        };

        setEditTitle(canvasNote.title);
        setEditContent(canvasNote.content);
        setEditFrontmatter(canvasNote.frontmatter);
        activeEditingNoteIdRef.current = newId;

        try {
          await invoke("save_canvas_file", {
            relPath: canvasPath,
            content: JSON.stringify({ nodes: [], edges: [], containers: [] }),
          });
          await saveNote(canvasNote);
          setSelectedNoteId(newId);
          setCurrentCanvasFolder(cleanFolder);
          setActiveView("canvas");
        } catch (err) {
          alert("Error creating canvas: " + err);
        }
      } else if (type === "audio" || type === "image") {
        setPendingAssetTarget({ folderName, type, isRulebook });
        setTimeout(() => {
          assetFileInputRef.current?.click();
        }, 50);
      }
    },
    [saveNote, handleNewNote, handleNewRule, handleNewFolder],
  );

  const handleAssetFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!pendingAssetTarget) return;

      const { folderName, type, isRulebook } = pendingAssetTarget;
      const cleanFolder = folderName === "Root" ? "" : folderName;
      const prefix = cleanFolder ? `${cleanFolder}/` : "";
      const cleanTitle = file
        ? file.name
        : (await showPrompt(`Enter ${type} title:`)) || `${type}-${Date.now()}`;
      const newId = isRulebook ? `rule-${Date.now()}` : `note-${Date.now()}`;

      if (!file) {
        if (isRulebook) {
          const newRule: RuleEntry = {
            id: newId,
            title: cleanTitle,
            path: `${prefix}${cleanTitle}.md`,
            category: type.toUpperCase(),
            source: "Asset",
            content: `# Asset: ${cleanTitle}\n\nType: ${type.toUpperCase()}\n`,
          };
          setRules((prev: RuleEntry[]) => [...prev, newRule]);
          setSelectedRuleId(newId);
          setIsEditingRule(false);
          setActiveView("rules");
        } else {
          const newNote: CampaignNote = {
            id: newId,
            title: cleanTitle,
            path: `${prefix}${cleanTitle}.md`,
            frontmatter: { type: type.toUpperCase(), tags: ["asset"] },
            content: `# Asset: ${cleanTitle}\n\nType: ${type.toUpperCase()}\n`,
          };
          await saveNote(newNote);
          setSelectedNoteId(newId);
          setIsEditingNote(false);
          setActiveView("vault");
        }
        setPendingAssetTarget(null);
        if (e.target) e.target.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        if (!dataUrl) return;
        const base64Data = dataUrl.split(",")[1] || "";
        const isImg = file.type.startsWith("image/") || type === "image";
        const isAudio = file.type.startsWith("audio/") || type === "audio";

        if (isRulebook) {
          const newRule: RuleEntry = {
            id: newId,
            title: cleanTitle,
            path: `${prefix}${cleanTitle}.md`,
            category: isImg ? "IMAGE" : isAudio ? "AUDIO" : "ASSET",
            source: "Asset",
            content: `# Asset: ${cleanTitle}\n\n${
              isImg
                ? `![${cleanTitle}](${dataUrl})\n`
                : isAudio
                  ? `<audio src="${dataUrl}" controls style="width:100%"></audio>\n`
                  : `File: \`${file.name}\`\n`
            }`,
          };
          setRules((prev: RuleEntry[]) => [...prev, newRule]);
          setSelectedRuleId(newId);
          setIsEditingRule(false);
          setActiveView("rules");
        } else {
          const relNotePath = `${prefix}${cleanTitle}.md`;

          try {
            const assetRelPath = await invoke<string>("save_note_asset", {
              notePath: relNotePath,
              filename: file.name,
              base64Data,
            });

            const assetMarkdown = isImg
              ? `![${cleanTitle}](${assetRelPath})`
              : isAudio
                ? `<audio src="${assetRelPath}" controls style="width: 100%"></audio>`
                : `[${cleanTitle}](${assetRelPath})`;

            const newNote: CampaignNote = {
              id: newId,
              title: cleanTitle,
              path: relNotePath,
              frontmatter: {
                type: isImg ? "IMAGE" : isAudio ? "AUDIO" : "ASSET",
                assetPath: assetRelPath,
                tags: ["asset"],
              },
              content: `# ${cleanTitle}\n\n${assetMarkdown}\n`,
            };

            await saveNote(newNote);
            setSelectedNoteId(newId);
            setIsEditingNote(false);
            setActiveView("vault");
          } catch (err) {
            console.error("Failed to save asset file:", err);
            const newNote: CampaignNote = {
              id: newId,
              title: cleanTitle,
              path: relNotePath,
              frontmatter: {
                type: isImg ? "IMAGE" : isAudio ? "AUDIO" : "ASSET",
                tags: ["asset"],
              },
              content: `# ${cleanTitle}\n\n${
                isImg
                  ? `![${cleanTitle}](${dataUrl})\n`
                  : `<audio src="${dataUrl}" controls style="width: 100%"></audio>\n`
              }`,
            };
            await saveNote(newNote);
            setSelectedNoteId(newId);
            setIsEditingNote(false);
            setActiveView("vault");
          }
        }
      };
      reader.readAsDataURL(file);
      setPendingAssetTarget(null);
      if (e.target) e.target.value = "";
    },
    [pendingAssetTarget, saveNote, showPrompt],
  );

  const handleCreatePluginAsset = useCallback(
    async (
      folderName: string,
      plugin: { id: string; name: string },
      isRulebook: boolean = false,
    ) => {
      const cleanFolder = folderName === "Root" ? "" : folderName;
      const prefix = cleanFolder ? `${cleanFolder}/` : "";
      const title = await showPrompt(`Enter title for ${plugin.name || plugin.id} asset:`);
      if (!title || !title.trim()) return;
      const cleanTitle = title.trim();

      if (isRulebook) {
        const newId = `rule-${Date.now()}`;
        const newRule: RuleEntry = {
          id: newId,
          title: cleanTitle,
          path: `${prefix}${cleanTitle}.md`,
          category: plugin.name || plugin.id,
          source: `Plugin: ${plugin.id}`,
          content: `# Asset: ${cleanTitle}\n\nPlugin: **${plugin.name || plugin.id}** (ID: \`${plugin.id}\`)\n\nCreated plugin-registered asset entry in folder \`${folderName}\`.\n`,
        };
        setRules((prev: RuleEntry[]) => [...prev, newRule]);
        setSelectedRuleId(newId);
        setIsEditingRule(true);
        setActiveView("rules");
      } else {
        const newId = `note-${Date.now()}`;
        const newNote: CampaignNote = {
          id: newId,
          title: cleanTitle,
          path: `${prefix}${cleanTitle}.md`,
          frontmatter: {
            type: plugin.id.toUpperCase(),
            plugin: plugin.id,
            tags: ["asset", "plugin-registered"],
          },
          content: `# Asset: ${cleanTitle}\n\nPlugin: **${plugin.name || plugin.id}** (ID: \`${plugin.id}\`)\n\nCreated plugin-registered asset entry in folder \`${folderName}\`.\n`,
        };
        try {
          await saveNote(newNote);
          setSelectedNoteId(newId);
          setIsEditingNote(true);
          setActiveView("vault");
        } catch (err) {
          alert("Failed to create plugin asset: " + err);
        }
      }
    },
    [saveNote, showPrompt, alert],
  );

  const handleTrashFolder = useCallback(
    (folderName: string, isRulebook: boolean = false) => {
      confirm(
        `Are you sure you want to move folder "${folderName}" and its contents to the trash?`,
        async () => {
          if (isRulebook) {
            await deleteRulesFolder(folderName);
            if (
              currentRule &&
              (currentRule.path.startsWith(`${folderName}/`) ||
                currentRule.path === folderName)
            ) {
              setSelectedRuleId("");
              setIsEditingRule(false);
            }
          } else {
            await trashFolder(folderName);
            if (
              currentNote &&
              (currentNote.path.startsWith(`${folderName}/`) ||
                currentNote.path === folderName)
            ) {
              const remaining = notes.filter(
                (n) => !n.path.startsWith(`${folderName}/`) && n.path !== folderName,
              );
              setSelectedNoteId(remaining.length > 0 ? remaining[0].id : "");
              setIsEditingNote(false);
            }
          }
        },
      );
    },
    [confirm, deleteRulesFolder, trashFolder, currentRule, currentNote, notes],
  );

  const renderFolderDropdown = useCallback(
    (folderName: string, isRulebook: boolean = false) => {
      const key = isRulebook ? `rule-folder-${folderName}` : folderName;
      if (contextMenu?.targetId !== key) return null;

      return (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 100,
            width: "180px",
            display: "flex",
            flexDirection: "column",
            padding: "4px 0",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: "4px 10px",
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--muted)",
              letterSpacing: "0.05em",
              borderBottom: "1px solid var(--border)",
              marginBottom: "2px",
            }}
          >
            Add Asset to {folderName}
          </div>

          {isRulebook ? (
            <>
              <DropdownItem
                label="New Rule Page"
                icon={<BookOpen size={12} />}
                onClick={() => handleCreateItemInFolder(folderName, "note", true)}
              />
              <DropdownItem
                label="New Subfolder"
                icon={<FolderPlus size={12} />}
                onClick={() => handleCreateItemInFolder(folderName, "folder", true)}
              />
              <DropdownItem
                label="Import MD / PDF"
                icon={<FileText size={12} />}
                onClick={() => document.getElementById("srd-file-input")?.click()}
              />
            </>
          ) : (
            <>
              <DropdownItem
                label="New Note"
                icon={<FileText size={12} />}
                onClick={() => handleCreateItemInFolder(folderName, "note", false)}
              />
              <DropdownItem
                label="New Subfolder"
                icon={<FolderPlus size={12} />}
                onClick={() => handleCreateItemInFolder(folderName, "folder", false)}
              />
            </>
          )}

          <DropdownItem
            label="New Canvas Board"
            icon={<Palette size={12} />}
            onClick={() => handleCreateItemInFolder(folderName, "canvas", isRulebook)}
          />
          <DropdownItem
            label="Audio Asset"
            icon={<AudioLines size={12} />}
            onClick={() => handleCreateItemInFolder(folderName, "audio", isRulebook)}
          />
          <DropdownItem
            label="Image Asset"
            icon={<ImageIcon size={12} />}
            onClick={() => handleCreateItemInFolder(folderName, "image", isRulebook)}
          />

          <div
            style={{
              borderTop: "1px solid var(--border)",
              marginTop: "4px",
              paddingTop: "4px",
            }}
          >
            <div
              style={{
                padding: "2px 10px",
                fontSize: "9px",
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--accent)",
                letterSpacing: "0.05em",
              }}
            >
              Plugin Extensions
            </div>
            {pluginsList && pluginsList.length > 0 ? (
              pluginsList.map((plugin) => (
                <DropdownItem
                  key={plugin.id}
                  label={plugin.name || plugin.id}
                  icon={<Zap size={12} />}
                  onClick={() => handleCreatePluginAsset(folderName, plugin, isRulebook)}
                />
              ))
            ) : (
              <>
                <DropdownItem
                  label="Stat Block / NPC"
                  icon={<Swords size={12} />}
                  onClick={() =>
                    handleCreatePluginAsset(folderName, { id: "statblock-generator", name: "Stat Block / NPC" }, isRulebook)
                  }
                />
                <DropdownItem
                  label="Interactive Map"
                  icon={<Map size={12} />}
                  onClick={() =>
                    handleCreatePluginAsset(folderName, { id: "campaign-map", name: "Interactive Map" }, isRulebook)
                  }
                />
              </>
            )}
          </div>

          <div
            style={{
              borderTop: "1px solid var(--border)",
              marginTop: "4px",
              paddingTop: "4px",
            }}
          >
            <DropdownItem
              label="Delete Folder"
              icon={<Trash2 size={12} />}
              danger
              onClick={() => handleTrashFolder(folderName, isRulebook)}
            />
          </div>
        </div>
      );
    },
    [contextMenu, handleCreateItemInFolder, handleCreatePluginAsset, handleTrashFolder, pluginsList],
  );

  return {
    pendingAssetTarget,
    assetFileInputRef,
    handleNewFolder,
    handleCreateItemInFolder,
    handleAssetFileSelected,
    handleTrashFolder,
    renderFolderDropdown,
  };
};
