import React, { lazy, Suspense } from "react";
import {
  BookOpen,
  ChevronRight,
  Eye,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  PenLine,
  Plus,
  Trash2,
} from "lucide-react";
import { RuleEntry } from "../types";

const MarkdownEditor = lazy(() => import("./MarkdownEditor"));

export interface RulesViewProps {
  rulesByFolder: Record<string, RuleEntry[]>;
  collapsedFolders: Record<string, boolean>;
  setCollapsedFolders: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  setContextMenu: (
    menu: {
      x: number;
      y: number;
      type: "note" | "folder" | "rule" | "rule-folder";
      targetId: string;
      path?: string;
      isRulebook?: boolean;
    } | null,
  ) => void;
  activeFolderDropdown: string | null;
  setActiveFolderDropdown: (key: string | null) => void;
  renderFolderDropdown: (
    folderName: string,
    isRulebook?: boolean,
  ) => React.ReactNode;
  selectedRuleId: string;
  setSelectedRuleId: (id: string) => void;
  isEditingRule: boolean;
  setIsEditingRule: (editing: boolean) => void;
  handleNewRule: (targetFolder?: string) => void;
  handleNewRuleFolder: () => void;
  handleInsertRuleImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDeleteRule: (ruleId: string) => void;
  editRuleTitle: string;
  setEditRuleTitle: (title: string) => void;
  editRulePath: string;
  setEditRulePath: (path: string) => void;
  editRuleCategory: string;
  setEditRuleCategory: (cat: string) => void;
  editRuleSource: string;
  setEditRuleSource: (source: string) => void;
  editRuleContent: string;
  setEditRuleContent: (content: string) => void;
  currentRule: RuleEntry | undefined;
  renderMarkdown: (content: string) => React.ReactNode;
}

export const RulesView: React.FC<RulesViewProps> = ({
  rulesByFolder,
  collapsedFolders,
  setCollapsedFolders,
  setContextMenu,
  activeFolderDropdown,
  setActiveFolderDropdown,
  renderFolderDropdown,
  selectedRuleId,
  setSelectedRuleId,
  isEditingRule,
  setIsEditingRule,
  handleNewRule,
  handleNewRuleFolder,
  handleInsertRuleImage,
  handleDeleteRule,
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
  currentRule,
  renderMarkdown,
}) => {
  return (
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
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        type: "rule-folder",
                        targetId: folderName,
                        isRulebook: true,
                      });
                    }}
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
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              type: "rule",
                              targetId: rule.id,
                            });
                          }}
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
  );
};

export default RulesView;
