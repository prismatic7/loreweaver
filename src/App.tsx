import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useOnClickOutside } from "usehooks-ts";
import "./App.css";

import { DashboardView } from "./components/DashboardView";
import { LiminalView } from "./components/LiminalView";
import { SettingsView } from "./components/SettingsView";
import { TrashView } from "./components/TrashView";
import { RulesView } from "./components/RulesView";
import { AiView } from "./components/AiView";
import { CampaignVaultView } from "./components/CampaignVaultView";
import { CharacterSheetView } from "./components/CharacterSheetView";
import { MapBuilderView } from "./components/MapBuilderView";
import { EntityGraphView } from "./components/EntityGraphView";
import { TimelineView } from "./components/TimelineView";
import { AppShell, type AppView } from "./components/AppShell";
import { RightDrawer, type RightDrawerTab } from "./components/RightDrawer";
import { SettingsRightPanel } from "./components/SettingsRightPanel";
import {
  ConfirmModal,
  PromptModal,
  AlertModal,
  IngestModal,
  NewRuleModal,
  NewVaultModal,
  ContextMenu,
} from "./components/Modals";

import { useVault } from "./hooks/useVault";
import { useWorld } from "./hooks/useWorld";
import { useNotes } from "./hooks/useNotes";
import { useRules } from "./hooks/useRules";
import { useSearch } from "./hooks/useSearch";
import { useAgent } from "./hooks/useAgent";
import { usePlugins } from "./hooks/usePlugins";
import { useSettings } from "./hooks/useSettings";
import { useDialogs } from "./hooks/useDialogs";
import { useMarkdownRender } from "./hooks/useMarkdownRender";
import { useIngest } from "./hooks/useIngest";
import { useFolderActions } from "./hooks/useFolderActions";
import { useSessionTools } from "./hooks/useSessionTools";
import { useVaultActions } from "./hooks/useVaultActions";
import { useCaptureInbox } from "./hooks/useCaptureInbox";

import { RuleEntry, SearchResult, WebClip, WorldInfo } from "./types";

