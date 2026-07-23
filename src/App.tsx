import { zodResolver } from "@hookform/resolvers/zod";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
    BookOpen,
    Brain,
    ChevronRight,
    Compass,
    Copy,
    Download,
    Eye,
    FilePlus,
    FileText,
    FolderOpen,
    FolderPlus,
    Image as ImageIcon,
    Layers,
    Link2,
    Moon,
    PenLine,
    Plus,
    RotateCcw,
    Search,
    Send,
    Settings as SettingsIcon,
    Sun,
    Trash2,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDebounce } from "use-debounce";
import { useOnClickOutside } from "usehooks-ts";
import { z } from "zod";
import "./App.css";

const MarkdownEditor = lazy(() => import("./components/MarkdownEditor"));

interface CampaignNote {
  id: string;
  title: string;
  path: string;
  frontmatter: Record<string, string | number | string[]>;
  content: string;
}

interface RuleEntry {
  id: string;
  title: string;
  path: string;
  category: string;
  source: string;
  content: string;
}

function App() {
  const [activeView, setActiveView] = useState<
    "dashboard" | "vault" | "rules" | "ai" | "settings" | "canvas" | "trash"
  >("dashboard");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory] = useState<"all" | "notes" | "rules">("all");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<
    Array<{
      type: "note" | "rule";
      title: string;
      snippet: string;
      score: number;
      path: string;
    }>
  >([]);

  const [notes, setNotes] = useState<CampaignNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string>("");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editFrontmatter, setEditFrontmatter] = useState<Record<string, any>>(
    {},
  );
  const [newMetaKey, setNewMetaKey] = useState("");
  const [newMetaVal, setNewMetaVal] = useState("");

  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [newRuleTitle, setNewRuleTitle] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState("Combat");
  const [newRuleSubcategory, setNewRuleSubcategory] = useState("General");
  const [newRuleCustomCategory, setNewRuleCustomCategory] = useState("");
  const [newRuleContent, setNewRuleContent] = useState("");

  const [isEditingRule, setIsEditingRule] = useState(false);
  const [editRuleTitle, setEditRuleTitle] = useState("");
  const [editRulePath, setEditRulePath] = useState("");
  const [editRuleCategory, setEditRuleCategory] = useState("");
  const [editRuleSource, setEditRuleSource] = useState("");
  const [editRuleContent, setEditRuleContent] = useState("");

  const [activeFolderDropdown, setActiveFolderDropdown] = useState<
    string | null
  >(null);
  const [showNewVaultModal, setShowNewVaultModal] = useState(false);
  const [currentCanvasFolder, setCurrentCanvasFolder] = useState<string | null>(
    null,
  );
  const [rules, setRules] = useState<RuleEntry[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>("");
  const [vaultPath, setVaultPath] = useState("");
  const [trashedNotes, setTrashedNotes] = useState<CampaignNote[]>([]);
  const [trashedRules, setTrashedRules] = useState<RuleEntry[]>([]);

  const [chatInput, setChatInput] = useState("");
  const [chatMessagesByVault, setChatMessagesByVault] = useState<
    Record<string, Array<{ role: "user" | "assistant"; text: string }>>
  >({});
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(true);
  const [rightDrawerTab, setRightDrawerTab] = useState<
    "search" | "ai" | "scratchpad" | "backlinks" | "asset" | "voice"
  >("scratchpad");
  const [settingsTab, setSettingsTab] = useState<
    "build" | "contributors" | "licenses" | "profile"
  >("build");
  const [scratchpadText, setScratchpadText] = useState(() => {
    return (
      localStorage.getItem("loreweaver_scratchpad") ||
      "## GM Session Scratchpad\n- Active Party: \n- Notes: \n- Combat Tracker: \n"
    );
  });
  const [collapsedFolders, setCollapsedFolders] = useState<
    Record<string, boolean>
  >({});

  const assetFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingAssetTarget, setPendingAssetTarget] = useState<{
    folderName: string;
    type: "audio" | "image" | "file";
    isRulebook: boolean;
  } | null>(null);

  const handleAssetFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!pendingAssetTarget) return;

    const { folderName, type, isRulebook } = pendingAssetTarget;
    const cleanFolder = folderName === "Root" ? "" : folderName;
    const prefix = cleanFolder ? `${cleanFolder}/` : "";
    const cleanTitle = file
      ? file.name
      : prompt(`Enter ${type} title:`) || `${type}-${Date.now()}`;
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
        setRules((prev) => [...prev, newRule]);
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
        invoke("save_note", { note: newNote })
          .then(() => invoke<CampaignNote[]>("load_notes"))
          .then((loadedNotes) => {
            if (loadedNotes) {
              setNotes(loadedNotes);
              setSelectedNoteId(newId);
              setIsEditingNote(false);
              setActiveView("vault");
            }
          });
      }
      setPendingAssetTarget(null);
      if (e.target) e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
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
          content: `# Asset: ${cleanTitle}\n\n${isImg ? `![${cleanTitle}](${dataUrl})\n` : isAudio ? `<audio src="${dataUrl}" controls style="width:100%"></audio>\n` : `File: \`${file.name}\`\n`}`,
        };
        setRules((prev) => [...prev, newRule]);
        setSelectedRuleId(newId);
        setIsEditingRule(false);
        setActiveView("rules");
      } else {
        const relNotePath = `${prefix}${cleanTitle}.md`;

        invoke<string>("save_note_asset", {
          notePath: relNotePath,
          filename: file.name,
          base64Data: base64Data,
        })
          .then((assetRelPath) => {
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

            return invoke("save_note", { note: newNote });
          })
          .then(() => invoke<CampaignNote[]>("load_notes"))
          .then((loadedNotes) => {
            if (loadedNotes) {
              setNotes(loadedNotes);
              setSelectedNoteId(newId);
              setIsEditingNote(false);
              setActiveView("vault");
            }
          })
          .catch((err) => {
            console.error("Failed to save asset file:", err);
            const newNote: CampaignNote = {
              id: newId,
              title: cleanTitle,
              path: relNotePath,
              frontmatter: {
                type: isImg ? "IMAGE" : isAudio ? "AUDIO" : "ASSET",
                tags: ["asset"],
              },
              content: `# ${cleanTitle}\n\n${isImg ? `![${cleanTitle}](${dataUrl})\n` : `<audio src="${dataUrl}" controls style="width: 100%"></audio>\n`}`,
            };
            invoke("save_note", { note: newNote })
              .then(() => invoke<CampaignNote[]>("load_notes"))
              .then((loadedNotes) => {
                if (loadedNotes) {
                  setNotes(loadedNotes);
                  setSelectedNoteId(newId);
                  setIsEditingNote(false);
                  setActiveView("vault");
                }
              });
          });
      }
    };
    reader.readAsDataURL(file);
    setPendingAssetTarget(null);
    if (e.target) e.target.value = "";
  };

  useEffect(() => {
    localStorage.setItem("loreweaver_scratchpad", scratchpadText);
  }, [scratchpadText]);

  const [activeConfigTab, setActiveConfigTab] = useState<
    "llm" | "embed" | "image" | "tts" | "stt"
  >("llm");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testConnectionResult, setTestConnectionResult] = useState<
    string[] | null
  >(null);
  const [testConnectionError, setTestConnectionError] = useState<string | null>(
    null,
  );

  const settingsSchema = z.object({
    llm_provider: z.string().min(1, "Provider is required"),
    llm_model: z.string().min(1, "Model is required"),
    llm_api_key: z.string(),
    llm_base_url: z.string().url("Must be a valid URL"),

    embed_provider: z.string().min(1, "Provider is required"),
    embed_model: z.string().min(1, "Model is required"),
    embed_api_key: z.string(),
    embed_base_url: z.union([
      z.string().url("Must be a valid URL"),
      z.literal(""),
    ]),

    image_provider: z.string().min(1, "Provider is required"),
    image_model: z.string(),
    image_api_key: z.string(),
    image_base_url: z.union([
      z.string().url("Must be a valid URL"),
      z.literal(""),
    ]),

    tts_provider: z.string().min(1, "Provider is required"),
    tts_api_key: z.string(),
    tts_voice: z.string(),

    stt_provider: z.string().min(1, "Provider is required"),
    stt_api_key: z.string(),
  });

  type SettingsForm = z.infer<typeof settingsSchema>;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty, isValid },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      llm_provider: "ollama",
      llm_model: "llama3:8b",
      llm_api_key: "",
      llm_base_url: "http://localhost:11434",

      embed_provider: "local",
      embed_model: "all-MiniLM-L6-v2",
      embed_api_key: "",
      embed_base_url: "",

      image_provider: "local",
      image_model: "",
      image_api_key: "",
      image_base_url: "",

      tts_provider: "local",
      tts_api_key: "",
      tts_voice: "default",

      stt_provider: "local",
      stt_api_key: "",
    },
  });

  const llmProvider = watch("llm_provider");
  const llmModel = watch("llm_model");
  const llmApiKey = watch("llm_api_key");
  const llmBaseUrl = watch("llm_base_url");
  const embedProvider = watch("embed_provider");
  const embedApiKey = watch("embed_api_key");
  const embedBaseUrl = watch("embed_base_url");
  const imageProvider = watch("image_provider");
  const imageModel = watch("image_model");
  const imageApiKey = watch("image_api_key");
  const imageBaseUrl = watch("image_base_url");
  const ttsProvider = watch("tts_provider");
  const ttsApiKey = watch("tts_api_key");
  const sttProvider = watch("stt_provider");
  const sttApiKey = watch("stt_api_key");

  const [pluginsList, setPluginsList] = useState<any[]>([]);
  const [vaults, setVaults] = useState<Array<{ name: string; path: string }>>(
    [],
  );
  const [sessionCloneTargetVaultPath, setSessionCloneTargetVaultPath] =
    useState("");

  const [diceHistory, setDiceHistory] = useState<string[]>([]);
  const [rollModifier, setRollModifier] = useState<number>(0);

  const [imagePrompt, setImagePrompt] = useState(
    "A detailed portrait of Lirael, the elven mage",
  );
  const [imageStyle, setImageStyle] = useState("Fantasy Portrait");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string>("");

  const [ttsText, setTtsText] = useState("");
  const [isGeneratingSpeech, setIsGeneratingSpeech] = useState(false);
  const [generatedSpeechUrl, setGeneratedSpeechUrl] = useState<string>("");

  const searchRef = useRef<HTMLDivElement>(null);

  const defaultChatMessages = [
    {
      role: "assistant" as const,
      text: "Greetings, Game Master. I am your Campaign Architect agent. I can help you draft notes, check rules, simulate NPCs, or generate ideas for your campaign. What shall we work on today?",
    },
  ];

  const getVaultLabel = (path: string) => {
    const vault = vaults.find((item) => item.path === path);
    return vault?.name || path.split(/[\\/]/).filter(Boolean).pop() || "vault";
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const refreshVaultData = () => {
    invoke<CampaignNote[]>("load_notes")
      .then((loadedNotes) => {
        if (loadedNotes && loadedNotes.length > 0) {
          setNotes(loadedNotes);
          setSelectedNoteId(loadedNotes[0].id);
        } else {
          setNotes([]);
        }
      })
      .catch((err) => console.error("Failed to load notes:", err));

    invoke<RuleEntry[]>("load_rules")
      .then((loadedRules) => {
        if (loadedRules && loadedRules.length > 0) {
          setRules(loadedRules);
          setSelectedRuleId(loadedRules[0].id);
        } else {
          setRules([]);
        }
      })
      .catch((err) => console.error("Failed to load rules:", err));

    invoke<string>("get_vault_path")
      .then((path) => setVaultPath(path))
      .catch((err) => console.error("Failed to get vault path:", err));

    invoke<CampaignNote[]>("load_trash_notes")
      .then((res) => {
        if (res) setTrashedNotes(res);
      })
      .catch((err) => console.error("Failed to load trash notes:", err));

    invoke<any>("load_settings")
      .then((settings) => {
        if (settings) {
          reset({
            llm_provider: settings.llm_provider || "ollama",
            llm_model: settings.llm_model || "llama3:8b",
            llm_api_key: settings.llm_api_key || "",
            llm_base_url: settings.llm_base_url || "http://localhost:11434",

            embed_provider: settings.embed_provider || "local",
            embed_model: settings.embed_model || "all-MiniLM-L6-v2",
            embed_api_key: settings.embed_api_key || "",
            embed_base_url: settings.embed_base_url || "",

            image_provider: settings.image_provider || "local",
            image_model: settings.image_model || "",
            image_api_key: settings.image_api_key || "",
            image_base_url: settings.image_base_url || "",

            tts_provider: settings.tts_provider || "local",
            tts_api_key: settings.tts_api_key || "",
            tts_voice: settings.tts_voice || "default",

            stt_provider: settings.stt_provider || "local",
            stt_api_key: settings.stt_api_key || "",
          });
        }
      })
      .catch((err) => console.error("Failed to load settings:", err));
  };

  const refreshVaultsList = () => {
    invoke<Array<{ name: string; path: string }>>("list_vaults")
      .then((list) => setVaults(list || []))
      .catch((err) => console.error("Failed to list vaults:", err));
  };

  useEffect(() => {
    refreshVaultData();
    refreshVaultsList();

    invoke<any[]>("load_plugins")
      .then((list) => setPluginsList(list || []))
      .catch((err) => console.error("Failed to load plugins:", err));
  }, []);

  useEffect(() => {
    if (!vaultPath) return;

    invoke<any[]>("load_plugins")
      .then((list) => setPluginsList(list || []))
      .catch((err) =>
        console.error("Failed to reload plugins for vault:", err),
      );
  }, [vaultPath]);

  useEffect(() => {
    if (!vaultPath) return;

    setChatMessagesByVault((prev) => {
      if (prev[vaultPath]) {
        return prev;
      }

      return {
        ...prev,
        [vaultPath]: defaultChatMessages,
      };
    });

    setSessionCloneTargetVaultPath((currentTarget) => {
      if (currentTarget && currentTarget !== vaultPath) {
        return currentTarget;
      }

      const firstOtherVault = vaults.find((item) => item.path !== vaultPath);
      return firstOtherVault?.path || "";
    });
  }, [vaultPath]);

  const handleSaveSettings = handleSubmit((data: SettingsForm) => {
    invoke("save_settings", { settings: data })
      .then(() => {
        reset(data);
        alert("Configuration settings saved successfully!");
      })
      .catch((err) => alert("Failed to save settings: " + err));
  });

  const onProviderSelect = (
    tab: "llm" | "embed" | "image" | "tts" | "stt",
    providerId: string,
  ) => {
    const providerField = `${tab}_provider` as keyof SettingsForm;
    const baseUrlField = `${tab}_base_url` as keyof SettingsForm;
    setValue(providerField, providerId, { shouldDirty: true });

    const baseUrlDefaults: Record<string, Record<string, string>> = {
      llm: {
        ollama: "http://localhost:11434",
        openai: "https://api.openai.com",
        gemini: "https://generativelanguage.googleapis.com",
      },
      embed: {
        openai: "https://api.openai.com",
        gemini: "https://generativelanguage.googleapis.com",
      },
      image: {
        local: "http://127.0.0.1:8188",
        openai: "https://api.openai.com",
        stability: "https://api.stability.ai",
      },
    };

    const defaultUrl = baseUrlDefaults[tab]?.[providerId];
    if (defaultUrl) {
      setValue(baseUrlField, defaultUrl, { shouldDirty: true });
    }
  };

  const currentChatMessages = vaultPath
    ? chatMessagesByVault[vaultPath] || defaultChatMessages
    : defaultChatMessages;

  const updateVaultChatMessages = (
    updater: (
      currentMessages: Array<{ role: "user" | "assistant"; text: string }>,
    ) => Array<{ role: "user" | "assistant"; text: string }>,
  ) => {
    if (!vaultPath) return;

    setChatMessagesByVault((prev) => {
      const currentMessages = prev[vaultPath] || defaultChatMessages;
      return {
        ...prev,
        [vaultPath]: updater(currentMessages),
      };
    });
  };

  const resetCurrentVaultSession = () => {
    if (!vaultPath) return;

    setChatMessagesByVault((prev) => ({
      ...prev,
      [vaultPath]: defaultChatMessages,
    }));
  };

  const exportCurrentVaultSession = () => {
    if (!vaultPath) return;

    const payload = {
      vaultPath,
      vaultName: getVaultLabel(vaultPath),
      exportedAt: new Date().toISOString(),
      messages: currentChatMessages,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${getVaultLabel(vaultPath)
      .replace(/[^a-z0-9-_]+/gi, "-")
      .toLowerCase()}-session.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const cloneCurrentVaultSession = () => {
    if (!vaultPath || !sessionCloneTargetVaultPath) return;
    if (sessionCloneTargetVaultPath === vaultPath) return;

    setChatMessagesByVault((prev) => ({
      ...prev,
      [sessionCloneTargetVaultPath]: currentChatMessages.map((msg) => ({
        ...msg,
      })),
    }));
  };

  const handleTestConnection = () => {
    setIsTestingConnection(true);
    setTestConnectionResult(null);
    setTestConnectionError(null);

    const provider =
      activeConfigTab === "llm"
        ? llmProvider
        : activeConfigTab === "embed"
          ? embedProvider
          : activeConfigTab === "image"
            ? imageProvider
            : activeConfigTab === "tts"
              ? ttsProvider
              : sttProvider;

    const baseUrl =
      activeConfigTab === "llm"
        ? llmBaseUrl
        : activeConfigTab === "embed"
          ? embedBaseUrl
          : activeConfigTab === "image"
            ? imageBaseUrl
            : "";

    const apiKey =
      activeConfigTab === "llm"
        ? llmApiKey
        : activeConfigTab === "embed"
          ? embedApiKey
          : activeConfigTab === "image"
            ? imageApiKey
            : activeConfigTab === "tts"
              ? ttsApiKey
              : sttApiKey;

    invoke<string[]>("test_provider_connection", {
      provider,
      baseUrl,
      apiKey: apiKey || null,
    })
      .then((models) => {
        setIsTestingConnection(false);
        if (models && models.length > 0) {
          setTestConnectionResult(models);
        } else {
          setTestConnectionResult([]);
          setTestConnectionError(
            "Connection succeeded, but no models were returned by the provider.",
          );
        }
      })
      .catch((err) => {
        setIsTestingConnection(false);
        setTestConnectionError(err.toString());
      });
  };

  const activeEditingNoteIdRef = useRef<string | null>(null);
  const activeEditingRuleIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedNoteId) {
      activeEditingNoteIdRef.current = null;
      return;
    }
    const note = notes.find((n) => n.id === selectedNoteId);
    if (note) {
      setEditTitle(note.title);
      setEditContent(note.content);
      setEditFrontmatter(note.frontmatter || {});
      activeEditingNoteIdRef.current = note.id;
    }
  }, [selectedNoteId]);

  const triggerImmediateSave = () => {
    if (!selectedNoteId || activeEditingNoteIdRef.current !== selectedNoteId)
      return;
    const note = notes.find((n) => n.id === selectedNoteId);
    if (!note) return;

    const normalizedContent = normalizeCampaignMarkdown(editContent);

    if (
      editTitle === note.title &&
      normalizedContent === note.content &&
      JSON.stringify(editFrontmatter) === JSON.stringify(note.frontmatter)
    ) {
      return;
    }

    const updatedNote: CampaignNote = {
      ...note,
      title: editTitle,
      content: normalizedContent,
      frontmatter: editFrontmatter,
    };

    invoke("save_note", { note: updatedNote })
      .then(() => invoke<CampaignNote[]>("load_notes"))
      .then((loadedNotes) => {
        if (loadedNotes) {
          setNotes(loadedNotes);
        }
      })
      .catch((err) => console.error("Immediate save failed:", err));
  };

  const [debouncedEditTitle] = useDebounce(editTitle, 250);
  const [debouncedEditContent] = useDebounce(editContent, 250);
  const [debouncedEditFrontmatter] = useDebounce(editFrontmatter, 250);

  useEffect(() => {
    if (!selectedNoteId || activeEditingNoteIdRef.current !== selectedNoteId)
      return;
    const note = notes.find((n) => n.id === selectedNoteId);
    if (!note) return;

    const normalizedContent = normalizeCampaignMarkdown(debouncedEditContent);

    if (
      debouncedEditTitle === note.title &&
      normalizedContent === note.content &&
      JSON.stringify(debouncedEditFrontmatter) ===
        JSON.stringify(note.frontmatter)
    ) {
      return;
    }

    const updatedNote: CampaignNote = {
      ...note,
      title: debouncedEditTitle,
      content: normalizedContent,
      frontmatter: debouncedEditFrontmatter,
    };

    invoke("save_note", { note: updatedNote })
      .then(() => invoke<CampaignNote[]>("load_notes"))
      .then((loadedNotes) => {
        if (loadedNotes) {
          setNotes(loadedNotes);
        }
      })
      .catch((err) => console.error("Auto-save failed:", err));
  }, [debouncedEditTitle, debouncedEditContent, debouncedEditFrontmatter]);

  useOnClickOutside(searchRef as React.RefObject<HTMLElement>, () =>
    setIsSearchOpen(false),
  );

  useEffect(() => {
    const rule = rules.find((r) => r.id === selectedRuleId);
    if (rule) {
      setEditRuleTitle(rule.title);
      setEditRulePath(rule.path || `General/${rule.title}.md`);
      setEditRuleCategory(rule.category || "General");
      setEditRuleSource(rule.source || "D&D 5e SRD");
      setEditRuleContent(rule.content || "");
      activeEditingRuleIdRef.current = rule.id;
    }
  }, [selectedRuleId]);

  // Auto-save active rule changes when editing
  useEffect(() => {
    if (
      !selectedRuleId ||
      !isEditingRule ||
      activeEditingRuleIdRef.current !== selectedRuleId
    )
      return;
    const rule = rules.find((r) => r.id === selectedRuleId);
    if (!rule) return;

    const updatedRule: RuleEntry = {
      ...rule,
      title: editRuleTitle,
      path: editRulePath,
      category: editRuleCategory,
      source: editRuleSource,
      content: editRuleContent,
    };

    setRules((prev) =>
      prev.map((r) => (r.id === selectedRuleId ? updatedRule : r)),
    );

    invoke("save_rule", { rule: updatedRule }).catch((err) =>
      console.error("Failed to save rule:", err),
    );
  }, [
    editRuleTitle,
    editRulePath,
    editRuleCategory,
    editRuleSource,
    editRuleContent,
  ]);

  const handleNewRule = (targetFolder: string = "General") => {
    const newId = `rule-${Date.now()}`;
    const cleanFolder = targetFolder === "General" ? "General" : targetFolder;
    const newRule: RuleEntry = {
      id: newId,
      title: "Untitled Rule",
      path: `${cleanFolder}/Untitled Rule.md`,
      category: cleanFolder.split("/")[0] || "General",
      source: "Homebrew",
      content: `# Untitled Rule\n\nWrite your rule details and mechanics here...`,
    };
    setRules((prev) => [...prev, newRule]);
    setSelectedRuleId(newId);
    setIsEditingRule(true);
    setActiveView("rules");
    invoke("save_rule", { rule: newRule }).catch((err) =>
      console.error("Failed to persist new rule:", err),
    );
  };

  const handleNewRuleFolder = () => {
    const folderPath = prompt(
      "Enter folder path (e.g. Combat/Reactions or Spellcasting/Evocation):",
    );
    if (!folderPath || !folderPath.trim()) return;
    const cleanFolder = folderPath.trim().replace(/^\/+|\/+$/g, "");
    handleNewRule(cleanFolder);
  };

  const handleDeleteRule = (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this rule entry?")) return;
    invoke("delete_rule", { ruleId })
      .then(() => invoke<RuleEntry[]>("load_rules"))
      .then((loadedRules) => {
        if (loadedRules) {
          setRules(loadedRules);
          if (loadedRules.length > 0) {
            setSelectedRuleId(loadedRules[0].id);
          } else {
            setSelectedRuleId("");
          }
        }
      })
      .catch((err) => alert("Error deleting rule: " + err));
    setIsEditingRule(false);
  };

  const handleInsertRuleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;
      const base64Data = dataUrl.split(",")[1] || "";
      // Save asset to disk so it persists across restarts
      const currentRuleObj = rules.find((r) => r.id === selectedRuleId);
      const notePath = currentRuleObj?.path || `General/${file.name}.md`;
      invoke<string>("save_note_asset", {
        notePath,
        filename: file.name,
        base64Data,
      })
        .then((assetRelPath) => {
          const imageMarkdown = `\n\n![${file.name}](${assetRelPath})\n`;
          setEditRuleContent((prev) => prev + imageMarkdown);
        })
        .catch((err) => {
          console.error("Failed to save rule image:", err);
          // Fallback: use data URL (won't persist but at least shows in-session)
          const imageMarkdown = `\n\n![${file.name}](${dataUrl})\n`;
          setEditRuleContent((prev) => prev + imageMarkdown);
        });
    };
    reader.readAsDataURL(file);
  };

  const handleNewNote = () => {
    const newId = `note-${Date.now()}`;
    const newNote: CampaignNote = {
      id: newId,
      title: "New Note",
      path: `Worldbuilding/New_Note_${newId}.md`,
      frontmatter: { type: "Note", tags: ["draft"] },
      content: `# New Note\n\nStart writing your campaign details here...`,
    };

    setEditTitle(newNote.title);
    setEditContent(newNote.content);
    setEditFrontmatter(newNote.frontmatter);
    activeEditingNoteIdRef.current = newId;

    invoke("save_note", { note: newNote })
      .then(() => invoke<CampaignNote[]>("load_notes"))
      .then((loadedNotes) => {
        if (loadedNotes) {
          setNotes(loadedNotes);
          setSelectedNoteId(newId);
        }
      })
      .catch((err) => console.error("Failed to create new note:", err));

    setIsEditingNote(true);
    setActiveView("vault");
  };

  const handleNewFolder = () => {
    const folderName = prompt(
      "Enter new folder name (e.g. Worldbuilding/Cities or Factions):",
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

    invoke("save_note", { note: newNote })
      .then(() => invoke<CampaignNote[]>("load_notes"))
      .then((loadedNotes) => {
        if (loadedNotes) {
          setNotes(loadedNotes);
          setSelectedNoteId(newId);
        }
      })
      .catch((err) => console.error("Failed to create new folder note:", err));

    setIsEditingNote(true);
    setActiveView("vault");
  };

  const handleCreateItemInFolder = (
    folderName: string,
    type: "note" | "folder" | "canvas" | "audio" | "image",
    isRulebook: boolean = false,
  ) => {
    const cleanFolder = folderName === "Root" ? "" : folderName;
    const prefix = cleanFolder ? `${cleanFolder}/` : "";
    const timestamp = Date.now();

    if (isRulebook) {
      if (type === "note") {
        const cleanTitle = `New Rule ${rules.length + 1}`;
        const newId = `rule-${timestamp}`;
        const newRule: RuleEntry = {
          id: newId,
          title: cleanTitle,
          path: `${prefix}${cleanTitle}.md`,
          category: cleanFolder.split("/")[0] || "General",
          source: "Homebrew",
          content: `# ${cleanTitle}\n\nWrite your rule details and mechanics here...`,
        };
        setRules((prev) => [...prev, newRule]);
        setEditRuleTitle(newRule.title);
        setEditRuleContent(newRule.content);
        setEditRulePath(newRule.path);
        setEditRuleCategory(newRule.category);
        setEditRuleSource(newRule.source);
        activeEditingRuleIdRef.current = newId;
        setSelectedRuleId(newId);
        setIsEditingRule(true);
        setActiveView("rules");
        invoke("save_rule", { rule: newRule }).catch((err) =>
          console.error("Failed to persist rule:", err),
        );
      } else if (type === "folder") {
        const cleanName = `Subfolder ${timestamp.toString().slice(-4)}`;
        const newId = `rule-${timestamp}`;
        const newRule: RuleEntry = {
          id: newId,
          title: "Overview",
          path: `${prefix}${cleanName}/Overview.md`,
          category: cleanFolder.split("/")[0] || cleanName,
          source: "Homebrew",
          content: `# ${cleanName}\n\nOverview for ${cleanName}...`,
        };
        setRules((prev) => [...prev, newRule]);
        setEditRuleTitle(newRule.title);
        setEditRuleContent(newRule.content);
        setEditRulePath(newRule.path);
        activeEditingRuleIdRef.current = newId;
        setSelectedRuleId(newId);
        setIsEditingRule(true);
        setActiveView("rules");
        invoke("save_rule", { rule: newRule }).catch((err) =>
          console.error("Failed to persist rule:", err),
        );
      } else if (type === "canvas" || type === "audio" || type === "image") {
        const cleanName = `${type.toUpperCase()} Asset ${timestamp.toString().slice(-4)}`;
        const newId = `rule-${timestamp}`;
        const ext =
          type === "canvas" ? ".canvas" : type === "audio" ? ".mp3" : ".png";
        const newRule: RuleEntry = {
          id: newId,
          title: cleanName,
          path: `${prefix}${cleanName}${ext}`,
          category: type.toUpperCase(),
          source: "Asset",
          content: `# Asset: ${cleanName}\n\nType: ${type.toUpperCase()}\nPath: ${prefix}${cleanName}${ext}\n`,
        };
        setRules((prev) => [...prev, newRule]);
        setEditRuleTitle(newRule.title);
        setEditRuleContent(newRule.content);
        activeEditingRuleIdRef.current = newId;
        setSelectedRuleId(newId);
        setIsEditingRule(true);
        setActiveView("rules");
        invoke("save_rule", { rule: newRule }).catch((err) =>
          console.error("Failed to persist rule:", err),
        );
      }
      return;
    }

    if (type === "note") {
      const cleanTitle = `New Note ${notes.length + 1}`;
      const newId = `note-${timestamp}`;
      const newNote: CampaignNote = {
        id: newId,
        title: cleanTitle,
        path: `${prefix}${cleanTitle}.md`,
        frontmatter: { type: "Note", tags: ["draft"] },
        content: `# ${cleanTitle}\n\nStart writing campaign details...`,
      };

      setEditTitle(newNote.title);
      setEditContent(newNote.content);
      setEditFrontmatter(newNote.frontmatter);
      activeEditingNoteIdRef.current = newId;

      invoke("save_note", { note: newNote })
        .then(() => invoke<CampaignNote[]>("load_notes"))
        .then((loadedNotes) => {
          if (loadedNotes) {
            setNotes(loadedNotes);
            setSelectedNoteId(newId);
            setIsEditingNote(true);
            setActiveView("vault");
          }
        })
        .catch((err) => alert("Error creating note: " + err));
    } else if (type === "folder") {
      const cleanName = `New Folder ${timestamp.toString().slice(-4)}`;
      const newId = `note-${timestamp}`;
      const newNote: CampaignNote = {
        id: newId,
        title: "Welcome",
        path: `${prefix}${cleanName}/Welcome.md`,
        frontmatter: { type: "Note", tags: ["draft"] },
        content: `# Welcome to ${cleanName}\n\nStart organizing this subfolder!`,
      };

      setEditTitle(newNote.title);
      setEditContent(newNote.content);
      setEditFrontmatter(newNote.frontmatter);
      activeEditingNoteIdRef.current = newId;

      invoke("save_note", { note: newNote })
        .then(() => invoke<CampaignNote[]>("load_notes"))
        .then((loadedNotes) => {
          if (loadedNotes) {
            setNotes(loadedNotes);
            setSelectedNoteId(newId);
            setIsEditingNote(true);
            setActiveView("vault");
          }
        })
        .catch((err) => alert("Error creating folder: " + err));
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

      invoke("save_canvas_file", {
        relPath: canvasPath,
        jsonContent: JSON.stringify({ nodes: [], edges: [], containers: [] }),
      })
        .then(() => invoke("save_note", { note: canvasNote }))
        .then(() => invoke<CampaignNote[]>("load_notes"))
        .then((loadedNotes) => {
          if (loadedNotes) {
            setNotes(loadedNotes);
            setSelectedNoteId(newId);
            setCurrentCanvasFolder(cleanFolder);
            setActiveView("canvas");
          }
        })
        .catch((err) => alert("Error creating canvas: " + err));
    } else if (type === "audio" || type === "image") {
      setPendingAssetTarget({ folderName, type, isRulebook });
      setTimeout(() => {
        if (assetFileInputRef.current) {
          assetFileInputRef.current.click();
        }
      }, 50);
    }
  };

  const handleTrashNote = (notePath: string) => {
    if (!confirm("Are you sure you want to move this note to the trash?"))
      return;
    invoke("trash_note", { notePath })
      .then(() => invoke<CampaignNote[]>("load_notes"))
      .then((loadedNotes) => {
        if (loadedNotes) {
          setNotes(loadedNotes);
          if (loadedNotes.length > 0) {
            setSelectedNoteId(loadedNotes[0].id);
          } else {
            setSelectedNoteId("");
          }
          setIsEditingNote(false);
          invoke<CampaignNote[]>("load_trash_notes").then((res) => {
            if (res) setTrashedNotes(res);
          });
        }
      })
      .catch((err) => alert("Error moving note to trash: " + err));
  };

  const handleTrashFolder = (
    folderName: string,
    isRulebook: boolean = false,
  ) => {
    if (
      !confirm(
        `Are you sure you want to move folder "${folderName}" and its contents to the trash?`,
      )
    )
      return;

    if (isRulebook) {
      const folderRules = rules.filter(
        (r) => r.path.startsWith(`${folderName}/`) || r.path === folderName,
      );
      setRules((prev) =>
        prev.filter(
          (r) => !r.path.startsWith(`${folderName}/`) && r.path !== folderName,
        ),
      );
      setTrashedRules((prev) => [...prev, ...folderRules]);
      // Persist deletion for each rule in the folder
      folderRules.forEach((rule) => {
        invoke("delete_rule", { ruleId: rule.id }).catch((err) =>
          console.error("Failed to delete rule from backend:", err),
        );
      });
      if (
        currentRule &&
        (currentRule.path.startsWith(`${folderName}/`) ||
          currentRule.path === folderName)
      ) {
        setSelectedRuleId("");
        setIsEditingRule(false);
      }
    } else {
      invoke("trash_folder", { folderPath: folderName })
        .then(() => invoke<CampaignNote[]>("load_notes"))
        .then((loadedNotes) => {
          if (loadedNotes) {
            setNotes(loadedNotes);
            if (
              currentNote &&
              (currentNote.path.startsWith(`${folderName}/`) ||
                currentNote.path === folderName)
            ) {
              if (loadedNotes.length > 0) setSelectedNoteId(loadedNotes[0].id);
              else setSelectedNoteId("");
              setIsEditingNote(false);
            }
            invoke<CampaignNote[]>("load_trash_notes").then((res) => {
              if (res) setTrashedNotes(res);
            });
          }
        })
        .catch((err) => alert("Error deleting folder: " + err));
    }
  };

  const handleRestoreNote = (trashNotePath: string) => {
    invoke("restore_note", { trashNotePath })
      .then(() => invoke<CampaignNote[]>("load_notes"))
      .then((loadedNotes) => {
        if (loadedNotes) {
          setNotes(loadedNotes);
          invoke<CampaignNote[]>("load_trash_notes").then((res) => {
            if (res) setTrashedNotes(res);
          });
        }
      })
      .catch((err) => alert("Error restoring note: " + err));
  };

  const handleRestoreRule = (ruleId: string) => {
    const targetRule = trashedRules.find((r) => r.id === ruleId);
    if (!targetRule) return;
    setTrashedRules((prev) => prev.filter((r) => r.id !== ruleId));
    setRules((prev) => [...prev, targetRule]);
    setSelectedRuleId(ruleId);
    setActiveView("rules");
    invoke("save_rule", { rule: targetRule }).catch((err) =>
      console.error("Failed to persist restored rule:", err),
    );
  };

  const handleDeleteTrashedNote = (trashNotePath: string) => {
    if (
      !confirm("Permanently delete this item from disk? This cannot be undone.")
    )
      return;
    invoke("delete_trashed_note", { trashNotePath })
      .then(() => {
        invoke<CampaignNote[]>("load_trash_notes").then((res) => {
          if (res) setTrashedNotes(res);
        });
      })
      .catch((err) => alert("Error deleting trashed note: " + err));
  };

  const handleEmptyTrash = () => {
    if (
      !confirm(
        "Are you sure you want to permanently delete all items in the trash?",
      )
    )
      return;
    invoke("empty_trash")
      .then(() => {
        setTrashedNotes([]);
        setTrashedRules([]);
        invoke<CampaignNote[]>("load_trash_notes").then((res) => {
          if (res) setTrashedNotes(res);
        });
      })
      .catch((err) => alert("Error emptying trash: " + err));
  };

  const handleCreatePluginAsset = (
    folderName: string,
    plugin: any,
    isRulebook: boolean = false,
  ) => {
    const cleanFolder = folderName === "Root" ? "" : folderName;
    const prefix = cleanFolder ? `${cleanFolder}/` : "";
    const title = prompt(`Enter title for ${plugin.name || plugin.id} asset:`);
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
      setRules((prev) => [...prev, newRule]);
      setSelectedRuleId(newId);
      setIsEditingRule(true);
      setActiveView("rules");
      invoke("save_rule", { rule: newRule }).catch((err) =>
        console.error("Failed to persist plugin rule asset:", err),
      );
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
      invoke("save_note", { note: newNote })
        .then(() => invoke<CampaignNote[]>("load_notes"))
        .then((loadedNotes) => {
          if (loadedNotes) {
            setNotes(loadedNotes);
            setSelectedNoteId(newId);
            setIsEditingNote(true);
            setActiveView("vault");
          }
        })
        .catch((err) => alert("Failed to create plugin asset: " + err));
    }
  };

  const renderFolderDropdown = (
    folderName: string,
    isRulebook: boolean = false,
  ) => {
    const key = isRulebook ? `rule-folder-${folderName}` : folderName;
    if (activeFolderDropdown !== key) return null;

    return (
      <div
        style={{
          position: "absolute",
          top: "100%",
          right: 0,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveFolderDropdown(null);
                handleCreateItemInFolder(folderName, "note", true);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--fg)",
                padding: "6px 12px",
                fontSize: "11px",
                textAlign: "left",
                cursor: "pointer",
                display: "block",
                width: "100%",
              }}
            >
              📖 New Rule Page
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveFolderDropdown(null);
                handleCreateItemInFolder(folderName, "folder", true);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--fg)",
                padding: "6px 12px",
                fontSize: "11px",
                textAlign: "left",
                cursor: "pointer",
                display: "block",
                width: "100%",
              }}
            >
              📁 New Subfolder
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveFolderDropdown(null);
                document.getElementById("srd-file-input")?.click();
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--fg)",
                padding: "6px 12px",
                fontSize: "11px",
                textAlign: "left",
                cursor: "pointer",
                display: "block",
                width: "100%",
              }}
            >
              📄 Import MD / PDF
            </button>
          </>
        ) : (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveFolderDropdown(null);
                handleCreateItemInFolder(folderName, "note", false);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--fg)",
                padding: "6px 12px",
                fontSize: "11px",
                textAlign: "left",
                cursor: "pointer",
                display: "block",
                width: "100%",
              }}
            >
              📄 New Note
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveFolderDropdown(null);
                handleCreateItemInFolder(folderName, "folder", false);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--fg)",
                padding: "6px 12px",
                fontSize: "11px",
                textAlign: "left",
                cursor: "pointer",
                display: "block",
                width: "100%",
              }}
            >
              📁 New Subfolder
            </button>
          </>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveFolderDropdown(null);
            handleCreateItemInFolder(folderName, "canvas", isRulebook);
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--fg)",
            padding: "6px 12px",
            fontSize: "11px",
            textAlign: "left",
            cursor: "pointer",
            display: "block",
            width: "100%",
          }}
        >
          🎨 New Canvas Board
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveFolderDropdown(null);
            handleCreateItemInFolder(folderName, "audio", isRulebook);
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--fg)",
            padding: "6px 12px",
            fontSize: "11px",
            textAlign: "left",
            cursor: "pointer",
            display: "block",
            width: "100%",
          }}
        >
          🎵 Audio Asset
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveFolderDropdown(null);
            handleCreateItemInFolder(folderName, "image", isRulebook);
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--fg)",
            padding: "6px 12px",
            fontSize: "11px",
            textAlign: "left",
            cursor: "pointer",
            display: "block",
            width: "100%",
          }}
        >
          🖼️ Image Asset
        </button>

        {/* Plugin-registered Asset Types */}
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
              <button
                key={plugin.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveFolderDropdown(null);
                  handleCreatePluginAsset(folderName, plugin, isRulebook);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--accent)",
                  padding: "5px 12px",
                  fontSize: "11px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "block",
                  width: "100%",
                }}
              >
                ⚡ {plugin.name || plugin.id}
              </button>
            ))
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveFolderDropdown(null);
                  handleCreatePluginAsset(
                    folderName,
                    { id: "statblock-generator", name: "Stat Block / NPC" },
                    isRulebook,
                  );
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--fg)",
                  padding: "5px 12px",
                  fontSize: "11px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "block",
                  width: "100%",
                }}
              >
                ⚔️ Stat Block / NPC
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveFolderDropdown(null);
                  handleCreatePluginAsset(
                    folderName,
                    { id: "campaign-map", name: "Interactive Map" },
                    isRulebook,
                  );
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--fg)",
                  padding: "5px 12px",
                  fontSize: "11px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "block",
                  width: "100%",
                }}
              >
                🗺️ Interactive Map
              </button>
            </>
          )}
        </div>

        {/* Delete Folder Option */}
        <div
          style={{
            borderTop: "1px solid var(--border)",
            marginTop: "4px",
            paddingTop: "4px",
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveFolderDropdown(null);
              handleTrashFolder(folderName, isRulebook);
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--danger)",
              padding: "5px 12px",
              fontSize: "11px",
              textAlign: "left",
              cursor: "pointer",
              display: "block",
              width: "100%",
            }}
          >
            🗑️ Delete Folder
          </button>
        </div>
      </div>
    );
  };

  const handleIngestSRD = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sourceName = file.name.replace(/\.[^/.]+$/, "");
    const reader = new FileReader();

    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      invoke("ingest_srd_text", {
        category: "Reference",
        source: sourceName,
        content,
      })
        .then(() => invoke<RuleEntry[]>("load_rules"))
        .then((loadedRules) => {
          if (loadedRules) {
            setRules(loadedRules);
            if (loadedRules.length > 0)
              setSelectedRuleId(loadedRules[loadedRules.length - 1].id);
            alert(
              `Successfully ingested "${file.name}" and generated local semantic vector search chunks!`,
            );
          }
        })
        .catch((err) => {
          console.error("Failed to ingest SRD:", err);
          alert("Error during SRD ingestion: " + err);
        });
    };

    reader.readAsText(file);
  };

  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);

  useEffect(() => {
    if (!debouncedSearchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    invoke<any[]>("search_vault", {
      query: debouncedSearchQuery,
      category: searchCategory,
    })
      .then((res) => setSearchResults(res || []))
      .catch((err) => console.error("Search failed:", err));
  }, [debouncedSearchQuery, searchCategory]);

  const handleCreateNoteFromLink = (title: string) => {
    const newId = `note-${Date.now()}`;
    const newNote: CampaignNote = {
      id: newId,
      title,
      path: `Worldbuilding/${title.replace(/\s+/g, "_")}.md`,
      frontmatter: { type: "Note", tags: ["stub"] },
      content: `# ${title}\n\nThis note was created automatically from a wiki link.`,
    };

    invoke("save_note", { note: newNote })
      .then(() => invoke<CampaignNote[]>("load_notes"))
      .then((loadedNotes) => {
        if (loadedNotes) {
          setNotes(loadedNotes);
          setSelectedNoteId(newId);
          setIsEditingNote(true);
        }
      })
      .catch((err) => console.error("Failed to create wiki note:", err));
  };

  const handleNormalizeVaultMarkdown = () => {
    if (!notes.length) return;

    Promise.all(
      notes.map((note: any) => {
        const normalizedContent = normalizeCampaignMarkdown(
          note.content,
          "save",
        );
        const normalizedNote: CampaignNote = {
          ...note,
          content: normalizedContent,
        };

        if (normalizedContent === note.content) {
          return Promise.resolve();
        }

        return invoke("save_note", { note: normalizedNote });
      }),
    )
      .then(() => invoke<CampaignNote[]>("load_notes"))
      .then((loadedNotes) => {
        if (loadedNotes) {
          setNotes(loadedNotes);
          alert("Campaign vault markdown normalized successfully!");
        }
      })
      .catch((err) => {
        console.error("Failed to normalize vault markdown:", err);
        alert("Failed to normalize vault markdown: " + err);
      });
  };

  const handleRollCharacterSheet = () => {
    const name = prompt("Enter character name:", "Valerius");
    if (!name) return;
    const charClass = prompt("Enter character class:", "Fighter");
    if (!charClass) return;

    invoke<string>("execute_plugin_hook", {
      pluginId: "character-roller",
      hook: "generate_character",
      payload: JSON.stringify({ name, class: charClass }),
    })
      .then((resStr) => {
        const data = JSON.parse(resStr);
        const newId = `char-${Date.now()}`;
        const newNote: CampaignNote = {
          id: newId,
          title: name,
          path: `Characters/${name.replace(/\s+/g, "_")}.md`,
          frontmatter: {
            type: "Character",
            class: charClass,
            tags: ["character-roller", "npc"],
          },
          content: data.sheet,
        };
        return invoke("save_note", { note: newNote });
      })
      .then(() => invoke<CampaignNote[]>("load_notes"))
      .then((loadedNotes) => {
        if (loadedNotes) {
          setNotes(loadedNotes);
          const nameMatch = loadedNotes.find(
            (n) => n.title.toLowerCase() === name.toLowerCase(),
          );
          if (nameMatch) setSelectedNoteId(nameMatch.id);
          setActiveView("vault");
        }
      })
      .catch((err) => {
        console.error("Failed to generate character:", err);
        alert("Plugin failed: " + err);
      });
  };

  const handleEvaluateEncounterThreat = () => {
    const levelsStr = prompt(
      "Enter party character levels (comma separated):",
      "3, 3, 3, 3",
    );
    if (!levelsStr) return;
    const crsStr = prompt("Enter adversary CRs (comma separated):", "1, 2");
    if (!crsStr) return;

    const party_levels = levelsStr
      .split(",")
      .map((s) => parseInt(s.trim()) || 1);
    const adversaries_cr = crsStr
      .split(",")
      .map((s) => parseInt(s.trim()) || 1);

    invoke<string>("execute_plugin_hook", {
      pluginId: "threat-evaluator",
      hook: "evaluate_encounter",
      payload: JSON.stringify({ party_levels, adversaries_cr }),
    })
      .then((resStr) => {
        const data = JSON.parse(resStr);
        alert(`Threat Assessment Verdict:\n\n${data.verdict}`);
      })
      .catch((err) => {
        console.error("Failed to evaluate threat:", err);
        alert("Plugin failed: " + err);
      });
  };

  const renderFormattedText = (text: string): React.ReactNode => {
    const combinedRegex = /\*\*([^*]+)\*\*|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(text)) !== null) {
      const matchIndex = match.index;

      if (matchIndex > lastIndex) {
        parts.push(text.substring(lastIndex, matchIndex));
      }

      if (match[1]) {
        parts.push(
          <strong key={matchIndex}>{renderFormattedText(match[1])}</strong>,
        );
      } else if (match[2]) {
        const targetName = match[2].trim();
        const displayLabel = match[3] ? match[3].trim() : targetName;
        const matchedNote = notes.find(
          (n) => n.title.toLowerCase() === targetName.toLowerCase(),
        );

        if (matchedNote) {
          parts.push(
            <span
              key={matchIndex}
              onClick={() => setSelectedNoteId(matchedNote.id)}
              style={{
                color: "var(--accent)",
                cursor: "pointer",
                textDecoration: "underline",
                fontWeight: 600,
              }}
            >
              {displayLabel}
            </span>,
          );
        } else {
          parts.push(
            <span
              key={matchIndex}
              onClick={() => handleCreateNoteFromLink(targetName)}
              style={{
                color: "var(--muted)",
                cursor: "pointer",
                borderBottom: "1px dashed var(--muted)",
                fontStyle: "italic",
              }}
              title="Note does not exist. Click to create."
            >
              {displayLabel}?
            </span>,
          );
        }
      }

      lastIndex = combinedRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? <>{parts}</> : text;
  };

  const normalizeCampaignMarkdown = (
    input: string,
    mode: "save" | "render" = "save",
  ) => {
    if (!input) return "";

    // 1. Clean up any corrupted nested loreweaver-note links from prior bugs
    let text = input;
    while (/loreweaver-note:.*loreweaver-note:/.test(text)) {
      text = text.replace(/\[([^\]]+)\]\(loreweaver-note:[^)]+\)/g, "$1");
    }
    text = text.replace(/(?:loreweaver-note:)+/g, "loreweaver-note:");

    if (mode === "save") {
      // In save mode, only clean up corrupted links — do NOT auto-link note titles
      // (auto-linking on every save is destructive and corrupts user prose).
      return text;
    }

    // mode === "render": convert [[WikiLinks]] to markdown links for ReactMarkdown
    return text.replace(
      /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g,
      (_match, target, label) => {
        const resolvedTarget = String(target).trim();
        const resolvedLabel = String(label ?? target).trim();
        return `[${resolvedLabel}](loreweaver-note:${encodeURIComponent(resolvedTarget)})`;
      },
    );
  };

  const resolveCampaignNote = (targetName: string) => {
    const normalizedTarget = targetName.trim().toLowerCase();
    if (!normalizedTarget) return null;

    const getNoteLinkNames = (note: CampaignNote) => {
      const aliasValue = note.frontmatter.aliases ?? note.frontmatter.alias;
      const aliases = Array.isArray(aliasValue)
        ? aliasValue
        : typeof aliasValue === "string"
          ? [aliasValue]
          : [];

      return [note.title, ...aliases]
        .map((value) => String(value).trim())
        .filter(Boolean);
    };

    const matches = notes.filter((note: any) =>
      getNoteLinkNames(note).some(
        (name) => name.toLowerCase() === normalizedTarget,
      ),
    );

    if (matches.length === 1) {
      return matches[0];
    }

    const exactTitleMatches = matches.filter(
      (note: any) => note.title.trim().toLowerCase() === normalizedTarget,
    );

    if (exactTitleMatches.length === 1) {
      return exactTitleMatches[0];
    }

    return null;
  };

  const notesByFolder = useMemo<Record<string, CampaignNote[]>>(() => {
    const groups: Record<string, CampaignNote[]> = {};
    notes.forEach((note: any) => {
      const parts = note.path.split("/");
      let folder = "Root";
      if (parts.length > 1) {
        parts.pop();
        folder = parts.join("/");
      }
      if (!groups[folder]) {
        groups[folder] = [];
      }
      groups[folder].push(note);
    });
    return groups;
  }, [notes]);

  const rulesByFolder = useMemo<Record<string, RuleEntry[]>>(() => {
    const groups: Record<string, RuleEntry[]> = {};
    rules.forEach((rule: any) => {
      const parts = rule.path
        ? rule.path.split("/")
        : ["General", rule.title + ".md"];
      let folder = "General";
      if (parts.length > 1) {
        parts.pop();
        folder = parts.join("/");
      }
      if (!groups[folder]) {
        groups[folder] = [];
      }
      groups[folder].push(rule);
    });
    return groups;
  }, [rules]);

  const backlinks = useMemo<CampaignNote[]>(() => {
    if (!selectedNoteId) return [];
    const currentNoteObj = notes.find((n) => n.id === selectedNoteId);
    if (!currentNoteObj) return [];

    return notes.filter((note: any) => {
      if (note.id === selectedNoteId) return false;
      const lowerTitle = currentNoteObj.title.toLowerCase();
      return (
        note.content.toLowerCase().includes(`[[${lowerTitle}]]`) ||
        note.content.toLowerCase().includes(`[[${lowerTitle}|`)
      );
    });
  }, [notes, selectedNoteId]);

  const renderInlineMarkdown = (text: string): React.ReactNode => {
    if (!text) return "";
    const regex =
      /\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;

      if (matchIndex > lastIndex) {
        parts.push(text.substring(lastIndex, matchIndex));
      }

      if (match[1]) {
        parts.push(
          <strong key={matchIndex}>{renderInlineMarkdown(match[1])}</strong>,
        );
      } else if (match[2]) {
        parts.push(<em key={matchIndex}>{renderInlineMarkdown(match[2])}</em>);
      } else if (match[3]) {
        parts.push(<em key={matchIndex}>{renderInlineMarkdown(match[3])}</em>);
      } else if (match[4]) {
        parts.push(
          <code
            key={matchIndex}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              padding: "2px 6px",
              borderRadius: "3px",
              fontFamily: "var(--font-mono)",
              fontSize: "0.85em",
            }}
          >
            {match[4]}
          </code>,
        );
      } else if (match[5]) {
        const targetName = match[5].trim();
        const displayLabel = match[6] ? match[6].trim() : targetName;
        const matchedNote = resolveCampaignNote(targetName);

        if (matchedNote) {
          parts.push(
            <span
              key={matchIndex}
              onClick={() => setSelectedNoteId(matchedNote.id)}
              style={{
                color: "var(--accent)",
                cursor: "pointer",
                textDecoration: "underline",
                fontWeight: 600,
              }}
            >
              {displayLabel}
            </span>,
          );
        } else {
          parts.push(
            <span
              key={matchIndex}
              onClick={() => handleCreateNoteFromLink(targetName)}
              style={{
                color: "var(--muted)",
                cursor: "pointer",
                borderBottom: "1px dashed var(--muted)",
                fontStyle: "italic",
              }}
              title="Note does not exist. Click to create."
            >
              {displayLabel}?
            </span>,
          );
        }
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? <>{parts}</> : text;
  };

  const renderMarkdown = (markdown: string): React.ReactNode => {
    if (!markdown) return null;
    const markdownComponents: Components = {
      a: ({ href, children }) => {
        const linkHref = href || "";

        if (linkHref.startsWith("loreweaver-note:")) {
          const targetTitle = decodeURIComponent(
            linkHref.slice("loreweaver-note:".length),
          );
          const matchedNote = resolveCampaignNote(targetTitle);

          if (matchedNote) {
            return (
              <button
                type="button"
                onClick={() => setSelectedNoteId(matchedNote.id)}
                className="markdown-note-link"
              >
                {children}
              </button>
            );
          }

          return (
            <button
              type="button"
              onClick={() => handleCreateNoteFromLink(targetTitle)}
              className="markdown-note-link markdown-note-link-missing"
              title="Note does not exist. Click to create."
            >
              {children}?
            </button>
          );
        }

        if (/^https?:\/\//i.test(linkHref)) {
          return (
            <a
              href={linkHref}
              target="_blank"
              rel="noreferrer noopener"
              className="markdown-external-link"
            >
              {children}
            </a>
          );
        }

        return (
          <a href={linkHref} className="markdown-external-link">
            {children}
          </a>
        );
      },
      table: ({ children }) => (
        <table className="markdown-table">{children}</table>
      ),
      thead: ({ children }) => <thead>{children}</thead>,
      tbody: ({ children }) => <tbody>{children}</tbody>,
      tr: ({ children }) => <tr>{children}</tr>,
      th: ({ children }) => <th>{children}</th>,
      td: ({ children }) => <td>{children}</td>,
      blockquote: ({ children }) => (
        <blockquote className="markdown-quote">{children}</blockquote>
      ),
      pre: ({ children }) => <pre className="markdown-pre">{children}</pre>,
      code: ({ className, children }) => (
        <code
          className={className ? `markdown-code ${className}` : "markdown-code"}
        >
          {children}
        </code>
      ),
      img: ({ src, alt, title }) => {
        let finalSrc = src || "";
        if (finalSrc.startsWith("_assets/") || finalSrc.includes("/_assets/")) {
          const activeNoteObj = notes.find((n) => n.id === selectedNoteId);
          if (activeNoteObj && vaultPath) {
            const parts = activeNoteObj.path.split("/");
            parts.pop();
            const parentRelative = parts.join("/");
            const separator = parentRelative ? "/" : "";
            const absolutePath = `${vaultPath}${separator}${parentRelative}/${finalSrc.replace(/^[./]+/, "")}`;
            try {
              finalSrc = convertFileSrc(absolutePath);
            } catch (e) {
              console.error("Failed to convert file src:", e);
            }
          }
        }
        return (
          <img
            src={finalSrc}
            alt={alt}
            title={title}
            className="markdown-image"
            style={{ maxWidth: "100%", borderRadius: "4px" }}
          />
        );
      },
      audio: ({ src }) => {
        let finalSrc = src || "";
        if (finalSrc.startsWith("_assets/") || finalSrc.includes("/_assets/")) {
          const activeNoteObj = notes.find((n) => n.id === selectedNoteId);
          if (activeNoteObj && vaultPath) {
            const parts = activeNoteObj.path.split("/");
            parts.pop();
            const parentRelative = parts.join("/");
            const separator = parentRelative ? "/" : "";
            const absolutePath = `${vaultPath}${separator}${parentRelative}/${finalSrc.replace(/^[./]+/, "")}`;
            try {
              finalSrc = convertFileSrc(absolutePath);
            } catch (e) {
              console.error("Failed to convert file src:", e);
            }
          }
        }
        return (
          <audio
            src={finalSrc}
            controls
            className="markdown-audio"
            style={{ width: "100%" }}
          />
        );
      },
    };

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {normalizeCampaignMarkdown(markdown, "render")}
      </ReactMarkdown>
    );
  };

  const rollDice = (sides: number) => {
    const roll = Math.floor(Math.random() * sides) + 1;
    const initialPayload = JSON.stringify({
      sides,
      roll,
      modifier: rollModifier,
    });

    const hasDicePlugin = pluginsList.some(
      (p) => p.id === "dice-bonus" && p.active,
    );

    const addHistory = (data: { roll: number; modifier?: number }) => {
      const mod = data.modifier ?? rollModifier;
      const modText = mod >= 0 ? `+${mod}` : `${mod}`;
      const total = data.roll + mod;
      const historyEntry = `d${sides} rolled: ${data.roll} (${modText}) = ${total}`;
      setDiceHistory((prev) => [historyEntry, ...prev.slice(0, 15)]);
    };

    if (hasDicePlugin) {
      invoke<string>("execute_plugin_hook", {
        pluginId: "dice-bonus",
        hook: "on_dice_roll",
        payload: initialPayload,
      })
        .then((resultStr) => {
          const data = JSON.parse(resultStr);
          addHistory(data);
        })
        .catch(() => addHistory({ roll }));
    } else {
      addHistory({ roll });
    }
  };

  const handleSendChatMessage = () => {
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    updateVaultChatMessages((prev) => [
      ...prev,
      { role: "user", text: userMsg },
    ]);
    setChatInput("");

    invoke<string>("orchestrate_agent", {
      prompt: userMsg,
      provider: llmProvider,
      model: llmModel,
      apiKey: llmApiKey || null,
      baseUrl: llmBaseUrl || null,
      activeNoteId: selectedNoteId || null,
    })
      .then((botResponse) => {
        updateVaultChatMessages((prev) => [
          ...prev,
          { role: "assistant", text: botResponse },
        ]);
      })
      .catch((err) => {
        console.error("AI agent error:", err);
        let fallback = `Error calling AI provider: ${err}. Please ensure your configured LLM server is running or configure an API key in Settings.`;
        updateVaultChatMessages((prev) => [
          ...prev,
          { role: "assistant", text: fallback },
        ]);
      });
  };

  const handleGenerateImage = () => {
    setIsGeneratingImage(true);
    setGeneratedImageUrl("");

    invoke<string>("generate_image", {
      prompt: imagePrompt,
      style: imageStyle,
      provider: imageProvider,
      model: imageModel,
      apiKey: imageApiKey || null,
      baseUrl: imageBaseUrl || null,
    })
      .then((dataUrl) => {
        setGeneratedImageUrl(dataUrl);
      })
      .catch((err) => {
        alert("Image generation failed: " + err);
      })
      .finally(() => {
        setIsGeneratingImage(false);
      });
  };

  const handleGenerateSpeech = () => {
    if (!ttsText.trim()) return;
    setIsGeneratingSpeech(true);
    setGeneratedSpeechUrl("");

    invoke<string>("generate_speech", {
      text: ttsText,
      provider: ttsProvider,
      apiKey: ttsApiKey || null,
      voice: ttsProvider === "openai" ? "alloy" : null,
      baseUrl: null,
    })
      .then((audioUrl) => {
        setGeneratedSpeechUrl(audioUrl);
      })
      .catch((err) => {
        alert("Speech generation failed: " + err);
      })
      .finally(() => {
        setIsGeneratingSpeech(false);
      });
  };

  const currentNote = notes.find((n) => n.id === selectedNoteId);
  const currentRule = rules.find((r) => r.id === selectedRuleId);

  return (
    <div className="app-container">
      {activeFolderDropdown && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "transparent",
          }}
          onClick={(e) => {
            e.stopPropagation();
            setActiveFolderDropdown(null);
          }}
        />
      )}
      {/* ── Far-Left Icon Ribbon ── */}
      <nav className="ribbon" data-od-id="ribbon">
        <div
          className="ribbon-logo"
          title="Loreweaver"
          onClick={() => setActiveView("dashboard")}
        >
          <Layers size={22} style={{ color: "var(--accent)" }} />
        </div>

        <div className="ribbon-nav">
          <button
            className={`ribbon-btn ${activeView === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveView("dashboard")}
            title="Dashboard"
            data-od-id="nav-dashboard"
          >
            <Compass size={18} />
          </button>
          <button
            className={`ribbon-btn ${activeView === "vault" ? "active" : ""}`}
            onClick={() => setActiveView("vault")}
            title="Campaign Vault"
            data-od-id="nav-vault"
          >
            <FolderOpen size={18} />
          </button>
          <button
            className={`ribbon-btn ${activeView === "rules" ? "active" : ""}`}
            onClick={() => setActiveView("rules")}
            title="Rulebooks & SRDs"
            data-od-id="nav-rules"
          >
            <BookOpen size={18} />
          </button>
          <button
            className={`ribbon-btn ${activeView === "ai" ? "active" : ""}`}
            onClick={() => setActiveView("ai")}
            title="AI & Generations"
            data-od-id="nav-ai"
          >
            <Brain size={18} />
          </button>
        </div>

        <div className="ribbon-footer">
          <button
            className={`ribbon-btn ${activeView === "trash" ? "active" : ""}`}
            onClick={() => {
              invoke<CampaignNote[]>("load_trash_notes").then((res) => {
                if (res) setTrashedNotes(res);
              });
              setActiveView("trash");
            }}
            title="Trash & Archive"
            data-od-id="nav-trash"
          >
            <Trash2 size={18} />
          </button>
          <button
            className={`ribbon-btn ${activeView === "settings" ? "active" : ""}`}
            onClick={() => setActiveView("settings")}
            title="Settings"
            data-od-id="nav-settings"
          >
            <SettingsIcon size={18} />
          </button>
          <button
            className="ribbon-btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Toggle Theme"
            data-od-id="btn-theme-toggle"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </nav>

      {/* ── Main Area ── */}
      <main className="main-area" data-od-id="main-area">
        <header className="toolbar" data-od-id="toolbar">
          <div
            className="breadcrumb"
            style={{ display: "flex", alignItems: "center", gap: "10px" }}
          >
            {activeView === "dashboard" && "Dashboard"}
            {activeView === "vault" && (
              <>
                Vault / <span>{currentNote?.title || "Untitled"}</span>
              </>
            )}
            {activeView === "rules" && (
              <>
                Rules / <span>{currentRule?.title || "Untitled"}</span>
              </>
            )}
            {activeView === "ai" && "AI & Generations"}
            {activeView === "settings" && "Settings"}
            {activeView === "trash" && "Vault & Rulebook Trash"}

            {/* Separator */}
            <div
              style={{
                width: "1px",
                height: "14px",
                background: "var(--border)",
                margin: "0 10px",
              }}
            />

            {/* Vault Switcher Select Dropdown */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <FolderOpen size={14} style={{ color: "var(--accent)" }} />
              <select
                value={vaultPath}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "NEW_VAULT_TRIGGER") {
                    setShowNewVaultModal(true);
                  } else if (val) {
                    invoke("switch_vault", { path: val })
                      .then(() => refreshVaultData())
                      .catch((err) => alert("Failed to switch vault: " + err));
                  }
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--fg)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  outline: "none",
                  paddingRight: "8px",
                }}
              >
                {vaults.map((v) => (
                  <option
                    key={v.path}
                    value={v.path}
                    style={{ background: "var(--surface)", color: "var(--fg)" }}
                  >
                    {v.name}
                  </option>
                ))}
                <option
                  value="NEW_VAULT_TRIGGER"
                  style={{
                    background: "var(--surface)",
                    color: "var(--accent)",
                  }}
                >
                  + Create New Vault...
                </option>
              </select>
            </div>
          </div>

          <div className="toolbar-actions">
            <div className="search-wrapper" ref={searchRef}>
              <div className="search-bar">
                <Search />
                <input
                  placeholder="Semantic search campaign..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  onFocus={() => setIsSearchOpen(true)}
                  aria-label="Search vault"
                />
              </div>
              {isSearchOpen && searchQuery.trim() && (
                <div className="search-results">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 8px",
                      borderBottom: "1px solid var(--border)",
                      marginBottom: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "var(--muted)",
                      }}
                    >
                      HYBRID SEMANTIC SEARCH RESULTS
                    </span>
                    <button
                      onClick={() => {
                        setIsSearchOpen(false);
                        setSearchQuery("");
                      }}
                      style={{
                        padding: "2px 4px",
                        fontSize: "0.75rem",
                        border: "none",
                      }}
                    >
                      Close
                    </button>
                  </div>
                  {searchResults.length === 0 ? (
                    <div
                      style={{
                        padding: "16px",
                        textAlign: "center",
                        color: "var(--muted)",
                        fontSize: "0.85rem",
                      }}
                    >
                      No vector similarity matches found
                    </div>
                  ) : (
                    searchResults.map((result, idx) => (
                      <div
                        key={idx}
                        className="search-result-item"
                        onClick={() => {
                          if (result.type === "note") {
                            const matchedNote = notes.find(
                              (n) => n.path === result.path,
                            );
                            if (matchedNote) {
                              setSelectedNoteId(matchedNote.id);
                            }
                            setActiveView("vault");
                          } else {
                            const rule = rules.find(
                              (r) => r.id === result.path,
                            );
                            if (rule) setSelectedRuleId(rule.id);
                            setActiveView("rules");
                          }
                          setIsSearchOpen(false);
                          setSearchQuery("");
                        }}
                      >
                        <div className="search-result-title">
                          {result.title}
                        </div>
                        <div className="search-result-snippet">
                          {result.snippet}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Content Views ── */}
        <div
          className="workspace-content"
          style={{ flex: 1, overflow: "hidden", display: "flex" }}
        >
          {/* Central Active View viewport */}
          <div
            style={{
              flex: 1,
              height: "100%",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* VIEW: DASHBOARD */}
            {activeView === "dashboard" && (
              <div className="view-container" data-od-id="dashboard-view">
                <div className="dashboard-grid">
                  <div className="dash-hero" data-od-id="dash-hero">
                    <div className="dash-hero-content">
                      <div className="dash-hero-title">Campaign Workspace</div>
                      <div className="dash-hero-desc">
                        Welcome back, GM. Your campaign database currently has{" "}
                        <strong>{notes.length} notes</strong> and{" "}
                        <strong>{rules.length} rule guides</strong> indexed.
                      </div>
                      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => setActiveView("vault")}
                          data-od-id="dash-open-vault"
                        >
                          Open Vault
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => setActiveView("ai")}
                          data-od-id="dash-open-architect"
                        >
                          Ask Architect
                        </button>
                      </div>
                    </div>
                    <div className="dash-hero-image">
                      <img src="/elven_mage.jpg" alt="Elven mage" />
                    </div>
                  </div>

                  <div
                    className="dash-card"
                    onClick={() => setActiveView("vault")}
                    data-od-id="dash-notes"
                  >
                    <div className="dash-card-count">{notes.length}</div>
                    <div className="dash-card-label">Campaign Notes</div>
                    <div className="dash-card-desc">
                      Worldbuilding, NPCs, locations, and lore
                    </div>
                  </div>

                  <div
                    className="dash-card"
                    onClick={() => setActiveView("rules")}
                    data-od-id="dash-rules"
                  >
                    <div className="dash-card-count">{rules.length}</div>
                    <div className="dash-card-label">Rule Entries</div>
                    <div className="dash-card-desc">
                      Core rules, magic, and reference material
                    </div>
                  </div>

                  <div
                    className="dash-card"
                    onClick={() => setActiveView("ai")}
                    data-od-id="dash-ai"
                  >
                    <div className="dash-card-count">AI</div>
                    <div className="dash-card-label">Campaign Architect</div>
                    <div className="dash-card-desc">
                      Chat, generate, and orchestrate
                    </div>
                  </div>

                  <div className="dash-recent" data-od-id="dash-recent">
                    <div className="dash-recent-header">
                      <span className="panel-title" style={{ marginBottom: 0 }}>
                        Recent Notes
                      </span>
                      <button
                        className="btn btn-sm"
                        onClick={() => setActiveView("vault")}
                      >
                        View All
                      </button>
                    </div>
                    {notes.map((note: any) => (
                      <div
                        key={note.id}
                        className="dash-recent-item"
                        onClick={() => {
                          setActiveView("vault");
                          setSelectedNoteId(note.id);
                        }}
                      >
                        <div>
                          <div className="dash-recent-title">{note.title}</div>
                          <div className="dash-recent-cat">
                            {String(note.frontmatter.type || "Note")}
                          </div>
                        </div>
                        <ChevronRight size={14} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW: VAULT */}
            {activeView === "vault" && (
              <div
                className="view-container"
                data-od-id="vault-view"
                style={{ padding: 0, overflow: "hidden" }}
              >
                <div style={{ display: "flex", width: "100%", height: "100%" }}>
                  <div
                    style={{
                      width: 220,
                      borderRight: "1px solid var(--border)",
                      overflowY: "auto",
                      padding: "12px 8px",
                      flexShrink: 0,
                      background: "var(--surface)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        margin: "4px 8px 12px 8px",
                      }}
                    >
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={handleNewNote}
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          fontSize: "11px",
                          cursor: "pointer",
                          borderRadius: "4px",
                        }}
                        title="Create a new note"
                      >
                        <FilePlus size={12} /> New Note
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={handleNewFolder}
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          fontSize: "11px",
                          cursor: "pointer",
                          background: "transparent",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          color: "var(--fg)",
                        }}
                        title="Create a new folder"
                      >
                        <FolderPlus size={12} /> Folder
                      </button>
                    </div>

                    <span
                      className="section-label"
                      style={{
                        marginLeft: 8,
                        display: "block",
                        marginBottom: "8px",
                      }}
                    >
                      Campaign Notes
                    </span>

                    {Object.entries(notesByFolder).map(
                      ([folderName, folderNotes]) => {
                        const isCollapsed = !!collapsedFolders[folderName];
                        return (
                          <div key={folderName} style={{ marginBottom: "8px" }}>
                            {/* Folder Header */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                width: "100%",
                                paddingRight: "8px",
                                borderRadius: "4px",
                              }}
                              className="folder-item-header"
                            >
                              <div
                                onClick={() =>
                                  setCollapsedFolders((prev) => ({
                                    ...prev,
                                    [folderName]: !isCollapsed,
                                  }))
                                }
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  padding: "6px 8px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: "var(--fg)",
                                  userSelect: "none",
                                  flex: 1,
                                  overflow: "hidden",
                                }}
                              >
                                <ChevronRight
                                  size={12}
                                  style={{
                                    transform: isCollapsed
                                      ? "rotate(0deg)"
                                      : "rotate(90deg)",
                                    transition: "transform 0.15s ease",
                                    color: "var(--muted)",
                                  }}
                                />
                                <span style={{ fontSize: "13px" }}>📁</span>
                                <span
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {folderName}
                                </span>
                              </div>

                              {/* Plus button for folder-specific creation actions */}
                              <div style={{ position: "relative" }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveFolderDropdown(
                                      activeFolderDropdown === folderName
                                        ? null
                                        : folderName,
                                    );
                                  }}
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--muted)",
                                    cursor: "pointer",
                                    padding: "2px 6px",
                                    display: "flex",
                                    alignItems: "center",
                                    fontSize: "14px",
                                    fontWeight: "bold",
                                  }}
                                  title="Add Asset to folder..."
                                >
                                  +
                                </button>

                                {renderFolderDropdown(folderName, false)}
                              </div>
                            </div>

                            {!isCollapsed && (
                              <div
                                style={{
                                  paddingLeft: "16px",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "2px",
                                }}
                              >
                                {(folderNotes as any[]).map((note: any) => {
                                  const isCanvas =
                                    note.frontmatter.type === "Canvas" ||
                                    note.path.endsWith(".canvas");
                                  const isAsset =
                                    note.frontmatter.tags?.includes("asset");
                                  let icon = <FileText size={12} />;
                                  if (isCanvas) icon = <span>🎨</span>;
                                  else if (
                                    isAsset &&
                                    note.frontmatter.type === "AUDIO"
                                  )
                                    icon = <span>🎵</span>;
                                  else if (
                                    isAsset &&
                                    note.frontmatter.type === "IMAGE"
                                  )
                                    icon = <span>🖼️</span>;

                                  return (
                                    <button
                                      key={note.id}
                                      className={`nav-item ${selectedNoteId === note.id ? "active" : ""}`}
                                      onClick={() => {
                                        setSelectedNoteId(note.id);
                                        if (isCanvas) {
                                          const parts = note.path.split("/");
                                          parts.pop();
                                          const folderName = parts.join("/");
                                          setCurrentCanvasFolder(folderName);
                                          setActiveView("canvas");
                                        } else {
                                          setIsEditingNote(false);
                                          setActiveView("vault");
                                        }
                                      }}
                                      style={{
                                        padding: "6px 8px",
                                        fontSize: "12px",
                                        display: "flex",
                                        alignItems: "center",
                                      }}
                                      data-od-id={`note-${note.id}`}
                                    >
                                      {icon}{" "}
                                      <span style={{ marginLeft: "6px" }}>
                                        {note.title}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      },
                    )}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      padding: "32px 40px",
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      className="document-sheet"
                      style={{ padding: "40px 48px" }}
                    >
                      {/* Mode Toggle at top-right */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: "8px",
                          marginBottom: "16px",
                        }}
                      >
                        <button
                          onClick={handleNormalizeVaultMarkdown}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            border: "1px solid var(--border)",
                            background: "var(--bg)",
                            color: "var(--fg)",
                            padding: "4px 10px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 600,
                            fontFamily: "var(--font-body)",
                            cursor: "pointer",
                          }}
                          title="Rewrite notes with canonical wiki links"
                        >
                          <Copy size={12} /> Normalize Vault
                        </button>
                        <div
                          style={{
                            display: "flex",
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            padding: "2px",
                          }}
                        >
                          <button
                            onClick={() => {
                              triggerImmediateSave();
                              setIsEditingNote(false);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              border: "none",
                              background: !isEditingNote
                                ? "var(--surface)"
                                : "transparent",
                              color: !isEditingNote
                                ? "var(--accent)"
                                : "var(--muted)",
                              padding: "4px 10px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 600,
                              fontFamily: "var(--font-body)",
                              cursor: "pointer",
                            }}
                          >
                            <Eye size={12} /> Preview
                          </button>
                          <button
                            onClick={() => setIsEditingNote(true)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              border: "none",
                              background: isEditingNote
                                ? "var(--surface)"
                                : "transparent",
                              color: isEditingNote
                                ? "var(--accent)"
                                : "var(--muted)",
                              padding: "4px 10px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 600,
                              fontFamily: "var(--font-body)",
                              cursor: "pointer",
                            }}
                          >
                            <PenLine size={12} /> Edit
                          </button>
                        </div>

                        {selectedNoteId && currentNote && (
                          <button
                            className="btn btn-sm"
                            onClick={() => handleTrashNote(currentNote.path)}
                            style={{
                              color: "var(--danger)",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                            title="Trash this note"
                          >
                            <Trash2 size={12} /> Trash Note
                          </button>
                        )}
                      </div>

                      {isEditingNote ? (
                        <div>
                          {/* Title Edit (Borderless) */}
                          <div style={{ marginBottom: "16px" }}>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              style={{
                                fontFamily: "var(--font-display)",
                                fontSize: "36px",
                                lineHeight: "1.1",
                                letterSpacing: "-0.02em",
                                fontWeight: 600,
                                border: "none",
                                outline: "none",
                                background: "transparent",
                                color: "var(--fg)",
                                width: "100%",
                                padding: "0 0 6px 0",
                                borderBottom: "1px dashed var(--border)",
                              }}
                              placeholder="Untitled Note"
                            />
                          </div>

                          {/* Collapsible Metadata Editor */}
                          <details
                            style={{
                              marginBottom: "20px",
                              border: "1px solid var(--border)",
                              borderRadius: "4px",
                              padding: "10px 14px",
                              background: "var(--surface)",
                            }}
                          >
                            <summary
                              style={{
                                fontSize: "11px",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                color: "var(--muted)",
                                fontWeight: 600,
                                cursor: "pointer",
                                outline: "none",
                              }}
                            >
                              Metadata Properties
                            </summary>
                            <div
                              style={{
                                marginTop: "12px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                              }}
                            >
                              {Object.entries(editFrontmatter).map(
                                ([key, val]) => (
                                  <div
                                    key={key}
                                    style={{
                                      display: "flex",
                                      gap: "8px",
                                      alignItems: "center",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "12px",
                                        width: "100px",
                                        color: "var(--muted)",
                                        fontWeight: 500,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {key}
                                    </span>
                                    <input
                                      type="text"
                                      value={
                                        Array.isArray(val)
                                          ? val.join(", ")
                                          : String(val)
                                      }
                                      onChange={(e) => {
                                        const newVal = e.target.value;
                                        setEditFrontmatter((prev) => ({
                                          ...prev,
                                          [key]:
                                            key === "tags"
                                              ? newVal
                                                  .split(",")
                                                  .map((t) => t.trim())
                                              : newVal,
                                        }));
                                      }}
                                      style={{
                                        flex: 1,
                                        padding: "4px 8px",
                                        fontSize: "12px",
                                        background: "var(--bg)",
                                        border: "1px solid var(--border)",
                                        borderRadius: "4px",
                                        color: "var(--fg)",
                                      }}
                                    />
                                    <button
                                      onClick={() => {
                                        const { [key]: _, ...rest } =
                                          editFrontmatter;
                                        setEditFrontmatter(rest);
                                      }}
                                      className="btn btn-sm"
                                      style={{
                                        color: "var(--danger)",
                                        padding: "4px 8px",
                                      }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ),
                              )}

                              {/* Add New Metadata Key-Value */}
                              <div
                                style={{
                                  display: "flex",
                                  gap: "8px",
                                  marginTop: "12px",
                                  alignItems: "center",
                                }}
                              >
                                <input
                                  placeholder="Key"
                                  value={newMetaKey}
                                  onChange={(e) =>
                                    setNewMetaKey(e.target.value)
                                  }
                                  style={{
                                    width: "100px",
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    background: "var(--bg)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "4px",
                                    color: "var(--fg)",
                                  }}
                                />
                                <input
                                  placeholder="Value"
                                  value={newMetaVal}
                                  onChange={(e) =>
                                    setNewMetaVal(e.target.value)
                                  }
                                  style={{
                                    flex: 1,
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    background: "var(--bg)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "4px",
                                    color: "var(--fg)",
                                  }}
                                />
                                <button
                                  onClick={() => {
                                    if (!newMetaKey.trim()) return;
                                    setEditFrontmatter((prev) => ({
                                      ...prev,
                                      [newMetaKey.trim()]: newMetaVal,
                                    }));
                                    setNewMetaKey("");
                                    setNewMetaVal("");
                                  }}
                                  className="btn btn-sm"
                                  style={{ padding: "4px 10px" }}
                                >
                                  Add Field
                                </button>
                              </div>
                            </div>
                          </details>

                          {/* Content Body Edit (Borderless, inheriting styles) */}
                          <div style={{ marginBottom: "20px" }}>
                            <Suspense
                              fallback={
                                <div
                                  style={{
                                    width: "100%",
                                    height: "400px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    border: "1px solid var(--border)",
                                    borderRadius: "6px",
                                    background: "var(--surface)",
                                    color: "var(--muted)",
                                    fontSize: "13px",
                                  }}
                                >
                                  Loading markdown editor...
                                </div>
                              }
                            >
                              <MarkdownEditor
                                value={editContent}
                                onChange={setEditContent}
                                notes={notes}
                                activeNotePath={
                                  currentNote ? currentNote.path : ""
                                }
                              />
                            </Suspense>
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--muted)",
                              fontStyle: "italic",
                              borderTop: "1px solid var(--border)",
                              paddingTop: "8px",
                            }}
                          >
                            ● Auto-saving in background...
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div
                            className="doc-title"
                            style={{ wordBreak: "break-word" }}
                          >
                            {currentNote?.title}
                          </div>
                          <div className="doc-meta">
                            <span className="doc-meta-tag">
                              {String(currentNote?.frontmatter.type || "Note")}
                            </span>
                            <span>{currentNote?.path}</span>
                          </div>
                          <div className="doc-body">
                            {currentNote
                              ? renderMarkdown(currentNote.content)
                              : null}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW: RULES */}
            {activeView === "rules" && (
              <div
                className="view-container"
                data-od-id="rules-view"
                style={{ padding: 0, overflow: "hidden" }}
              >
                <div style={{ display: "flex", width: "100%", height: "100%" }}>
                  {/* Left Rules Navigation Sidebar */}
                  <div
                    className="vault-sidebar"
                    style={{
                      width: 260,
                      borderRight: "1px solid var(--border)",
                      overflowY: "auto",
                      padding: "12px 8px",
                      flexShrink: 0,
                      background: "var(--surface)",
                    }}
                  >
                    {/* Action Buttons Header */}
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        marginBottom: "12px",
                        padding: "0 4px",
                      }}
                    >
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleNewRule()}
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          fontSize: "11px",
                        }}
                        title="Create a new rule entry"
                      >
                        <Plus size={12} /> New Rule
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={handleNewRuleFolder}
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          fontSize: "11px",
                          background: "transparent",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          color: "var(--fg)",
                        }}
                        title="Create a new rulebook folder or subfolder"
                      >
                        <FolderPlus size={12} /> Folder
                      </button>
                    </div>

                    <span
                      className="section-label"
                      style={{
                        marginLeft: 8,
                        display: "block",
                        marginBottom: "8px",
                      }}
                    >
                      Rulebook Entries
                    </span>

                    {Object.entries(rulesByFolder).map(
                      ([folderName, folderRules]) => {
                        const isCollapsed =
                          !!collapsedFolders[`rule-folder-${folderName}`];
                        return (
                          <div key={folderName} style={{ marginBottom: "8px" }}>
                            {/* Folder Header */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                width: "100%",
                                paddingRight: "8px",
                                borderRadius: "4px",
                              }}
                              className="folder-item-header"
                            >
                              <div
                                onClick={() =>
                                  setCollapsedFolders((prev) => ({
                                    ...prev,
                                    [`rule-folder-${folderName}`]: !isCollapsed,
                                  }))
                                }
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  padding: "6px 8px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: "var(--fg)",
                                  userSelect: "none",
                                  flex: 1,
                                  overflow: "hidden",
                                }}
                              >
                                <ChevronRight
                                  size={12}
                                  style={{
                                    transform: isCollapsed
                                      ? "rotate(0deg)"
                                      : "rotate(90deg)",
                                    transition: "transform 0.15s ease",
                                    color: "var(--muted)",
                                  }}
                                />
                                <span style={{ fontSize: "13px" }}>📁</span>
                                <span
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {folderName}
                                </span>
                              </div>

                              {/* Plus button for folder actions */}
                              <div style={{ position: "relative" }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const key = `rule-folder-${folderName}`;
                                    setActiveFolderDropdown(
                                      activeFolderDropdown === key ? null : key,
                                    );
                                  }}
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--muted)",
                                    cursor: "pointer",
                                    padding: "2px 6px",
                                    display: "flex",
                                    alignItems: "center",
                                    fontSize: "14px",
                                    fontWeight: "bold",
                                  }}
                                  title="Add Asset to folder..."
                                >
                                  +
                                </button>

                                {renderFolderDropdown(folderName, true)}
                              </div>
                            </div>

                            {/* Rules List inside folder */}
                            {!isCollapsed && (
                              <div
                                style={{
                                  paddingLeft: "16px",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "2px",
                                  marginTop: "2px",
                                }}
                              >
                                {folderRules.map((rule) => (
                                  <button
                                    key={rule.id}
                                    className={`nav-item ${selectedRuleId === rule.id ? "active" : ""}`}
                                    onClick={() => {
                                      setSelectedRuleId(rule.id);
                                      setIsEditingRule(false);
                                    }}
                                    style={{
                                      padding: "6px 8px",
                                      fontSize: "12px",
                                      display: "flex",
                                      alignItems: "center",
                                      width: "100%",
                                      textAlign: "left",
                                    }}
                                    data-od-id={`rule-${rule.id}`}
                                  >
                                    <BookOpen size={12} />{" "}
                                    <span
                                      style={{
                                        marginLeft: "6px",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {rule.title}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      },
                    )}

                    <input
                      type="file"
                      id="srd-file-input"
                      style={{ display: "none" }}
                      accept=".md,.txt,.pdf"
                      onChange={handleIngestSRD}
                    />
                    <input
                      type="file"
                      ref={assetFileInputRef}
                      style={{ display: "none" }}
                      accept={
                        pendingAssetTarget?.type === "image"
                          ? "image/*"
                          : pendingAssetTarget?.type === "audio"
                            ? "audio/*"
                            : "*/*"
                      }
                      onChange={handleAssetFileSelected}
                    />
                    <div
                      onClick={() =>
                        document.getElementById("srd-file-input")?.click()
                      }
                      style={{
                        marginTop: "20px",
                        padding: "16px",
                        border: "2px dashed var(--border)",
                        borderRadius: "4px",
                        textAlign: "center",
                        cursor: "pointer",
                        background: "var(--bg)",
                      }}
                    >
                      <FileText
                        size={22}
                        style={{
                          margin: "0 auto 8px auto",
                          color: "var(--accent)",
                        }}
                      />
                      <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                        Import Markdown or PDF
                      </div>
                      <div
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--muted)",
                          marginTop: "4px",
                        }}
                      >
                        Click to select .md, .txt, or .pdf rulebook file
                      </div>
                    </div>
                  </div>

                  {/* Right Document Sheet View & Editor Area */}
                  <div
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      padding: "32px 40px",
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      className="document-sheet"
                      style={{
                        padding: "40px 48px",
                        width: "100%",
                        maxWidth: "840px",
                      }}
                    >
                      {/* Top Action Bar (Matching Vault conventions) */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 20,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            padding: "2px",
                            borderRadius: "6px",
                          }}
                        >
                          <button
                            onClick={() => setIsEditingRule(false)}
                            style={{
                              border: "none",
                              background: !isEditingRule
                                ? "var(--surface)"
                                : "transparent",
                              color: !isEditingRule
                                ? "var(--accent)"
                                : "var(--muted)",
                              padding: "4px 10px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 600,
                              fontFamily: "var(--font-body)",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Eye size={12} /> Preview
                          </button>
                          <button
                            onClick={() => setIsEditingRule(true)}
                            style={{
                              border: "none",
                              background: isEditingRule
                                ? "var(--surface)"
                                : "transparent",
                              color: isEditingRule
                                ? "var(--accent)"
                                : "var(--muted)",
                              padding: "4px 10px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 600,
                              fontFamily: "var(--font-body)",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <PenLine size={12} /> Edit
                          </button>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                          }}
                        >
                          <label
                            className="btn btn-sm"
                            style={{
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <ImageIcon size={12} /> Insert Chart / Image
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleInsertRuleImage}
                              style={{ display: "none" }}
                            />
                          </label>
                          {selectedRuleId && (
                            <button
                              className="btn btn-sm"
                              onClick={() => handleDeleteRule(selectedRuleId)}
                              style={{
                                color: "var(--danger)",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Trash2 size={12} /> Trash Rule
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditingRule ? (
                        <div>
                          {/* Title Edit (Borderless, identical to Vault note title input) */}
                          <div style={{ marginBottom: "16px" }}>
                            <input
                              type="text"
                              value={editRuleTitle}
                              onChange={(e) => setEditRuleTitle(e.target.value)}
                              style={{
                                fontFamily: "var(--font-display)",
                                fontSize: "36px",
                                lineHeight: "1.1",
                                letterSpacing: "-0.02em",
                                fontWeight: 600,
                                border: "none",
                                outline: "none",
                                background: "transparent",
                                color: "var(--fg)",
                                width: "100%",
                                padding: "0 0 6px 0",
                                borderBottom: "1px dashed var(--border)",
                              }}
                              placeholder="Untitled Rule"
                            />
                          </div>

                          {/* Collapsible Metadata Editor */}
                          <details
                            style={{
                              marginBottom: "20px",
                              border: "1px solid var(--border)",
                              borderRadius: "4px",
                              padding: "10px 14px",
                              background: "var(--surface)",
                            }}
                          >
                            <summary
                              style={{
                                fontSize: "11px",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                color: "var(--muted)",
                                fontWeight: 600,
                                cursor: "pointer",
                                outline: "none",
                              }}
                            >
                              Rule Metadata Properties
                            </summary>
                            <div
                              style={{
                                marginTop: "12px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  gap: "8px",
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "12px",
                                    width: "100px",
                                    color: "var(--muted)",
                                    fontWeight: 500,
                                  }}
                                >
                                  Path
                                </span>
                                <input
                                  type="text"
                                  value={editRulePath}
                                  onChange={(e) =>
                                    setEditRulePath(e.target.value)
                                  }
                                  style={{
                                    flex: 1,
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    background: "var(--bg)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "4px",
                                    color: "var(--fg)",
                                  }}
                                />
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "8px",
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "12px",
                                    width: "100px",
                                    color: "var(--muted)",
                                    fontWeight: 500,
                                  }}
                                >
                                  Category
                                </span>
                                <input
                                  type="text"
                                  value={editRuleCategory}
                                  onChange={(e) =>
                                    setEditRuleCategory(e.target.value)
                                  }
                                  style={{
                                    flex: 1,
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    background: "var(--bg)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "4px",
                                    color: "var(--fg)",
                                  }}
                                />
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "8px",
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "12px",
                                    width: "100px",
                                    color: "var(--muted)",
                                    fontWeight: 500,
                                  }}
                                >
                                  Source
                                </span>
                                <input
                                  type="text"
                                  value={editRuleSource}
                                  onChange={(e) =>
                                    setEditRuleSource(e.target.value)
                                  }
                                  style={{
                                    flex: 1,
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    background: "var(--bg)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "4px",
                                    color: "var(--fg)",
                                  }}
                                />
                              </div>
                            </div>
                          </details>

                          {/* Markdown Editor */}
                          <div style={{ marginBottom: "20px" }}>
                            <Suspense
                              fallback={
                                <div
                                  style={{
                                    width: "100%",
                                    height: "400px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    border: "1px solid var(--border)",
                                    borderRadius: "6px",
                                    background: "var(--surface)",
                                    color: "var(--muted)",
                                    fontSize: "13px",
                                  }}
                                >
                                  Loading markdown editor...
                                </div>
                              }
                            >
                              <MarkdownEditor
                                value={editRuleContent}
                                onChange={setEditRuleContent}
                                notes={[]}
                                activeNotePath={currentRule?.path || ""}
                              />
                            </Suspense>
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--muted)",
                              fontStyle: "italic",
                              borderTop: "1px solid var(--border)",
                              paddingTop: "8px",
                            }}
                          >
                            ● Auto-saving in background...
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div
                            className="doc-title"
                            style={{ wordBreak: "break-word" }}
                          >
                            {currentRule?.title}
                          </div>
                          <div className="doc-meta">
                            <span className="doc-meta-tag">RULEBOOK</span>
                            <span className="doc-meta-tag">
                              {currentRule?.path}
                            </span>
                            <span
                              style={{
                                fontSize: "12px",
                                color: "var(--muted)",
                              }}
                            >
                              {currentRule?.source}
                            </span>
                          </div>
                          <div className="doc-body">
                            {currentRule
                              ? renderMarkdown(currentRule.content)
                              : null}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW: AI */}
            {activeView === "ai" && (
              <div
                className="view-container"
                data-od-id="ai-view"
                style={{ padding: 0, overflow: "hidden" }}
              >
                <div style={{ display: "flex", width: "100%", height: "100%" }}>
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "20px 24px",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <span className="panel-title">Campaign Architect</span>
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--muted)",
                          marginTop: 4,
                        }}
                      >
                        Ask the Architect for plot suggestions, NPC development,
                        or worldbuilding ideas.
                      </div>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: "20px 24px",
                      }}
                    >
                      {currentChatMessages.map((msg, i) => (
                        <div key={i} className={`chat-bubble ${msg.role}`}>
                          {msg.text}
                        </div>
                      ))}
                    </div>
                    <div
                      style={{
                        padding: "12px 24px",
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        gap: 8,
                      }}
                    >
                      <input
                        style={{
                          flex: 1,
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          padding: "8px 12px",
                          fontFamily: "var(--font-body)",
                          fontSize: 13,
                          outline: "none",
                          borderRadius: 4,
                          color: "var(--fg)",
                        }}
                        placeholder="Ask the Campaign Architect..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSendChatMessage();
                        }}
                        aria-label="Ask the Campaign Architect"
                      />
                      <button
                        className="btn btn-primary"
                        onClick={handleSendChatMessage}
                        data-od-id="btn-ai-send"
                      >
                        <Send size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW: TRASH */}
            {activeView === "trash" && (
              <div
                className="view-container"
                data-od-id="trash-view"
                style={{ padding: "40px 32px", overflowY: "auto" }}
              >
                <div
                  style={{ maxWidth: "800px", margin: "0 auto", width: "100%" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "24px",
                      paddingBottom: "16px",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <Trash2 size={24} style={{ color: "var(--accent)" }} />
                      <div>
                        <h2
                          style={{
                            fontSize: "20px",
                            fontWeight: 700,
                            margin: 0,
                            fontFamily: "var(--font-display)",
                          }}
                        >
                          Vault & Rulebook Trash
                        </h2>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--muted)",
                            margin: "4px 0 0 0",
                          }}
                        >
                          Restore or permanently delete trashed notes and rule
                          pages.
                        </p>
                      </div>
                    </div>

                    {(trashedNotes.length > 0 || trashedRules.length > 0) && (
                      <button
                        type="button"
                        onClick={handleEmptyTrash}
                        style={{
                          background: "var(--danger)",
                          color: "#fff",
                          border: "none",
                          padding: "6px 14px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <Trash2 size={14} /> Empty Trash
                      </button>
                    )}
                  </div>

                  {trashedNotes.length === 0 && trashedRules.length === 0 ? (
                    <div
                      style={{
                        padding: "60px 20px",
                        textAlign: "center",
                        color: "var(--muted)",
                        background: "var(--surface)",
                        borderRadius: "8px",
                        border: "1px dashed var(--border)",
                      }}
                    >
                      <Trash2
                        size={40}
                        style={{ margin: "0 auto 12px auto", opacity: 0.4 }}
                      />
                      <h3
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          margin: "0 0 6px 0",
                        }}
                      >
                        Trash is Empty
                      </h3>
                      <p style={{ fontSize: "12px", margin: 0 }}>
                        Any deleted campaign notes or rulebook pages will appear
                        here for easy recovery.
                      </p>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "20px",
                      }}
                    >
                      {trashedNotes.length > 0 && (
                        <div>
                          <h3
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              color: "var(--accent)",
                              marginBottom: "10px",
                            }}
                          >
                            Trashed Vault Notes ({trashedNotes.length})
                          </h3>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }}
                          >
                            {trashedNotes.map((note) => (
                              <div
                                key={note.id}
                                style={{
                                  background: "var(--surface)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "6px",
                                  padding: "12px 16px",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <div>
                                  <div
                                    style={{
                                      fontSize: "13px",
                                      fontWeight: 600,
                                      color: "var(--fg)",
                                    }}
                                  >
                                    {note.title}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--muted)",
                                      marginTop: "2px",
                                    }}
                                  >
                                    Path: <code>{note.path}</code>
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: "8px" }}>
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreNote(note.path)}
                                    style={{
                                      background: "var(--bg)",
                                      border: "1px solid var(--border)",
                                      color: "var(--fg)",
                                      padding: "4px 10px",
                                      borderRadius: "4px",
                                      fontSize: "11px",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                  >
                                    <RotateCcw size={12} /> Restore
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteTrashedNote(note.path)
                                    }
                                    style={{
                                      background: "transparent",
                                      border: "1px solid var(--border)",
                                      color: "var(--danger)",
                                      padding: "4px 10px",
                                      borderRadius: "4px",
                                      fontSize: "11px",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                  >
                                    Delete Permanently
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {trashedRules.length > 0 && (
                        <div>
                          <h3
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              color: "var(--accent)",
                              marginBottom: "10px",
                            }}
                          >
                            Trashed Rulebook Pages ({trashedRules.length})
                          </h3>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }}
                          >
                            {trashedRules.map((rule) => (
                              <div
                                key={rule.id}
                                style={{
                                  background: "var(--surface)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "6px",
                                  padding: "12px 16px",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <div>
                                  <div
                                    style={{
                                      fontSize: "13px",
                                      fontWeight: 600,
                                      color: "var(--fg)",
                                    }}
                                  >
                                    {rule.title}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--muted)",
                                      marginTop: "2px",
                                    }}
                                  >
                                    Category: {rule.category} | Path:{" "}
                                    <code>{rule.path}</code>
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: "8px" }}>
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreRule(rule.id)}
                                    style={{
                                      background: "var(--bg)",
                                      border: "1px solid var(--border)",
                                      color: "var(--fg)",
                                      padding: "4px 10px",
                                      borderRadius: "4px",
                                      fontSize: "11px",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                  >
                                    <RotateCcw size={12} /> Restore
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTrashedRules((prev) =>
                                        prev.filter((r) => r.id !== rule.id),
                                      );
                                      invoke("delete_rule", {
                                        ruleId: rule.id,
                                      }).catch((err) =>
                                        console.error(
                                          "Failed to permanently delete rule:",
                                          err,
                                        ),
                                      );
                                    }}
                                    style={{
                                      background: "transparent",
                                      border: "1px solid var(--border)",
                                      color: "var(--danger)",
                                      padding: "4px 10px",
                                      borderRadius: "4px",
                                      fontSize: "11px",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                  >
                                    Delete Permanently
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* VIEW: SETTINGS */}
            {activeView === "settings" && (
              <form
                className="view-container"
                data-od-id="settings-view"
                onSubmit={handleSaveSettings}
                style={{ padding: "40px 32px", overflowY: "auto" }}
              >
                <div
                  className="settings-list"
                  style={{
                    width: "100%",
                    maxWidth: "720px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "28px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <h2
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 24,
                        letterSpacing: "-0.01em",
                        fontWeight: 600,
                      }}
                    >
                      Settings
                    </h2>
                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={!isDirty || !isValid}
                    >
                      Save Configuration
                    </button>
                  </div>

                  {/* Section: General Workspace */}
                  <div
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      padding: "20px",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: "12px",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--accent)",
                        marginBottom: "16px",
                        fontWeight: 600,
                      }}
                    >
                      Workspace Configuration
                    </h3>

                    <div
                      className="settings-item"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderBottom: "1px solid var(--border)",
                        paddingBottom: "12px",
                        marginBottom: "12px",
                      }}
                    >
                      <div>
                        <div
                          className="settings-label"
                          style={{ fontSize: "13px", fontWeight: 500 }}
                        >
                          Active Campaign Directory
                        </div>
                        <div
                          className="settings-desc"
                          style={{ fontSize: "11px", color: "var(--muted)" }}
                        >
                          Where markdown files are monitored and stored
                        </div>
                      </div>
                      <input
                        type="text"
                        value={vaultPath || "Loading campaign vault path..."}
                        readOnly
                        style={{
                          width: 300,
                          padding: "6px 10px",
                          fontSize: 11,
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          color: "var(--muted)",
                        }}
                      />
                    </div>

                    <div
                      className="settings-item"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div
                          className="settings-label"
                          style={{ fontSize: "13px", fontWeight: 500 }}
                        >
                          Installed Plugins
                        </div>
                        <div
                          className="settings-desc"
                          style={{ fontSize: "11px", color: "var(--muted)" }}
                        >
                          {pluginsList.length} third-party extensions active
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {pluginsList.map((p) => (
                          <span
                            key={p.id}
                            className={`plugin-badge ${p.active ? "active" : ""}`}
                            style={{
                              fontSize: "10px",
                              padding: "2px 6px",
                              border: "1px solid var(--border)",
                              borderRadius: "3px",
                            }}
                          >
                            {p.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Consolidated Provider Integrations Panel */}
                  <div
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "24px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "20px",
                    }}
                  >
                    <div
                      style={{
                        borderBottom: "1px solid var(--border)",
                        paddingBottom: "12px",
                      }}
                    >
                      <h3
                        style={{
                          fontSize: "14px",
                          color: "var(--fg)",
                          fontWeight: 600,
                          margin: 0,
                        }}
                      >
                        Model & Service Integrations
                      </h3>
                      <p
                        style={{
                          fontSize: "11px",
                          color: "var(--muted)",
                          margin: "4px 0 0 0",
                        }}
                      >
                        Configure your local and cloud AI providers for writing,
                        search, art, and voice.
                      </p>
                    </div>

                    {/* Type Tabs */}
                    <div>
                      <label
                        style={{
                          fontSize: "10px",
                          color: "var(--muted)",
                          fontWeight: 600,
                          display: "block",
                          marginBottom: "8px",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Category
                      </label>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "6px",
                        }}
                      >
                        {[
                          { id: "llm", name: "Language Model", icon: "🧠" },
                          { id: "embed", name: "Embedding", icon: "📄" },
                          { id: "image", name: "Image Gen", icon: "🖼️" },
                          { id: "tts", name: "Text-to-Speech", icon: "🗣️" },
                          { id: "stt", name: "Speech-to-Text", icon: "🎙️" },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            className="btn btn-sm"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "8px 12px",
                              borderRadius: "6px",
                              background:
                                activeConfigTab === tab.id
                                  ? "var(--accent)"
                                  : "var(--bg)",
                              border:
                                activeConfigTab === tab.id
                                  ? "1px solid var(--accent)"
                                  : "1px solid var(--border)",
                              color:
                                activeConfigTab === tab.id
                                  ? "#fff"
                                  : "var(--fg)",
                              cursor: "pointer",
                              fontWeight: 500,
                              fontSize: "11px",
                            }}
                            onClick={() => {
                              setActiveConfigTab(
                                tab.id as
                                  | "llm"
                                  | "embed"
                                  | "image"
                                  | "tts"
                                  | "stt",
                              );
                              setTestConnectionResult(null);
                              setTestConnectionError(null);
                            }}
                          >
                            <span>{tab.icon}</span> {tab.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Integration Cards Grid */}
                    <div>
                      <label
                        style={{
                          fontSize: "10px",
                          color: "var(--muted)",
                          fontWeight: 600,
                          display: "block",
                          marginBottom: "8px",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Integration Provider
                      </label>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fill, minmax(160px, 1fr))",
                          gap: "10px",
                        }}
                      >
                        {(activeConfigTab === "llm"
                          ? [
                              { id: "openai", name: "OpenAI", logo: "🟢" },
                              {
                                id: "anthropic",
                                name: "Anthropic Claude",
                                logo: "🟤",
                              },
                              {
                                id: "openai-compatible",
                                name: "OpenAI API Compatible",
                                logo: "⚙️",
                              },
                              {
                                id: "aws-bedrock",
                                name: "AWS Bedrock",
                                logo: "🟠",
                              },
                              { id: "ollama", name: "Ollama", logo: "🦙" },
                              {
                                id: "openrouter",
                                name: "OpenRouter",
                                logo: "🌀",
                              },
                              {
                                id: "gemini",
                                name: "Google Gemini",
                                logo: "🔵",
                              },
                              {
                                id: "ollama-cloud",
                                name: "Ollama Cloud",
                                logo: "☁️",
                              },
                              {
                                id: "copilot",
                                name: "GitHub Copilot",
                                logo: "🤖",
                              },
                              { id: "z-ai", name: "z.ai", logo: "⚡" },
                              { id: "kilo", name: "Kilo", logo: "⚖️" },
                              {
                                id: "huggingface",
                                name: "Hugging Face",
                                logo: "🤗",
                              },
                            ]
                          : activeConfigTab === "embed"
                            ? [
                                {
                                  id: "local",
                                  name: "Local ONNX (all-MiniLM)",
                                  logo: "💻",
                                },
                                { id: "openai", name: "OpenAI", logo: "🟢" },
                                {
                                  id: "gemini",
                                  name: "Google Gemini",
                                  logo: "🔵",
                                },
                                { id: "z-ai", name: "z.ai", logo: "⚡" },
                                {
                                  id: "huggingface",
                                  name: "Hugging Face",
                                  logo: "🤗",
                                },
                              ]
                            : activeConfigTab === "image"
                              ? [
                                  {
                                    id: "local",
                                    name: "Local ComfyUI",
                                    logo: "💻",
                                  },
                                  {
                                    id: "openai",
                                    name: "OpenAI DALL-E",
                                    logo: "🟢",
                                  },
                                  {
                                    id: "stability",
                                    name: "Stability AI API",
                                    logo: "🎨",
                                  },
                                  { id: "z-ai", name: "z.ai", logo: "⚡" },
                                  {
                                    id: "huggingface",
                                    name: "Hugging Face",
                                    logo: "🤗",
                                  },
                                ]
                              : activeConfigTab === "tts"
                                ? [
                                    {
                                      id: "local",
                                      name: "Local Native TTS",
                                      logo: "💻",
                                    },
                                    {
                                      id: "openai",
                                      name: "OpenAI TTS",
                                      logo: "🟢",
                                    },
                                    {
                                      id: "elevenlabs",
                                      name: "ElevenLabs API",
                                      logo: "🗣️",
                                    },
                                    { id: "z-ai", name: "z.ai", logo: "⚡" },
                                    {
                                      id: "huggingface",
                                      name: "Hugging Face",
                                      logo: "🤗",
                                    },
                                  ]
                                : [
                                    {
                                      id: "local",
                                      name: "Local Whisper",
                                      logo: "💻",
                                    },
                                    {
                                      id: "openai",
                                      name: "OpenAI Whisper",
                                      logo: "🟢",
                                    },
                                    { id: "z-ai", name: "z.ai", logo: "⚡" },
                                    {
                                      id: "huggingface",
                                      name: "Hugging Face",
                                      logo: "🤗",
                                    },
                                  ]
                        ).map((item) => {
                          const isSelected =
                            activeConfigTab === "llm"
                              ? llmProvider === item.id
                              : activeConfigTab === "embed"
                                ? embedProvider === item.id
                                : activeConfigTab === "image"
                                  ? imageProvider === item.id
                                  : activeConfigTab === "tts"
                                    ? ttsProvider === item.id
                                    : sttProvider === item.id;
                          return (
                            <div
                              key={item.id}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "14px 10px",
                                borderRadius: "8px",
                                background: isSelected
                                  ? "oklch(from var(--accent) l c h / 0.08)"
                                  : "var(--bg)",
                                border: isSelected
                                  ? "2px solid var(--accent)"
                                  : "1px solid var(--border)",
                                cursor: "pointer",
                                transition: "all 0.15s ease-in-out",
                                textAlign: "center",
                              }}
                              onClick={() => {
                                onProviderSelect(activeConfigTab, item.id);
                                setTestConnectionResult(null);
                                setTestConnectionError(null);
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "20px",
                                  marginBottom: "6px",
                                }}
                              >
                                {item.logo}
                              </span>
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 500,
                                  color: "var(--fg)",
                                }}
                              >
                                {item.name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Embedding Dimension Warning */}
                    {activeConfigTab === "embed" && (
                      <div
                        style={{
                          background: "oklch(65% 0.12 85 / 0.08)",
                          border: "1px solid var(--warn)",
                          color: "var(--warn)",
                          padding: "10px 12px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          lineHeight: "1.4",
                        }}
                      >
                        <strong>DIMENSION COMPATIBILITY CAVEAT:</strong>{" "}
                        Modifying your embedding provider changes the dimension
                        length of generated vectors. After saving, run{" "}
                        <strong>Reindex</strong> on your vault to reindex all
                        notes.
                      </div>
                    )}

                    {/* Active Configuration Details */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        padding: "16px",
                      }}
                    >
                      <div style={{ display: "flex", gap: "12px" }}>
                        {activeConfigTab !== "stt" && (
                          <div style={{ flex: 1 }}>
                            <label
                              style={{
                                fontSize: "11px",
                                color: "var(--muted)",
                                fontWeight: 500,
                                display: "block",
                                marginBottom: "4px",
                              }}
                            >
                              {activeConfigTab === "tts"
                                ? "Voice Name / ID"
                                : "Model Name"}
                            </label>
                            <input
                              type="text"
                              {...register(
                                activeConfigTab === "llm"
                                  ? "llm_model"
                                  : activeConfigTab === "embed"
                                    ? "embed_model"
                                    : activeConfigTab === "image"
                                      ? "image_model"
                                      : "tts_voice",
                              )}
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                fontSize: "12px",
                                background: "var(--surface)",
                                border: "1px solid var(--border)",
                                borderRadius: 4,
                                color: "var(--fg)",
                              }}
                              placeholder={
                                activeConfigTab === "llm"
                                  ? "e.g. llama3:8b"
                                  : activeConfigTab === "embed"
                                    ? "e.g. text-embedding-3-small"
                                    : activeConfigTab === "image"
                                      ? "e.g. dall-e-3"
                                      : "e.g. alloy"
                              }
                            />
                            {errors[
                              activeConfigTab === "llm"
                                ? "llm_model"
                                : activeConfigTab === "embed"
                                  ? "embed_model"
                                  : activeConfigTab === "image"
                                    ? "image_model"
                                    : "tts_voice"
                            ] && (
                              <span
                                style={{
                                  fontSize: "11px",
                                  color: "var(--danger)",
                                  marginTop: "4px",
                                  display: "block",
                                }}
                              >
                                {
                                  errors[
                                    activeConfigTab === "llm"
                                      ? "llm_model"
                                      : activeConfigTab === "embed"
                                        ? "embed_model"
                                        : activeConfigTab === "image"
                                          ? "image_model"
                                          : "tts_voice"
                                  ]?.message
                                }
                              </span>
                            )}
                          </div>
                        )}

                        {activeConfigTab !== "tts" &&
                          activeConfigTab !== "stt" && (
                            <div style={{ flex: 2 }}>
                              <label
                                style={{
                                  fontSize: "11px",
                                  color: "var(--muted)",
                                  fontWeight: 500,
                                  display: "block",
                                  marginBottom: "4px",
                                }}
                              >
                                API Endpoint URL
                              </label>
                              <input
                                type="text"
                                {...register(
                                  activeConfigTab === "llm"
                                    ? "llm_base_url"
                                    : activeConfigTab === "embed"
                                      ? "embed_base_url"
                                      : "image_base_url",
                                )}
                                style={{
                                  width: "100%",
                                  padding: "8px 10px",
                                  fontSize: "12px",
                                  background: "var(--surface)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 4,
                                  color: "var(--fg)",
                                }}
                                placeholder="Provider base URL override if using proxy/local server"
                              />
                              {errors[
                                activeConfigTab === "llm"
                                  ? "llm_base_url"
                                  : activeConfigTab === "embed"
                                    ? "embed_base_url"
                                    : "image_base_url"
                              ] && (
                                <span
                                  style={{
                                    fontSize: "11px",
                                    color: "var(--danger)",
                                    marginTop: "4px",
                                    display: "block",
                                  }}
                                >
                                  {
                                    errors[
                                      activeConfigTab === "llm"
                                        ? "llm_base_url"
                                        : activeConfigTab === "embed"
                                          ? "embed_base_url"
                                          : "image_base_url"
                                    ]?.message
                                  }
                                </span>
                              )}
                            </div>
                          )}
                      </div>

                      <div>
                        <label
                          style={{
                            fontSize: "11px",
                            color: "var(--muted)",
                            fontWeight: 500,
                            display: "block",
                            marginBottom: "4px",
                          }}
                        >
                          API Key (Cloud Only)
                        </label>
                        <input
                          type="password"
                          {...register(
                            activeConfigTab === "llm"
                              ? "llm_api_key"
                              : activeConfigTab === "embed"
                                ? "embed_api_key"
                                : activeConfigTab === "image"
                                  ? "image_api_key"
                                  : activeConfigTab === "tts"
                                    ? "tts_api_key"
                                    : "stt_api_key",
                          )}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            fontSize: "12px",
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            color: "var(--fg)",
                          }}
                          placeholder="Enter API Key for cloud API verification"
                        />
                      </div>

                      {/* Connection Test Action */}
                      <div
                        style={{
                          borderTop: "1px solid var(--border)",
                          paddingTop: "12px",
                          marginTop: "4px",
                        }}
                      >
                        <button
                          className="btn"
                          style={{
                            width: "100%",
                            padding: "8px",
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: 500,
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: "8px",
                          }}
                          onClick={handleTestConnection}
                          disabled={isTestingConnection}
                        >
                          {isTestingConnection
                            ? "🔄 Testing Connection..."
                            : "🔌 Run Connection Test"}
                        </button>

                        {/* Connection Test Output */}
                        {testConnectionError && (
                          <div
                            style={{
                              marginTop: "10px",
                              padding: "8px 12px",
                              background: "oklch(65% 0.12 20 / 0.08)",
                              border: "1px solid var(--danger)",
                              color: "var(--danger)",
                              borderRadius: "4px",
                              fontSize: "11px",
                              lineHeight: "1.4",
                            }}
                          >
                            ❌ <strong>Connection Failed:</strong>{" "}
                            {testConnectionError}
                          </div>
                        )}

                        {testConnectionResult && (
                          <div style={{ marginTop: "10px" }}>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--success)",
                                fontWeight: 600,
                                marginBottom: "6px",
                              }}
                            >
                              ✅ Connected Successfully! Available Models (Click
                              to select):
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "6px",
                              }}
                            >
                              {testConnectionResult.length === 0 ? (
                                <span
                                  style={{
                                    fontSize: "11px",
                                    color: "var(--muted)",
                                  }}
                                >
                                  No models returned.
                                </span>
                              ) : (
                                testConnectionResult.map((modelName) => (
                                  <span
                                    key={modelName}
                                    onClick={() => {
                                      const field =
                                        activeConfigTab === "llm"
                                          ? "llm_model"
                                          : activeConfigTab === "embed"
                                            ? "embed_model"
                                            : activeConfigTab === "image"
                                              ? "image_model"
                                              : "tts_voice";
                                      setValue(field, modelName, {
                                        shouldDirty: true,
                                      });
                                    }}
                                    style={{
                                      fontSize: "10px",
                                      padding: "3px 8px",
                                      background: "var(--surface)",
                                      border: "1px solid var(--border)",
                                      borderRadius: "12px",
                                      cursor: "pointer",
                                      color: "var(--fg)",
                                      transition: "all 0.1s",
                                    }}
                                    onMouseOver={(e) =>
                                      (e.currentTarget.style.border =
                                        "1px solid var(--accent)")
                                    }
                                    onMouseOut={(e) =>
                                      (e.currentTarget.style.border =
                                        "1px solid var(--border)")
                                    }
                                  >
                                    {modelName}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* Right Area: Right Sidebar OR Settings Info Panels */}
          {activeView !== "settings" ? (
            <>
              {/* 1. Collapsed Right Ribbon (Only renders when closed) */}
              {!isRightDrawerOpen && (
                <div
                  style={{
                    width: "40px",
                    borderLeft: "1px solid var(--border)",
                    background: "var(--surface)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    paddingTop: "16px",
                    gap: "12px",
                    flexShrink: 0,
                    height: "100%",
                  }}
                >
                  <button
                    onClick={() => {
                      setRightDrawerTab("scratchpad");
                      setIsRightDrawerOpen(true);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--muted)",
                      padding: "8px",
                      cursor: "pointer",
                    }}
                    title="Open Scratchpad"
                  >
                    <PenLine size={18} />
                  </button>
                  {activeView !== "ai" && (
                    <button
                      onClick={() => {
                        setRightDrawerTab("ai");
                        setIsRightDrawerOpen(true);
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--muted)",
                        padding: "8px",
                        cursor: "pointer",
                      }}
                      title="Open Campaign Architect"
                    >
                      <Brain size={18} />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setRightDrawerTab("asset");
                      setIsRightDrawerOpen(true);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--muted)",
                      padding: "8px",
                      cursor: "pointer",
                    }}
                    title="Open Asset Generator"
                  >
                    <Layers size={18} />
                  </button>
                  <button
                    onClick={() => {
                      setRightDrawerTab("backlinks");
                      setIsRightDrawerOpen(true);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--muted)",
                      padding: "8px",
                      cursor: "pointer",
                    }}
                    title="Open Backlinks"
                  >
                    <Link2 size={18} />
                  </button>
                </div>
              )}

              {/* 2. Expanded Right Sidebar Container */}
              {isRightDrawerOpen && (
                <div
                  style={{
                    width: "320px",
                    borderLeft: "1px solid var(--border)",
                    background: "var(--surface)",
                    display: "flex",
                    flexDirection: "column",
                    flexShrink: 0,
                    height: "100%",
                    overflowY: "hidden",
                  }}
                >
                  {/* Top Toolbar Tabs */}
                  <div
                    style={{
                      display: "flex",
                      borderBottom: "1px solid var(--border)",
                      background: "var(--surface)",
                      alignItems: "center",
                      padding: "4px 8px",
                      gap: "2px",
                      flexShrink: 0,
                    }}
                  >
                    <button
                      onClick={() => setRightDrawerTab("scratchpad")}
                      style={{
                        background:
                          rightDrawerTab === "scratchpad"
                            ? "var(--border)"
                            : "transparent",
                        border: "none",
                        color:
                          rightDrawerTab === "scratchpad"
                            ? "var(--accent)"
                            : "var(--muted)",
                        padding: "6px 8px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "11px",
                        fontWeight: 600,
                      }}
                    >
                      Scratch
                    </button>
                    {activeView !== "ai" && (
                      <button
                        onClick={() => setRightDrawerTab("ai")}
                        style={{
                          background:
                            rightDrawerTab === "ai"
                              ? "var(--border)"
                              : "transparent",
                          border: "none",
                          color:
                            rightDrawerTab === "ai"
                              ? "var(--accent)"
                              : "var(--muted)",
                          padding: "6px 8px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}
                      >
                        Architect
                      </button>
                    )}
                    <button
                      onClick={() => setRightDrawerTab("asset")}
                      style={{
                        background:
                          rightDrawerTab === "asset"
                            ? "var(--border)"
                            : "transparent",
                        border: "none",
                        color:
                          rightDrawerTab === "asset"
                            ? "var(--accent)"
                            : "var(--muted)",
                        padding: "6px 8px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "11px",
                        fontWeight: 600,
                      }}
                    >
                      Image
                    </button>
                    <button
                      onClick={() => setRightDrawerTab("voice")}
                      style={{
                        background:
                          rightDrawerTab === "voice"
                            ? "var(--border)"
                            : "transparent",
                        border: "none",
                        color:
                          rightDrawerTab === "voice"
                            ? "var(--accent)"
                            : "var(--muted)",
                        padding: "6px 8px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "11px",
                        fontWeight: 600,
                      }}
                    >
                      Voice
                    </button>
                    <button
                      onClick={() => setRightDrawerTab("backlinks")}
                      style={{
                        background:
                          rightDrawerTab === "backlinks"
                            ? "var(--border)"
                            : "transparent",
                        border: "none",
                        color:
                          rightDrawerTab === "backlinks"
                            ? "var(--accent)"
                            : "var(--muted)",
                        padding: "6px 8px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "11px",
                        fontWeight: 600,
                      }}
                    >
                      Links
                    </button>
                    <button
                      onClick={() => setIsRightDrawerOpen(false)}
                      style={{
                        marginLeft: "auto",
                        background: "transparent",
                        border: "none",
                        color: "var(--muted)",
                        cursor: "pointer",
                        fontSize: "14px",
                        fontWeight: "bold",
                        padding: "2px 8px",
                      }}
                      title="Collapse Sidebar"
                    >
                      »
                    </button>
                  </div>

                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {/* TAB: SCRATCHPAD */}
                    {rightDrawerTab === "scratchpad" && (
                      <div
                        style={{
                          padding: "16px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "16px",
                          height: "100%",
                          overflowY: "auto",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "var(--accent)",
                          }}
                        >
                          Secret GM Scratchpad
                        </span>

                        <textarea
                          value={scratchpadText}
                          onChange={(e) => setScratchpadText(e.target.value)}
                          placeholder="Jot down quick combat initiative, secret notes, or draft content..."
                          style={{
                            minHeight: "150px",
                            width: "100%",
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            borderRadius: "4px",
                            color: "var(--fg)",
                            fontFamily: "var(--font-body)",
                            fontSize: "13px",
                            padding: "8px",
                            resize: "vertical",
                            outline: "none",
                          }}
                        />

                        {/* Dice Roller */}
                        <div
                          style={{
                            borderTop: "1px solid var(--border)",
                            paddingTop: "12px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              color: "var(--muted)",
                              display: "block",
                              marginBottom: "8px",
                            }}
                          >
                            Dice Roller
                          </span>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(4, 1fr)",
                              gap: "6px",
                            }}
                          >
                            {[4, 6, 8, 20].map((sides) => (
                              <button
                                key={sides}
                                className="dice-btn"
                                style={{
                                  padding: "6px 0",
                                  fontSize: "12px",
                                  cursor: "pointer",
                                  background: "var(--surface)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "4px",
                                  color: "var(--fg)",
                                }}
                                onClick={() => rollDice(sides)}
                                type="button"
                              >
                                d{sides}
                              </button>
                            ))}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              marginTop: "8px",
                            }}
                          >
                            <span
                              style={{ fontSize: 11, color: "var(--muted)" }}
                            >
                              Mod:
                            </span>
                            <input
                              type="number"
                              value={rollModifier}
                              onChange={(e) =>
                                setRollModifier(parseInt(e.target.value) || 0)
                              }
                              style={{
                                width: "50px",
                                padding: "4px",
                                background: "var(--bg)",
                                border: "1px solid var(--border)",
                                borderRadius: "4px",
                                color: "var(--fg)",
                                fontSize: "12px",
                              }}
                            />
                          </div>
                          {diceHistory.length > 0 && (
                            <div
                              style={{
                                marginTop: "8px",
                                maxHeight: "80px",
                                overflowY: "auto",
                                background: "var(--bg)",
                                borderRadius: "4px",
                                padding: "6px",
                                fontSize: "11px",
                                color: "var(--accent)",
                              }}
                            >
                              {diceHistory.slice(0, 5).map((entry, i) => (
                                <div
                                  key={i}
                                  style={{
                                    borderBottom:
                                      i < diceHistory.slice(0, 5).length - 1
                                        ? "1px solid var(--border)"
                                        : "none",
                                    padding: "2px 0",
                                  }}
                                >
                                  {entry}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Plugins */}
                        <div
                          style={{
                            borderTop: "1px solid var(--border)",
                            paddingTop: "12px",
                            marginBottom: "16px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              color: "var(--muted)",
                              display: "block",
                              marginBottom: "8px",
                            }}
                          >
                            GM Plugins
                          </span>
                          {pluginsList.length > 0 ? (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                              }}
                            >
                              {pluginsList.map((plugin) => {
                                if (
                                  plugin.id === "character-roller" &&
                                  plugin.active
                                ) {
                                  return (
                                    <button
                                      key={plugin.id}
                                      className="btn btn-sm"
                                      style={{
                                        width: "100%",
                                        padding: "6px",
                                        fontSize: "11px",
                                        cursor: "pointer",
                                      }}
                                      onClick={handleRollCharacterSheet}
                                      type="button"
                                    >
                                      Roll Ability Sheet
                                    </button>
                                  );
                                }
                                if (
                                  plugin.id === "threat-evaluator" &&
                                  plugin.active
                                ) {
                                  return (
                                    <button
                                      key={plugin.id}
                                      className="btn btn-sm"
                                      style={{
                                        width: "100%",
                                        padding: "6px",
                                        fontSize: "11px",
                                        cursor: "pointer",
                                      }}
                                      onClick={handleEvaluateEncounterThreat}
                                      type="button"
                                    >
                                      Evaluate Threat
                                    </button>
                                  );
                                }
                                return null;
                              })}
                            </div>
                          ) : (
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--muted)",
                                fontStyle: "italic",
                              }}
                            >
                              No active plugins
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* TAB: AI ASSISTANT */}
                    {rightDrawerTab === "ai" && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          height: "100%",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            padding: "16px",
                            borderBottom: "1px solid var(--border)",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              color: "var(--accent)",
                            }}
                          >
                            Campaign Architect
                          </span>

                          {/* AI Control Actions */}
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                              marginTop: "8px",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              className="btn btn-sm"
                              style={{
                                padding: "4px 8px",
                                fontSize: "10px",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              onClick={resetCurrentVaultSession}
                              disabled={!vaultPath}
                              type="button"
                            >
                              <RotateCcw size={10} /> Reset Memory
                            </button>
                            <button
                              className="btn btn-sm"
                              style={{
                                padding: "4px 8px",
                                fontSize: "10px",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              onClick={exportCurrentVaultSession}
                              disabled={!vaultPath}
                              type="button"
                            >
                              <Download size={10} /> Export
                            </button>
                          </div>

                          {/* Clone Selector */}
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                              marginTop: "8px",
                              alignItems: "center",
                            }}
                          >
                            <select
                              value={sessionCloneTargetVaultPath}
                              onChange={(e) =>
                                setSessionCloneTargetVaultPath(e.target.value)
                              }
                              style={{
                                flex: 1,
                                background: "var(--bg)",
                                border: "1px solid var(--border)",
                                padding: "4px 6px",
                                fontSize: 10,
                                borderRadius: 4,
                                color: "var(--fg)",
                                cursor: "pointer",
                              }}
                            >
                              <option value="">Clone to vault...</option>
                              {vaults
                                .filter((item) => item.path !== vaultPath)
                                .map((item) => (
                                  <option key={item.path} value={item.path}>
                                    {item.name}
                                  </option>
                                ))}
                            </select>
                            <button
                              className="btn btn-sm"
                              style={{
                                padding: "4px 8px",
                                fontSize: "10px",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              onClick={cloneCurrentVaultSession}
                              disabled={
                                !vaultPath || !sessionCloneTargetVaultPath
                              }
                              type="button"
                            >
                              <Copy size={10} /> Clone
                            </button>
                          </div>
                        </div>

                        <div
                          style={{
                            flex: 1,
                            overflowY: "auto",
                            padding: "16px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          {currentChatMessages.map((msg, i) => (
                            <div
                              key={i}
                              className={`chat-bubble ${msg.role}`}
                              style={{ fontSize: "12px", padding: "8px 12px" }}
                            >
                              {msg.text}
                            </div>
                          ))}
                        </div>
                        <div
                          style={{
                            padding: "12px",
                            borderTop: "1px solid var(--border)",
                            display: "flex",
                            gap: "6px",
                          }}
                        >
                          <input
                            style={{
                              flex: 1,
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              padding: "6px 8px",
                              fontFamily: "var(--font-body)",
                              fontSize: "12px",
                              outline: "none",
                              borderRadius: 4,
                              color: "var(--fg)",
                            }}
                            placeholder="Ask Architect..."
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSendChatMessage();
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* TAB: ASSET GENERATOR */}
                    {rightDrawerTab === "asset" && (
                      <div
                        style={{
                          padding: "16px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "var(--accent)",
                          }}
                        >
                          Local Stable Diffusion
                        </span>

                        <div className="field-group">
                          <label
                            className="field-label"
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "var(--muted)",
                              display: "block",
                              marginBottom: "4px",
                            }}
                          >
                            Prompt
                          </label>
                          <textarea
                            value={imagePrompt}
                            onChange={(e) => setImagePrompt(e.target.value)}
                            placeholder="A dramatic fantasy landscape, highly detailed..."
                            style={{
                              height: "60px",
                              resize: "none",
                              fontSize: "12px",
                              padding: "6px 8px",
                              width: "100%",
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              borderRadius: 4,
                              color: "var(--fg)",
                              fontFamily: "var(--font-body)",
                            }}
                          />
                        </div>

                        <div className="field-group">
                          <label
                            className="field-label"
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "var(--muted)",
                              display: "block",
                              marginBottom: "4px",
                            }}
                          >
                            Style
                          </label>
                          <select
                            value={imageStyle}
                            onChange={(e) => setImageStyle(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              borderRadius: 4,
                              color: "var(--fg)",
                              fontSize: "12px",
                            }}
                          >
                            <option value="Fantasy Portrait">
                              Fantasy Portrait
                            </option>
                            <option value="Oil Painting">Oil Painting</option>
                            <option value="Ink Sketch">Ink Sketch</option>
                            <option value="Vibrant Concept Art">
                              Vibrant Concept Art
                            </option>
                          </select>
                        </div>

                        <button
                          className="btn btn-sm btn-primary"
                          style={{
                            width: "100%",
                            marginTop: "4px",
                            padding: "8px",
                            cursor: "pointer",
                          }}
                          onClick={handleGenerateImage}
                          disabled={isGeneratingImage}
                          type="button"
                        >
                          {isGeneratingImage
                            ? "Rendering SD..."
                            : "Generate Image"}
                        </button>

                        <div
                          style={{
                            marginTop: "12px",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            padding: "8px",
                            minHeight: "150px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "var(--bg)",
                            overflow: "hidden",
                          }}
                        >
                          {isGeneratingImage ? (
                            <span
                              style={{
                                fontSize: "11px",
                                color: "var(--muted)",
                                textAlign: "center",
                              }}
                            >
                              Rendering via stable-diffusion-onnx...
                            </span>
                          ) : generatedImageUrl ? (
                            <img
                              src={generatedImageUrl}
                              alt="Generated asset"
                              style={{
                                width: "100%",
                                height: "auto",
                                borderRadius: "4px",
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                fontSize: "11px",
                                color: "var(--muted)",
                              }}
                            >
                              No asset rendered
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* TAB: VOICE / TTS */}
                    {rightDrawerTab === "voice" && (
                      <div
                        style={{
                          padding: "16px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                        }}
                      >
                        <span
                          className="panel-title"
                          style={{ marginBottom: 0 }}
                        >
                          Text-to-Speech
                        </span>
                        <textarea
                          style={{
                            width: "100%",
                            minHeight: "80px",
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            borderRadius: "4px",
                            padding: "8px",
                            color: "var(--fg)",
                            fontSize: "12px",
                            fontFamily: "var(--font-body)",
                            resize: "vertical",
                          }}
                          placeholder="Enter text to convert to speech..."
                          value={ttsText}
                          onChange={(e) => setTtsText(e.target.value)}
                        />
                        <div
                          style={{ fontSize: "10px", color: "var(--muted)" }}
                        >
                          Provider: {ttsProvider}
                          {ttsProvider === "local" &&
                            " (not implemented — configure OpenAI or ElevenLabs in Settings)"}
                        </div>
                        <button
                          className="btn btn-sm btn-primary"
                          style={{
                            width: "100%",
                            padding: "8px",
                            cursor: "pointer",
                          }}
                          onClick={handleGenerateSpeech}
                          disabled={isGeneratingSpeech || !ttsText.trim()}
                          type="button"
                        >
                          {isGeneratingSpeech
                            ? "Generating..."
                            : "Generate Speech"}
                        </button>
                        {generatedSpeechUrl && (
                          <div
                            style={{
                              marginTop: "8px",
                              border: "1px solid var(--border)",
                              borderRadius: "6px",
                              padding: "8px",
                              background: "var(--bg)",
                            }}
                          >
                            <audio
                              src={generatedSpeechUrl}
                              controls
                              style={{ width: "100%" }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB: BACKLINKS */}
                    {rightDrawerTab === "backlinks" && (
                      <div
                        style={{
                          padding: "16px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "var(--accent)",
                          }}
                        >
                          Incoming Backlinks
                        </span>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          }}
                        >
                          {backlinks.length === 0 ? (
                            <div
                              style={{
                                fontSize: "12px",
                                color: "var(--muted)",
                                fontStyle: "italic",
                              }}
                            >
                              No incoming links to this note.
                            </div>
                          ) : (
                            backlinks.map((note: any) => (
                              <button
                                key={note.id}
                                className="nav-item"
                                onClick={() => setSelectedNoteId(note.id)}
                                style={{
                                  padding: "6px 8px",
                                  fontSize: "12px",
                                  textAlign: "left",
                                  justifyContent: "flex-start",
                                  cursor: "pointer",
                                }}
                                type="button"
                              >
                                <FileText size={12} /> {note.title}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Settings Right Panel: always open, replaces sidebar! */
            <div
              style={{
                width: "320px",
                borderLeft: "1px solid var(--border)",
                background: "var(--surface)",
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
                height: "100%",
                overflowY: "hidden",
              }}
            >
              {/* Tabs header */}
              <div
                style={{
                  display: "flex",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface)",
                  padding: "4px 8px",
                  gap: "2px",
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  onClick={() => setSettingsTab("build")}
                  style={{
                    background:
                      settingsTab === "build" ? "var(--border)" : "transparent",
                    border: "none",
                    color:
                      settingsTab === "build"
                        ? "var(--accent)"
                        : "var(--muted)",
                    padding: "6px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Build
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab("contributors")}
                  style={{
                    background:
                      settingsTab === "contributors"
                        ? "var(--border)"
                        : "transparent",
                    border: "none",
                    color:
                      settingsTab === "contributors"
                        ? "var(--accent)"
                        : "var(--muted)",
                    padding: "6px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Credits
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab("licenses")}
                  style={{
                    background:
                      settingsTab === "licenses"
                        ? "var(--border)"
                        : "transparent",
                    border: "none",
                    color:
                      settingsTab === "licenses"
                        ? "var(--accent)"
                        : "var(--muted)",
                    padding: "6px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Licenses
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab("profile")}
                  style={{
                    background:
                      settingsTab === "profile"
                        ? "var(--border)"
                        : "transparent",
                    border: "none",
                    color:
                      settingsTab === "profile"
                        ? "var(--accent)"
                        : "var(--muted)",
                    padding: "6px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Profile
                </button>
              </div>

              {/* Contents */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                {settingsTab === "build" && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--accent)",
                      }}
                    >
                      Build & Update Info
                    </span>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--fg)",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: "4px",
                        padding: "8px",
                      }}
                    >
                      <div>
                        <strong>Version:</strong> v0.1.0-alpha
                      </div>
                      <div style={{ marginTop: "4px" }}>
                        <strong>Channel:</strong> dev-channel
                      </div>
                      <div style={{ marginTop: "4px" }}>
                        <strong>Built:</strong> July 22, 2026
                      </div>
                      <div style={{ marginTop: "4px" }}>
                        <strong>Platform:</strong> macOS (aarch64)
                      </div>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                      Loreweaver is up to date.
                    </span>
                  </div>
                )}

                {settingsTab === "contributors" && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--accent)",
                      }}
                    >
                      Contributors
                    </span>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--muted)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      <div>
                        👥{" "}
                        <strong>
                          Google DeepMind Advanced Agentic Coding Team
                        </strong>{" "}
                        - Core architectural designs and pairing helper APIs.
                      </div>
                      <div>
                        👥 <strong>Chris</strong> - Principal Developer and Game
                        Master.
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab === "licenses" && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--accent)",
                      }}
                    >
                      Licenses
                    </span>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--muted)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div>
                        <strong>Loreweaver Core:</strong> MIT License
                      </div>
                      <div>
                        <strong>Tauri Framework:</strong> Apache-2.0 or MIT
                      </div>
                      <div>
                        <strong>Vite & React:</strong> MIT License
                      </div>
                      <div>
                        <strong>SQLite-vec:</strong> MIT License
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab === "profile" && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--accent)",
                      }}
                    >
                      Developer / Company Profile
                    </span>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--muted)",
                        fontStyle: "italic",
                      }}
                    >
                      Company/developer details will be filled out here in a
                      future release.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal overlays */}
      {showNewRuleModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setShowNewRuleModal(false)}
        >
          <div
            className="modal-content"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              padding: 24,
              borderRadius: 8,
              width: 400,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, fontSize: 16 }}>
              Add Custom Rulebook Entry
            </h3>
            <input
              placeholder="Rule Title"
              value={newRuleTitle}
              onChange={(e) => setNewRuleTitle(e.target.value)}
              style={{
                padding: "6px 10px",
                fontSize: 13,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 4,
              }}
            />
            <select
              value={newRuleCategory}
              onChange={(e) => setNewRuleCategory(e.target.value)}
              style={{
                padding: "6px 10px",
                fontSize: 13,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 4,
              }}
            >
              <option value="General Rules">General Rules</option>
              <option value="Combat Rules">Combat Rules</option>
              <option value="Magic & Spells">Magic & Spells</option>
              <option value="CUSTOM">+ Custom Category...</option>
            </select>
            {newRuleCategory === "CUSTOM" && (
              <input
                placeholder="Custom Category Name"
                value={newRuleCustomCategory}
                onChange={(e) => setNewRuleCustomCategory(e.target.value)}
                style={{
                  padding: "6px 10px",
                  fontSize: 13,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                }}
              />
            )}
            <input
              placeholder="Subcategory (e.g. Actions, Conditions, Spells)"
              value={newRuleSubcategory}
              onChange={(e) => setNewRuleSubcategory(e.target.value)}
              style={{
                padding: "6px 10px",
                fontSize: 13,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 4,
              }}
            />
            <textarea
              placeholder="Rule Details & Mechanics..."
              value={newRuleContent}
              onChange={(e) => setNewRuleContent(e.target.value)}
              style={{
                height: 100,
                padding: "6px 10px",
                fontSize: 13,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 4,
              }}
            />
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 8,
              }}
            >
              <button
                className="btn btn-sm"
                onClick={() => setShowNewRuleModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  const category =
                    newRuleCategory === "CUSTOM"
                      ? newRuleCustomCategory.trim() || "Custom Rules"
                      : newRuleCategory;
                  const folder = newRuleSubcategory
                    ? `${category}/${newRuleSubcategory}`
                    : category;
                  handleNewRule(folder);
                  setShowNewRuleModal(false);
                }}
              >
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewVaultModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setShowNewVaultModal(false)}
        >
          <div
            className="modal-content"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              padding: 24,
              borderRadius: 8,
              width: 360,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, fontSize: 16 }}>Campaign Vault Settings</h3>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
              Active Canvas Folder: {currentCanvasFolder || "Root"}
            </p>
            <button
              className="btn btn-sm"
              onClick={() => setShowNewVaultModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
