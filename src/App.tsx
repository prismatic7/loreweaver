import { zodResolver } from "@hookform/resolvers/zod";
import { invoke } from "@tauri-apps/api/core";
import {
    BookOpen,
    ChevronRight,
    Compass,
    Copy,
    Download,
    Eye,
    FileText,
    FolderOpen,
    Layers,
    Moon,
    PenLine,
    Plus,
    RotateCcw,
    Search,
    Send,
    Settings as SettingsIcon,
    Sparkles,
    Sun,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useDebounce } from "use-debounce";
import { useOnClickOutside } from "usehooks-ts";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
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
  category: string;
  source: string;
  content: string;
}

const INITIAL_NOTES: CampaignNote[] = [
  {
    id: "note-1",
    title: "Eldoria",
    path: "Worldbuilding/Eldoria.md",
    frontmatter: {
      type: "Location",
      region: "Eastern Reaches",
      ruler: "Queen Valerius",
      safety: "Medium",
      tags: ["worldbuilding", "kingdom", "capital"],
    },
    content: `# Eldoria

Eldoria is a sprawling kingdom known for its towering white-stone structures and the shimmering River of Stars that flows through its capital.

The city is divided into three major rings:
1. **The Sunlit Spire**: The royal court and administrative sector.
2. **The Canopy District**: A bustling commercial hub suspended on great white arches.
3. **The Shadowed Docks**: The lower slums alongside the River of Stars where contraband changes hands.

## Key Factions
- **The Silver Shield**: A group of paladins dedicated to the protection of the realm.
- **The Shadow Hand**: A clandestine thieves' guild operating in the lower slums.

## Points of Interest
- **Arcane Observatory**: Home to the High Astrologer.
- **The Obsidian Gate**: A sealed obsidian archway in the palace vaults, rumored to lead to the Underdark.`,
  },
  {
    id: "note-2",
    title: "Lord Malakor",
    path: "Characters/Lord Malakor.md",
    frontmatter: {
      type: "NPC",
      system: "dnd5e",
      alignment: "Lawful Evil",
      hp: 120,
      ac: 18,
      tags: ["npc", "villain", "warlord"],
    },
    content: `# Lord Malakor

Lord Malakor is the ruler of the Shadow Keep, a forbidding fortress built into the side of Mount Obsidian. He seeks to unlock the Obsidian Gate in Eldoria.

## Personality Traits
- **Flaw**: Underestimates the resolve of the common folk.
- **Ideal**: Power. Only the strong deserve to rule.
- **Bond**: The Shadowstaff is the source of my longevity; it must never leave my hand.

## Attributes
- **Strength**: 18 (+4)
- **Dexterity**: 10 (+0)
- **Constitution**: 16 (+3)
- **Intelligence**: 15 (+2)
- **Wisdom**: 12 (+1)
- **Charisma**: 16 (+3)

## Combat Actions
- **Multiattack**: Malakor makes two attacks with the Shadowstaff.
- **Shadow Burst**: Fires a bolt of shadow energy at a target within 60 feet. 3d8+3 Necrotic damage.`,
  },
  {
    id: "note-3",
    title: "Lirael",
    path: "Characters/Lirael.md",
    frontmatter: {
      type: "Character",
      system: "dnd5e",
      class: "Wizard (Evocation)",
      level: 5,
      hp: 32,
      ac: 12,
      tags: ["pc", "elven-mage", "spellcaster"],
    },
    content: `# Lirael

Lirael is an elven mage from the Academy of Arcane Whispers. She has been investigating Lord Malakor's movements and has a deep connection to the Astral Plane.

## Background
She was banished from the Academy after a summoning ritual went rogue. She now searches for ancient secrets to redeem her reputation.

## Spellbook
- **Cantrips**: Fire Bolt, Mage Hand, Light
- **1st Level**: Magic Missile, Shield, Detect Magic
- **2nd Level**: Misty Step, Invisibility
- **3rd Level**: Fireball, Counterspell`,
  },
  {
    id: "note-4",
    title: "Shadowstaff",
    path: "Items/Shadowstaff.md",
    frontmatter: {
      type: "Item",
      rarity: "Legendary",
      weight: "4 lbs",
      damage: "1d8 Necrotic",
      tags: ["magic-item", "weapon", "artifact"],
    },
    content: `# Shadowstaff

*Weapon (quarterstaff), legendary (requires attunement)*

A staff forged from solid shadow-glass, cold to the touch and constantly absorbing light around it. It is said to have been forged in the Shadowfell.

## Magical Properties
- **Necrotic Strike**: Deals an extra 1d8 Necrotic damage on hit.
- **Darkness Aura**: As an action, the wielder can cast the *Darkness* spell centered on the staff. (3 charges per day, recharges at midnight).
- **Drain Vitality**: When you kill a creature with this staff, you regain hit points equal to the necrotic damage dealt.`,
  },
];