function App() {
  const [activeView, setActiveView] = useState<AppView>("dashboard");

  const { vaultPath, vaults, switchVault, refreshVaultPath, getVaultLabel, loadVaults } = useVault();
  const { noteTypes, provenanceTaxonomy } = useWorld(vaultPath);
  const [worlds, setWorlds] = useState<WorldInfo[]>([]);
  const {
    notes,
    notesByFolder,
    selectedNoteId,
    setSelectedNoteId,
    currentNote,
    isEditingNote,
    setIsEditingNote,
    editTitle,
    setEditTitle,
    editContent,
    setEditContent,
    editFrontmatter,
    setEditFrontmatter,
    trashedNotes,
    currentCanvasFolder,
    setCurrentCanvasFolder,
    activeEditingNoteIdRef,
    loadNotes,
    loadTrashNotes,
    loadFolders,
    saveNote,
    immediateSave,
    trashNote,
    restoreNote,
    deleteTrashedNote,
    emptyTrash,
    handleNewNote,
    trashFolder,
    normalizeCampaignMarkdown,
  } = useNotes(vaultPath);
  const {
    rules,
    setRules,
    rulesByFolder,
    selectedRuleId,
    setSelectedRuleId,
    currentRule,
    isEditingRule,
    setIsEditingRule,
    editRuleTitle,
    setEditRuleTitle,
    editRulePath,
    setEditRulePath,
    editRuleCategory,
    setEditRuleCategory,
    editRuleSource,
    setEditRuleSource,
    editRuleContent,
    setEditRuleContent,
    loadRules,
    handleNewRule,
    handleNewRuleFolder,
    handleInsertRuleImage,
    deleteRule,
    deleteRulesFolder,
  } = useRules(vaultPath);
  const {
    searchQuery,
    setSearchQuery,
    isSearchOpen,
    setIsSearchOpen,
    searchResults,
  } = useSearch(notes, rules);
  const {
    theme,
    setTheme,
    settingsTab,
    setSettingsTab,
    register,
    handleSubmit,
    setValue,
    watch,
    errors,
    isDirty,
    isValid,
    loadSettings,
    handleSaveSettings,
    llmProvider,
    llmModel,
    llmApiKey,
    llmBaseUrl,
    imageProvider,
    imageModel,
    imageApiKey,
    imageBaseUrl,
    ttsProvider,
    ttsApiKey,
    sttProvider,
    sttApiKey,
  } = useSettings();
  const {
    pluginsList,
    handleRollCharacterSheet,
    handleEvaluateEncounterThreat,
    handleInitiativeTracker,
    handleEncounterBuilder,
  } = usePlugins(vaultPath);

  const {
    confirmDialog,
    setConfirmDialog,
    promptDialog,
    setPromptDialog,
    alertDialog,
    setAlertDialog,
    pendingConfirm,
    setPendingConfirm,
    alert,
    showPrompt,
    confirm,
  } = useDialogs();

  // True when the current note has edits that have not yet been persisted.
  // Mirrors the dirty check inside immediateSave() so the navigation guard and
  // the autosave agree on what counts as "unsaved".
  const hasUnsavedChanges = useMemo(() => {
    if (!currentNote || !isEditingNote) return false;
    const normalizedContent = normalizeCampaignMarkdown(editContent);
    return (
      editTitle !== currentNote.title ||
      normalizedContent !== currentNote.content ||
      JSON.stringify(editFrontmatter) !== JSON.stringify(currentNote.frontmatter)
    );
  }, [currentNote, isEditingNote, editTitle, editContent, editFrontmatter, normalizeCampaignMarkdown]);

  // Navigation guard: warn before leaving a note with unsaved edits. The user
  // can still confirm to discard and leave without saving.
  const guardedSetActiveView = useCallback(
    (view: AppView) => {
      if (hasUnsavedChanges) {
        confirm("You have unsaved changes. Leave without saving?", () => {
          setActiveView(view);
        });
      } else {
        setActiveView(view);
      }
    },
    [hasUnsavedChanges, confirm, setActiveView],
  );

  const guardedSetSelectedNoteId = useCallback(
    (id: string) => {
      if (hasUnsavedChanges && id !== selectedNoteId) {
        confirm("You have unsaved changes. Leave without saving?", () => {
          setSelectedNoteId(id);
        });
      } else {
        setSelectedNoteId(id);
      }
    },
    [hasUnsavedChanges, selectedNoteId, confirm, setSelectedNoteId],
  );

  const { renderMarkdown } = useMarkdownRender({
    notes,
    selectedNoteId,
    vaultPath,
    setSelectedNoteId: guardedSetSelectedNoteId,
    setIsEditingNote,
    saveNote,
  });

  const { ingestDialog, setIngestDialog, handleIngestSRD } = useIngest({
    alert,
    loadRules,
    llmProvider,
    llmModel,
    llmApiKey,
    llmBaseUrl,
  });

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "note" | "folder" | "rule" | "rule-folder";
    targetId: string;
    path?: string;
    isRulebook?: boolean;
  } | null>(null);

  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  // Which folder's "+" add-asset dropdown is open (keyed by folder name).
  const [activeFolderDropdown, setActiveFolderDropdown] = useState<string | null>(null);

  const {
    pendingAssetTarget,
    assetFileInputRef,
    handleNewFolder,
    handleAssetFileSelected,
    handleTrashFolder,
    renderFolderDropdown,
  } = useFolderActions({
    setRules,
    setSelectedNoteId: guardedSetSelectedNoteId,
    setSelectedRuleId,
    setIsEditingNote,
    setIsEditingRule,
    setEditTitle,
    setEditContent,
    setEditFrontmatter,
    activeEditingNoteIdRef,
    setCurrentCanvasFolder,
    setActiveView: guardedSetActiveView,
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
    activeFolderDropdown,
    setActiveFolderDropdown,
  });

  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(true);
  const [rightDrawerTab, setRightDrawerTab] = useState<RightDrawerTab>("scratchpad");

  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [showNewVaultModal, setShowNewVaultModal] = useState(false);

  const searchRef = useRef<HTMLDivElement | null>(null);
  useOnClickOutside(searchRef as any, () => setIsSearchOpen(false));

  const agent = useAgent(
    vaultPath,
    vaults,
    {
      llmProvider,
      llmModel,
      llmApiKey,
      llmBaseUrl,
      imageProvider,
      imageModel,
      imageApiKey,
      imageBaseUrl,
      ttsProvider,
      ttsApiKey,
    },
    selectedNoteId,
  );

  const refreshVaultData = useCallback(async () => {
    await loadNotes();
    await loadRules();
    await refreshVaultPath();
    await loadFolders();
    await loadTrashNotes();
    await loadSettings();
  }, [loadNotes, loadRules, refreshVaultPath, loadFolders, loadTrashNotes, loadSettings]);

  useEffect(() => {
    refreshVaultData();
    loadVaults();

    const unlisten = listen("vault-changed", () => {
      loadNotes()
        .then(() => loadFolders())
        .catch((err) => console.error("Background vault sync failed:", err));
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!vaultPath) return;
    agent.initVaultChat();
  }, [vaultPath]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [contextMenu]);

  const handleSaveSettingsCb = (data: any) => handleSaveSettings(data, alert);

  const handleSelectSearchResult = useCallback(
    (result: SearchResult) => {
      if (result.type === "note") {
        const matchedNote = notes.find((n) => n.path === result.path);
        if (matchedNote) {
          guardedSetSelectedNoteId(matchedNote.id);
          guardedSetActiveView("vault");
        }
      } else {
        const rule = rules.find((r) => r.id === result.path);
        if (rule) {
          setSelectedRuleId(rule.id);
          guardedSetActiveView("rules");
        }
      }
    },
    [notes, rules, guardedSetSelectedNoteId, guardedSetActiveView, setSelectedRuleId],
  );

  const backlinks = useMemo(() => {
    if (!selectedNoteId) return [];
    const currentNoteObj = notes.find((n) => n.id === selectedNoteId);
    if (!currentNoteObj) return [];

    return notes.filter((note) => {
      if (note.id === selectedNoteId) return false;
      const lowerTitle = currentNoteObj.title.toLowerCase();
      return (
        note.content.toLowerCase().includes(`[[${lowerTitle}]]`) ||
        note.content.toLowerCase().includes(`[[${lowerTitle}|`)
      );
    });
  }, [notes, selectedNoteId]);

  const sessionTools = useSessionTools({
    pluginsList,
    alert,
    imageProvider,
    imageModel,
    imageApiKey,
    imageBaseUrl,
    ttsProvider,
    ttsApiKey,
    sttProvider,
    sttApiKey,
  });

  const vaultActions = useVaultActions({
    notes,
    saveNote,
    loadNotes,
    trashNote,
    deleteRule,
    emptyTrash,
    deleteTrashedNote,
    normalizeCampaignMarkdown,
    setSelectedNoteId: guardedSetSelectedNoteId,
    setSelectedRuleId,
    setActiveView: guardedSetActiveView,
    setIsEditingNote,
    setCurrentCanvasFolder,
    confirm,
    alert,
    handleRollCharacterSheet,
    handleEvaluateEncounterThreat,
    handleInitiativeTracker,
    handleEncounterBuilder,
  });

  const captureInbox = useCaptureInbox({ alert, confirm });

  const handleToolbarClipUrl = useCallback(async () => {
    const url = await showPrompt("Enter a URL to clip:", "https://");
    if (!url || !url.trim()) return;
    try {
      const clip = await invoke<WebClip>("clip_webpage", { url: url.trim() });
      const title = clip.title || url.trim();
      confirm(`Save "${title}" as a note?`, () => {
        invoke<string>("capture_note", {
          title,
          content: clip.markdown,
          sourceType: "history",
          sourceTitle: clip.title,
          sourceAuthor: clip.site,
          sourceUrl: clip.url,
        })
          .then(() => alert("Note saved."))
          .catch((err) => alert("Failed to save note: " + err));
      });
    } catch (err) {
      alert("Failed to clip webpage: " + err);
    }
  }, [showPrompt, confirm, alert]);

  const loadWorlds = useCallback(async () => {
    try {
      const list = await invoke<WorldInfo[]>("list_worlds");
      setWorlds(list || []);
    } catch (err) {
      console.error("Failed to list worlds:", err);
    }
  }, []);

  const handleSwitchWorld = useCallback(
    async (path: string) => {
      try {
        await switchVault(path);
        await refreshVaultData();
        await loadWorlds();
      } catch (err) {
        alert("Failed to switch world: " + err);
      }
    },
    [switchVault, refreshVaultData, loadWorlds, alert],
  );

  const handleCreateWorld = useCallback(
    async (name: string, scaffoldFrom: string | null) => {
      try {
        const path = await invoke<string>("create_world", {
          name,
          scaffoldFrom,
        });
        await handleSwitchWorld(path);
      } catch (err) {
        alert("Failed to create world: " + err);
      }
    },
    [handleSwitchWorld, alert],
  );

  const handleExportWorld = useCallback(
    async (world: WorldInfo) => {
      try {
        const dest = await save({
          defaultPath: `${world.name}.zip`,
          filters: [{ name: "World bundle", extensions: ["zip"] }],
        });
        if (!dest || typeof dest !== "string") return;
        const result = await invoke<string>("export_world", {
          vaultPath: world.path,
          destPath: dest,
        });
        alert("Exported world to: " + result);
      } catch (err) {
        alert("Failed to export world: " + err);
      }
    },
    [alert],
  );

  const handleImportWorld = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "World bundle", extensions: ["zip"] }],
      });
      if (!selected || typeof selected !== "string") return;
      const path = await invoke<string>("import_world", {
        zipPath: selected,
      });
      await loadWorlds();
      await handleSwitchWorld(path);
    } catch (err) {
      alert("Failed to import world: " + err);
    }
  }, [loadWorlds, handleSwitchWorld, alert]);

  const [liminalOpen, setLiminalOpen] = useState(false);

  const handleOpenLiminal = useCallback(() => {
    setLiminalOpen(true);
  }, []);

  const handleCloseLiminal = useCallback(() => {
    setLiminalOpen(false);
  }, []);

  const handleMakeWorldFromLiminal = useCallback(
    async (name: string) => {
      try {
        const path = await invoke<string>("make_world_from_liminal", { name });
        await loadWorlds();
        await handleSwitchWorld(path);
      } catch (err) {
        alert("Failed to birth world from Liminal: " + err);
      }
    },
    [loadWorlds, handleSwitchWorld, alert],
  );

  useEffect(() => {
    loadWorlds();
  }, [loadWorlds]);

  return (
    <AppShell
      activeView={activeView}
      setActiveView={guardedSetActiveView}
      theme={theme}
      setTheme={setTheme}
      vaultPath={vaultPath}
      worlds={worlds}
      onSwitchWorld={handleSwitchWorld}
      onOpenLiminal={handleOpenLiminal}
      onCreateWorld={handleCreateWorld}
      onExportWorld={handleExportWorld}
      onImportWorld={handleImportWorld}
      onMakeWorldFromLiminal={handleMakeWorldFromLiminal}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      isSearchOpen={isSearchOpen}
      setIsSearchOpen={setIsSearchOpen}
      searchResults={searchResults}
      notes={notes}
      rules={rules}
      onSelectSearchResult={handleSelectSearchResult}
      searchRef={searchRef}
      onLoadTrash={loadTrashNotes}
      onClipUrl={handleToolbarClipUrl}
      rightPanel={
        !liminalOpen && activeView !== "settings" ? (
          <RightDrawer
            activeView={activeView}
            isOpen={isRightDrawerOpen}
            setIsOpen={setIsRightDrawerOpen}
            tab={rightDrawerTab}
            setTab={setRightDrawerTab}
            scratchpadText={sessionTools.scratchpadText}
            setScratchpadText={sessionTools.setScratchpadText}
            diceNotation={sessionTools.diceNotation}
            setDiceNotation={sessionTools.setDiceNotation}
            diceHistory={sessionTools.diceHistory}
            rollDiceNotation={sessionTools.rollDiceNotation}
            pluginsList={pluginsList}
            handleRollCharacterSheet={vaultActions.handleRollCharacterSheetCb}
            handleEvaluateEncounterThreat={vaultActions.handleEvaluateEncounterThreatCb}
            handleInitiativeTracker={vaultActions.handleInitiativeTrackerCb}
            handleEncounterBuilder={vaultActions.handleEncounterBuilderCb}
            currentChatMessages={agent.currentChatMessages}
            chatInput={agent.chatInput}
            setChatInput={agent.setChatInput}
            handleSendChatMessage={agent.handleSendChatMessage}
            renderMarkdown={renderMarkdown}
            vaultPath={vaultPath}
            resetCurrentVaultSession={agent.resetCurrentVaultSession}
            exportCurrentVaultSession={() => agent.exportCurrentVaultSession(getVaultLabel)}
            cloneCurrentVaultSession={agent.cloneCurrentVaultSession}
            sessionCloneTargetVaultPath={agent.sessionCloneTargetVaultPath}
            setSessionCloneTargetVaultPath={agent.setSessionCloneTargetVaultPath}
            vaults={vaults}
            memoryFacts={agent.memoryFacts}
            loadMemoryFacts={agent.loadMemoryFacts}
            addMemoryFact={agent.addMemoryFact}
            deleteMemoryFact={agent.deleteMemoryFact}
            isSummarizing={agent.isSummarizing}
            summaryText={agent.summaryText}
            handleSummarizeSession={agent.handleSummarizeSession}
            npcVoiceText={agent.npcVoiceText}
            setNpcVoiceText={agent.setNpcVoiceText}
            npcVoiceName={agent.npcVoiceName}
            setNpcVoiceName={agent.setNpcVoiceName}
            isSpeakingNpc={agent.isSpeakingNpc}
            npcAudioUrl={agent.npcAudioUrl}
            handleSpeakAsNpc={agent.handleSpeakAsNpc}
            isGeneratingChatImage={agent.isGeneratingChatImage}
            chatImageUrl={agent.chatImageUrl}
            handleGenerateChatImage={agent.handleGenerateChatImage}
            imagePrompt={sessionTools.imagePrompt}
            setImagePrompt={sessionTools.setImagePrompt}
            imageStyle={sessionTools.imageStyle}
            setImageStyle={sessionTools.setImageStyle}
            isGeneratingImage={sessionTools.isGeneratingImage}
            generatedImageUrl={sessionTools.generatedImageUrl}
            handleGenerateImage={sessionTools.handleGenerateImage}
            ttsText={sessionTools.ttsText}
            setTtsText={sessionTools.setTtsText}
            ttsProvider={ttsProvider}
            isGeneratingSpeech={sessionTools.isGeneratingSpeech}
            generatedSpeechUrl={sessionTools.generatedSpeechUrl}
            handleGenerateSpeech={sessionTools.handleGenerateSpeech}
            isTranscribing={sessionTools.isTranscribing}
            transcribedText={sessionTools.transcribedText}
            handleTranscribeAudio={sessionTools.handleTranscribeAudio}
            backlinks={backlinks}
            setSelectedNoteId={guardedSetSelectedNoteId}
            captureTitle={captureInbox.captureTitle}
            setCaptureTitle={captureInbox.setCaptureTitle}
            captureContent={captureInbox.captureContent}
            setCaptureContent={captureInbox.setCaptureContent}
            captureUrl={captureInbox.captureUrl}
            setCaptureUrl={captureInbox.setCaptureUrl}
            captureSourceType={captureInbox.captureSourceType}
            setCaptureSourceType={captureInbox.setCaptureSourceType}
            isClipping={captureInbox.isClipping}
            clipResult={captureInbox.clipResult}
            handleClipUrl={captureInbox.handleClipUrl}
            handleSaveClipAsNote={captureInbox.handleSaveClipAsNote}
            handleSaveCapture={captureInbox.handleSaveCapture}
            handleFileDrop={captureInbox.handleFileDrop}
            provenanceTaxonomy={provenanceTaxonomy}
          />
        ) : (
          <SettingsRightPanel tab={settingsTab} setTab={setSettingsTab} />
        )
      }
    >
      {liminalOpen && (
        <LiminalView
          worlds={worlds}
          onMakeWorldFromLiminal={handleMakeWorldFromLiminal}
          onClose={handleCloseLiminal}
        />
      )}

      {!liminalOpen && activeView === "dashboard" && (
        <DashboardView
          notes={notes}
          rules={rules}
          setActiveView={guardedSetActiveView}
          setSelectedNoteId={guardedSetSelectedNoteId}
        />
      )}

      {!liminalOpen && (activeView === "vault" || activeView === "canvas") && (
        <CampaignVaultView
          activeView={activeView}
          notesByFolder={notesByFolder}
          collapsedFolders={collapsedFolders}
          setCollapsedFolders={setCollapsedFolders}
          selectedNoteId={selectedNoteId}
          setSelectedNoteId={guardedSetSelectedNoteId}
          currentNote={currentNote}
          isEditingNote={isEditingNote}
          setIsEditingNote={setIsEditingNote}
          editTitle={editTitle}
          setEditTitle={setEditTitle}
          editFrontmatter={editFrontmatter}
          setEditFrontmatter={setEditFrontmatter}
          editContent={editContent}
          setEditContent={setEditContent}
          setContextMenu={setContextMenu}
          activeFolderDropdown={activeFolderDropdown}
          setActiveFolderDropdown={setActiveFolderDropdown}
          renderFolderDropdown={renderFolderDropdown}
          handleNewNote={() => handleNewNote()}
          handleNewFolder={handleNewFolder}
          handleTrashNote={vaultActions.handleTrashNote}
          renderMarkdown={renderMarkdown}
          currentCanvasFolder={currentCanvasFolder}
          setCurrentCanvasFolder={setCurrentCanvasFolder}
          handleNormalizeVaultMarkdown={vaultActions.handleNormalizeVaultMarkdown}
          triggerImmediateSave={immediateSave}
          notes={notes}
          setActiveView={guardedSetActiveView}
          onSelectNoteFromCanvas={vaultActions.handleSelectNoteFromCanvas}
          onSelectCanvas={vaultActions.handleSelectCanvas}
          provenanceTaxonomy={provenanceTaxonomy}
        />
      )}

      {!liminalOpen && activeView === "rules" && (
        <RulesView
          rulesByFolder={rulesByFolder}
          collapsedFolders={collapsedFolders}
          setCollapsedFolders={setCollapsedFolders}
          setContextMenu={setContextMenu}
          activeFolderDropdown={null}
          setActiveFolderDropdown={() => {}}
          renderFolderDropdown={renderFolderDropdown}
          selectedRuleId={selectedRuleId}
          setSelectedRuleId={setSelectedRuleId}
          isEditingRule={isEditingRule}
          setIsEditingRule={setIsEditingRule}
          handleNewRule={() => setShowNewRuleModal(true)}
          handleNewRuleFolder={handleNewRuleFolder}
          handleInsertRuleImage={handleInsertRuleImage}
          handleDeleteRule={vaultActions.handleDeleteRule}
          editRuleTitle={editRuleTitle}
          setEditRuleTitle={setEditRuleTitle}
          editRulePath={editRulePath}
          setEditRulePath={setEditRulePath}
          editRuleCategory={editRuleCategory}
          setEditRuleCategory={setEditRuleCategory}
          editRuleSource={editRuleSource}
          setEditRuleSource={setEditRuleSource}
          editRuleContent={editRuleContent}
          setEditRuleContent={setEditRuleContent}
          currentRule={currentRule}
          renderMarkdown={renderMarkdown}
        />
      )}

      {!liminalOpen && activeView === "ai" && (
        <AiView
          currentChatMessages={agent.currentChatMessages}
          chatInput={agent.chatInput}
          setChatInput={agent.setChatInput}
          handleSendChatMessage={agent.handleSendChatMessage}
        />
      )}

      {!liminalOpen && activeView === "trash" && (
        <TrashView
          trashedNotes={trashedNotes}
          handleEmptyTrash={vaultActions.handleEmptyTrash}
          handleRestoreNote={restoreNote}
          handleDeleteTrashedNote={vaultActions.handleDeleteTrashedNote}
        />
      )}

      {!liminalOpen && activeView === "character-sheets" && (
        <CharacterSheetView
          vaultPath={vaultPath}
          alert={alert}
          onOpenNote={(noteId) => {
            guardedSetSelectedNoteId(noteId);
            guardedSetActiveView("vault");
          }}
        />
      )}

      {!liminalOpen && activeView === "map" && (
        <MapBuilderView
          vaultPath={vaultPath}
          mapRelPath="Maps/Active_Map.canvas"
          alert={alert}
        />
      )}

      {!liminalOpen && activeView === "graph" && (
        <EntityGraphView
          notes={notes}
          noteTypes={noteTypes}
          provenanceTaxonomy={provenanceTaxonomy}
          onOpenNote={(noteId) => {
            guardedSetSelectedNoteId(noteId);
            guardedSetActiveView("vault");
          }}
        />
      )}

      {!liminalOpen && activeView === "timeline" && (
        <TimelineView
          notes={notes}
          onOpenNote={(noteId) => {
            guardedSetSelectedNoteId(noteId);
            guardedSetActiveView("vault");
          }}
        />
      )}

      {!liminalOpen && activeView === "settings" && (
        <SettingsView
          register={register}
          handleSubmit={handleSubmit}
          onSubmit={handleSaveSettingsCb}
          errors={errors}
          isDirty={isDirty}
          isValid={isValid}
          theme={theme}
          setTheme={setTheme}
          watch={watch}
          setValue={setValue}
          vaultPath={vaultPath}
          pluginsList={pluginsList}
        />
      )}

      <ContextMenu
        menu={contextMenu}
        onNoteTrash={vaultActions.handleTrashNote}
        onFolderTrash={handleTrashFolder}
        onRuleDelete={vaultActions.handleDeleteRule}
        onClose={() => setContextMenu(null)}
      />

      <NewRuleModal
        open={showNewRuleModal}
        onClose={() => setShowNewRuleModal(false)}
        onSave={(folder, title) => {
          if (title.trim()) {
            const newId = `rule-${Date.now()}`;
            const newRule: RuleEntry = {
              id: newId,
              title: title.trim(),
              path: `${folder}/${title.trim()}.md`,
              category: folder.split("/")[0] || "General",
              source: "Homebrew",
              content: `# ${title.trim()}\n\nWrite your rule details and mechanics here...`,
            };
            setRules((prev: RuleEntry[]) => [...prev, newRule]);
            setSelectedRuleId(newId);
            setIsEditingRule(true);
            guardedSetActiveView("rules");
          }
          setShowNewRuleModal(false);
        }}
      />

      <NewVaultModal
        open={showNewVaultModal}
        onClose={() => setShowNewVaultModal(false)}
        currentCanvasFolder={currentCanvasFolder}
      />

      <ConfirmModal
        open={confirmDialog.open}
        message={confirmDialog.message}
        onCancel={() => setConfirmDialog({ open: false, message: "" })}
        onConfirm={() => {
          pendingConfirm?.();
          setPendingConfirm(null);
          setConfirmDialog({ open: false, message: "" });
        }}
      />

      <PromptModal
        open={promptDialog.open}
        message={promptDialog.message}
        defaultValue={promptDialog.defaultValue}
        onCancel={() => {
          promptDialog.resolve(null);
          setPromptDialog({ open: false, message: "", defaultValue: "", resolve: () => {} });
        }}
        onSubmit={(value) => {
          promptDialog.resolve(value);
          setPromptDialog({ open: false, message: "", defaultValue: "", resolve: () => {} });
        }}
      />

      <AlertModal
        open={alertDialog.open}
        message={alertDialog.message}
        onClose={() => setAlertDialog({ open: false, message: "" })}
      />

      <IngestModal
        open={ingestDialog.open}
        fileName={ingestDialog.fileName}
        onSelect={(mode) => {
          ingestDialog.onSelect?.(mode);
        }}
        onCancel={() =>
          setIngestDialog({ open: false, fileName: "", onSelect: null })
        }
      />

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
    </AppShell>
  );
}

export default App;
