import React from "react";
import { CampaignNote } from "../types";
import { Trash2, RotateCcw } from "lucide-react";

export interface TrashViewProps {
  trashedNotes: CampaignNote[];
  handleEmptyTrash: () => void;
  handleRestoreNote: (path: string) => void;
  handleDeleteTrashedNote: (path: string) => void;
}

export const TrashView: React.FC<TrashViewProps> = ({
  trashedNotes,
  handleEmptyTrash,
  handleRestoreNote,
  handleDeleteTrashedNote,
}) => {
  return (
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

          {trashedNotes.length > 0 && (
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

        {trashedNotes.length === 0 ? (
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
              Any deleted campaign notes will appear here for easy
              recovery.
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
                          Path:{" "}
                          <code>
                            {(note.frontmatter?.original_path as string) ||
                              note.path}
                          </code>
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
          </div>
        )}
      </div>
    </div>
  );
};