const INITIAL_RULES: RuleEntry[] = [
  {
    id: "rule-1",
    title: "Combat Actions",
    category: "Combat",
    source: "D&D 5e SRD",
    content: `When you take your action on your turn, you can take one of the actions presented here:
- **Attack**: Make one melee or ranged attack.
- **Cast a Spell**: Cast a cantrip or spell with a casting time of 1 action.
- **Dash**: Gain extra movement equal to your speed.
- **Disengage**: Your movement doesn't provoke opportunity attacks for the rest of the turn.
- **Dodge**: Focus entirely on avoiding attacks. Attackers have disadvantage against you, and you have advantage on Dexterity saving throws.
- **Help**: Give an ally advantage on an ability check or attack roll.
- **Hide**: Make a Dexterity (Stealth) check in an attempt to hide.`,
  },
  {
    id: "rule-2",
    title: "Concentration",
    category: "Spellcasting",
    source: "D&D 5e SRD",
    content: `Some spells require you to maintain concentration in order to keep their magic active.
- **Normal Activity**: Moving, attacking, or casting a non-concentration spell doesn't break concentration.
- **Taking Damage**: Whenever you take damage while concentrating, you must make a Constitution saving throw to maintain concentration. The DC equals 10 or half the damage you take, whichever number is higher.
- **Being Incapacitated**: You lose concentration if you are incapacitated or die.`,
  },
  {
    id: "rule-3",
    title: "Resting",
    category: "General",
    source: "D&D 5e SRD",
    content: `Adventurers require rest to regain abilities and hit points.
- **Short Rest**: At least 1 hour long. A character can spend one or more Hit Dice to regain hit points.
- **Long Rest**: At least 8 hours long. A character regains all lost hit points, up to half of their max Hit Dice, and all expended spell slots.`,
  },
];

function App() {
  const [activeView, setActiveView] = useState<
    "dashboard" | "vault" | "rules" | "ai" | "settings"
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

  const [notes, setNotes] = useState<CampaignNote[]>(INITIAL_NOTES);
  const [selectedNoteId, setSelectedNoteId] = useState<string>("note-1");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editFrontmatter, setEditFrontmatter] = useState<Record<string, any>>(
    {},
  );
  const [newMetaKey, setNewMetaKey] = useState("");
  const [newMetaVal, setNewMetaVal] = useState("");

  const [rules, setRules] = useState<RuleEntry[]>(INITIAL_RULES);
  const [selectedRuleId, setSelectedRuleId] = useState<string>("rule-1");
  const [vaultPath, setVaultPath] = useState("");

  const [chatInput, setChatInput] = useState("");
  const [chatMessagesByVault, setChatMessagesByVault] = useState<
    Record<string, Array<{ role: "user" | "assistant"; text: string }>>
  >({});
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

  useEffect(() => {
    const note = notes.find((n) => n.id === selectedNoteId);
    if (note) {
      setEditTitle(note.title);
      setEditContent(note.content);
      setEditFrontmatter(note.frontmatter || {});
    }
  }, [selectedNoteId]);

  const triggerImmediateSave = () => {
    if (!selectedNoteId) return;
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
    if (!selectedNoteId) return;
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
  }, [
    debouncedEditTitle,
    debouncedEditContent,
    debouncedEditFrontmatter,
    selectedNoteId,
  ]);

  useOnClickOutside(searchRef as React.RefObject<HTMLElement>, () =>
    setIsSearchOpen(false),
  );

  const handleNewNote = () => {
    const newId = `note-${Date.now()}`;
    const newNote: CampaignNote = {
      id: newId,
      title: "New Note",
      path: `Worldbuilding/New_Note_${newId}.md`,
      frontmatter: { type: "Note", tags: ["draft"] },
      content: `# New Note\n\nStart writing your campaign details here...`,
    };

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
      notes.map((note) => {
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

    const linkNameCounts = new Map<string, number>();
    for (const note of notes) {
      for (const name of getNoteLinkNames(note)) {
        const key = name.toLowerCase();
        linkNameCounts.set(key, (linkNameCounts.get(key) || 0) + 1);
      }
    }

    const noteTitles = Array.from(linkNameCounts.entries())
      .filter(([, count]) => count === 1)
      .map(([name]) => name)
      .sort((left, right) => right.length - left.length);

    const escapeRegExp = (value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const protectInlineContent = (segment: string) => {
      const placeholders: Array<{ type: "code" | "wiki"; value: string }> = [];

      const withPlaceholders = segment
        .replace(/`[^`\n]+`/g, (codeMatch) => {
          const placeholder = `__LW_PLACEHOLDER_${placeholders.length}__`;
          placeholders.push({ type: "code", value: codeMatch });
          return placeholder;
        })
        .replace(
          /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g,
          (_match, target, label) => {
            const placeholder = `__LW_PLACEHOLDER_${placeholders.length}__`;
            const resolvedTarget = String(target).trim();
            const resolvedLabel = String(label ?? target).trim();
            placeholders.push({
              type: "wiki",
              value: `[${resolvedLabel}](loreweaver-note:${encodeURIComponent(resolvedTarget)})`,
            });
            return placeholder;
          },
        );

      const autolinked = noteTitles.reduce((currentText, title) => {
        const titlePattern = new RegExp(
          `(^|[^\\w\\[])(${escapeRegExp(title)})(?=$|[^\\w\\]])`,
          "gi",
        );

        return currentText.replace(
          titlePattern,
          (_match, prefix, matchedTitle) => `${prefix}[[${matchedTitle}]]`,
        );
      }, withPlaceholders);

      const restored = autolinked.replace(
        /__LW_PLACEHOLDER_(\d+)__/g,
        (_match, index) => {
          const placeholder = placeholders[Number(index)];
          return placeholder?.value || "";
        },
      );

      if (mode === "render") {
        return restored.replace(
          /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g,
          (_match, target, label) => {
            const resolvedTarget = String(target).trim();
            const resolvedLabel = String(label ?? target).trim();
            return `[${resolvedLabel}](loreweaver-note:${encodeURIComponent(resolvedTarget)})`;
          },
        );
      }

      return restored;
    };

    const fenceRegex = /```[\s\S]*?```/g;
    let output = "";
    let lastIndex = 0;
    let match;

    while ((match = fenceRegex.exec(input)) !== null) {
      output += protectInlineContent(input.slice(lastIndex, match.index));
      output += match[0];
      lastIndex = match.index + match[0].length;
    }

    output += protectInlineContent(input.slice(lastIndex));
    return output;
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

    const matches = notes.filter((note) =>
      getNoteLinkNames(note).some(
        (name) => name.toLowerCase() === normalizedTarget,
      ),
    );

    if (matches.length === 1) {
      return matches[0];
    }

    const exactTitleMatches = matches.filter(
      (note) => note.title.trim().toLowerCase() === normalizedTarget,
    );

    if (exactTitleMatches.length === 1) {
      return exactTitleMatches[0];
    }

    return null;
  };

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

  const currentNote = notes.find((n) => n.id === selectedNoteId);
  const currentRule = rules.find((r) => r.id === selectedRuleId);

  return (
    <div className="app-container">
      {/* ── Sidebar ── */}
      <aside className="sidebar" data-od-id="sidebar">
        <div className="sidebar-header" data-od-id="brand-lockup">
          <Layers
            className="nav-item-icon"
            style={{ color: "var(--accent)", width: 20, height: 20 }}
          />
          <div className="brand-title">Loreweaver</div>
          <div className="brand-sub">Campaign Architect</div>
        </div>

        <div
          style={{
            padding: "0 16px 16px 16px",
            borderBottom: "1px solid var(--border)",
            marginBottom: "16px",
          }}
        >
          <label
            style={{
              fontSize: "9px",
              color: "var(--muted)",
              fontWeight: 600,
              display: "block",
              marginBottom: "6px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Campaign Vault
          </label>
          <div style={{ display: "flex", gap: "6px" }}>
            <select
              value={vaultPath}
              onChange={(e) => {
                const targetPath = e.target.value;
                if (!targetPath) return;
                invoke("switch_vault", { path: targetPath })
                  .then(() => {
                    refreshVaultData();
                    alert("Switched campaign vault successfully!");
                  })
                  .catch((err) => alert("Failed to switch vault: " + err));
              }}
              style={{
                flex: 1,
                padding: "6px 8px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                color: "var(--fg)",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              {vaults.map((v) => (
                <option key={v.path} value={v.path}>
                  {v.name}
                </option>
              ))}
            </select>
            <button
              className="btn btn-sm"
              style={{
                padding: "4px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                cursor: "pointer",
              }}
              title="Create New Vault"
              onClick={() => {
                const name = prompt("Enter a name for the new campaign vault:");
                if (name && name.trim()) {
                  invoke<string>("create_vault", { name: name.trim() })
                    .then((newPath) => {
                      refreshVaultsList();
                      invoke("switch_vault", { path: newPath })
                        .then(() => {
                          refreshVaultData();
                          alert(
                            `Vault "${name}" created and loaded successfully!`,
                          );
                        })
                        .catch((err) =>
                          alert("Failed to load new vault: " + err),
                        );
                    })
                    .catch((err) => alert("Failed to create vault: " + err));
                }
              }}
            >
              ➕
            </button>
          </div>
        </div>

        <div className="nav-section">
          <span className="section-label">Workspace</span>
          <button
            className={`nav-item ${activeView === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveView("dashboard")}
            data-od-id="nav-dashboard"
            aria-current={activeView === "dashboard" ? "page" : undefined}
          >
            <Compass /> Dashboard
          </button>
          <button
            className={`nav-item ${activeView === "vault" ? "active" : ""}`}
            onClick={() => setActiveView("vault")}
            data-od-id="nav-vault"
            aria-current={activeView === "vault" ? "page" : undefined}
          >
            <FolderOpen /> Campaign Vault
          </button>
          <button
            className={`nav-item ${activeView === "rules" ? "active" : ""}`}
            onClick={() => setActiveView("rules")}
            data-od-id="nav-rules"
            aria-current={activeView === "rules" ? "page" : undefined}
          >
            <BookOpen /> Rulebooks & SRDs
          </button>
          <button
            className={`nav-item ${activeView === "ai" ? "active" : ""}`}
            onClick={() => setActiveView("ai")}
            data-od-id="nav-ai"
            aria-current={activeView === "ai" ? "page" : undefined}
          >
            <Sparkles /> AI & Generations
          </button>
          <button
            className={`nav-item ${activeView === "settings" ? "active" : ""}`}
            onClick={() => setActiveView("settings")}
            data-od-id="nav-settings"
            aria-current={activeView === "settings" ? "page" : undefined}
          >
            <SettingsIcon /> Settings
          </button>
        </div>

        <div className="sidebar-footer">
          <span>v2.0.0 (Local-First)</span>
          <button
            className="btn btn-icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            data-od-id="btn-theme-toggle"
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </button>
        </div>
      </aside>

      {/* ── Main Area ── */}
      <main className="main-area" data-od-id="main-area">
        <header className="toolbar" data-od-id="toolbar">
          <div className="breadcrumb">
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
                            setSelectedNoteId(result.path);
                            setActiveView("vault");
                          } else {
                            const rule = rules.find(
                              (r) => r.title === result.title,
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

            <button
              className="btn btn-sm btn-primary"
              onClick={handleNewNote}
              data-od-id="btn-new-note"
            >
              <Plus /> New Note
            </button>
          </div>
        </header>

        {/* ── Content Views ── */}
        <div
          className="workspace-content"
          style={{ flex: 1, overflow: "hidden", display: "flex" }}
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
                  {notes.map((note) => (
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
                  <span className="section-label" style={{ marginLeft: 8 }}>
                    Notes
                  </span>
                  {notes.map((note) => (
                    <button
                      key={note.id}
                      className={`nav-item ${selectedNoteId === note.id ? "active" : ""}`}
                      onClick={() => {
                        setSelectedNoteId(note.id);
                        setIsEditingNote(false);
                      }}
                      data-od-id={`note-${note.id}`}
                    >
                      <FileText size={14} /> {note.title}
                    </button>
                  ))}
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
                                onChange={(e) => setNewMetaKey(e.target.value)}
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
                                onChange={(e) => setNewMetaVal(e.target.value)}
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
                  <span className="section-label" style={{ marginLeft: 8 }}>
                    Rulebooks
                  </span>
                  {rules.map((rule) => (
                    <button
                      key={rule.id}
                      className={`nav-item ${selectedRuleId === rule.id ? "active" : ""}`}
                      onClick={() => setSelectedRuleId(rule.id)}
                      data-od-id={`rule-${rule.id}`}
                    >
                      <BookOpen size={14} /> {rule.title}
                    </button>
                  ))}
                  <input
                    type="file"
                    id="srd-file-input"
                    style={{ display: "none" }}
                    accept=".md,.txt"
                    onChange={handleIngestSRD}
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
                    }}
                  >
                    <FileText
                      size={24}
                      style={{
                        margin: "0 auto 10px auto",
                        color: "var(--muted)",
                      }}
                    />
                    <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                      Import SRD / Book
                    </div>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--muted)",
                        marginTop: "4px",
                      }}
                    >
                      Click to select Markdown file
                    </div>
                  </div>
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
                    <div className="doc-title">{currentRule?.title}</div>
                    <div className="doc-meta">
                      <span className="doc-meta-tag">
                        {currentRule?.category}
                      </span>
                      <span>{currentRule?.source}</span>
                    </div>
                    <div
                      className="doc-body"
                      style={{ whiteSpace: "pre-line" }}
                    >
                      {currentRule?.content}
                    </div>
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
                    style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}
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
                <div
                  style={{
                    width: 260,
                    borderLeft: "1px solid var(--border)",
                    overflowY: "auto",
                    padding: 20,
                    background: "var(--surface)",
                    flexShrink: 0,
                  }}
                >
                  <span className="panel-title">Asset Generator</span>
                  <div className="field-group" style={{ marginTop: 12 }}>
                    <label
                      className="field-label"
                      style={{
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: "var(--muted)",
                      }}
                    >
                      Prompt
                    </label>
                    <textarea
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      style={{
                        height: "60px",
                        resize: "none",
                        fontSize: "0.8rem",
                        padding: "8px",
                        width: "100%",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        color: "var(--fg)",
                        fontFamily: "var(--font-body)",
                      }}
                    />
                  </div>
                  <div className="field-group" style={{ marginTop: 12 }}>
                    <label
                      className="field-label"
                      style={{
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: "var(--muted)",
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
                        fontSize: 12,
                      }}
                    >
                      <option value="Fantasy Portrait">Fantasy Portrait</option>
                      <option value="Oil Painting">Oil Painting</option>
                      <option value="Ink Sketch">Ink Sketch</option>
                      <option value="Vibrant Concept Art">
                        Vibrant Concept Art
                      </option>
                    </select>
                  </div>
                  <button
                    className="btn btn-sm btn-primary"
                    style={{ width: "100%", marginTop: 12 }}
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage}
                    data-od-id="btn-generate-image"
                  >
                    {isGeneratingImage ? "Rendering..." : "Generate Asset"}
                  </button>
                  <div className="asset-preview" style={{ marginTop: 12 }}>
                    {isGeneratingImage ? (
                      <span>Running local Stable Diffusion pipeline...</span>
                    ) : generatedImageUrl ? (
                      <img src={generatedImageUrl} alt="Generated character" />
                    ) : (
                      <span>No asset rendered</span>
                    )}
                  </div>
                </div>
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
                      style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
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
                              activeConfigTab === tab.id ? "#fff" : "var(--fg)",
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
                            { id: "gemini", name: "Google Gemini", logo: "🔵" },
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
                              style={{ fontSize: "20px", marginBottom: "6px" }}
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
                      <strong>DIMENSION COMPATIBILITY CAVEAT:</strong> Modifying
                      your embedding provider changes the dimension length of
                      generated vectors. After saving, run{" "}
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
      </main>

      {/* ── Inspector ── */}
      <aside className="inspector" data-od-id="inspector">
        {/* AI Chat */}
        <div className="inspector-panel">
          <span className="panel-title">AI Campaign Architect</span>
          <div className="chat-messages">
            {currentChatMessages.slice(-3).map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role}`}>
                {msg.text}
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              className="btn btn-sm"
              onClick={resetCurrentVaultSession}
              disabled={!vaultPath}
              title="Reset this vault's campaign memory"
            >
              <RotateCcw size={14} /> Reset Session
            </button>
            <button
              className="btn btn-sm"
              onClick={exportCurrentVaultSession}
              disabled={!vaultPath}
              title="Export this vault's campaign memory as JSON"
            >
              <Download size={14} /> Export
            </button>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <select
              value={sessionCloneTargetVaultPath}
              onChange={(e) => setSessionCloneTargetVaultPath(e.target.value)}
              style={{
                flex: 1,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                padding: "6px 8px",
                fontFamily: "var(--font-body)",
                fontSize: 12,
                borderRadius: 4,
                color: "var(--fg)",
              }}
            >
              <option value="">Clone to another vault...</option>
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
              onClick={cloneCurrentVaultSession}
              disabled={
                !vaultPath ||
                !sessionCloneTargetVaultPath ||
                sessionCloneTargetVaultPath === vaultPath
              }
              title="Clone this vault's campaign memory into another vault"
            >
              <Copy size={14} /> Clone
            </button>
          </div>
          <div className="chat-input-row">
            <input
              placeholder="Ask the Architect..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendChatMessage();
              }}
              aria-label="Ask the Architect"
            />
            <button
              className="btn btn-sm btn-primary"
              onClick={handleSendChatMessage}
              data-od-id="btn-inspector-send"
            >
              Send
            </button>
          </div>
        </div>

        {/* Metadata */}
        <div className="inspector-panel">
          <span className="panel-title">Metadata</span>
          <div className="meta-grid">
            <div className="meta-row">
              <span>Status</span>
              <span>Draft</span>
            </div>
            <div className="meta-row">
              <span>Type</span>
              <span>{String(currentNote?.frontmatter.type || "Note")}</span>
            </div>
            <div className="meta-row">
              <span>Tags</span>
              <span>
                {Array.isArray(currentNote?.frontmatter.tags)
                  ? (currentNote!.frontmatter.tags as string[]).join(", ")
                  : "—"}
              </span>
            </div>
            <div className="meta-row">
              <span>Last Edited</span>
              <span>2m ago</span>
            </div>
          </div>
        </div>

        {/* Dice Roller */}
        <div className="inspector-panel">
          <span className="panel-title">Dice Roller</span>
          <div className="dice-grid">
            {[4, 6, 8, 20].map((sides) => (
              <button
                key={sides}
                className="dice-btn"
                onClick={() => rollDice(sides)}
                data-od-id={`dice-d${sides}`}
              >
                d{sides}
              </button>
            ))}
          </div>
          <div className="dice-mod-row">
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Mod:</span>
            <input
              type="number"
              value={rollModifier}
              onChange={(e) => setRollModifier(parseInt(e.target.value) || 0)}
            />
          </div>
          {diceHistory.length > 0 && (
            <div className="dice-history">
              {diceHistory.slice(0, 5).map((entry, i) => (
                <div key={i} className="dice-history-item">
                  {entry}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Plugins */}
        <div className="inspector-panel">
          <span className="panel-title">Plugins</span>
          {pluginsList.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pluginsList.map((plugin) => {
                if (plugin.id === "character-roller" && plugin.active) {
                  return (
                    <button
                      key={plugin.id}
                      className="btn btn-sm"
                      style={{ width: "100%" }}
                      onClick={handleRollCharacterSheet}
                      data-od-id="btn-roll-character"
                    >
                      Roll Ability Sheet
                    </button>
                  );
                }
                if (plugin.id === "threat-evaluator" && plugin.active) {
                  return (
                    <button
                      key={plugin.id}
                      className="btn btn-sm"
                      style={{ width: "100%" }}
                      onClick={handleEvaluateEncounterThreat}
                      data-od-id="btn-evaluate-threat"
                    >
                      Evaluate Threat
                    </button>
                  );
                }
                return null;
              })}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              No plugins found
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export default App;
