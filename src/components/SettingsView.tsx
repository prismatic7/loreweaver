import { invoke } from "@tauri-apps/api/core";
import React, { useState } from "react";
import {
  Brain,
  FileText,
  Image as ImageIcon,
  AudioLines,
  Mic,
  Laptop,
  Cloud,
  Palette,
  Settings as SettingsIcon,
  RefreshCw,
  Recycle,
  Plug,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import {
    FieldErrors,
    UseFormHandleSubmit,
    UseFormRegister,
} from "react-hook-form";

export interface SettingsViewProps {
  register: UseFormRegister<any>;
  handleSubmit: UseFormHandleSubmit<any>;
  onSubmit: (data: any) => void;
  errors: FieldErrors<any>;
  isDirty: boolean;
  isValid: boolean;
  isTestingConnection?: boolean;
  theme?: "dark" | "light";
  setTheme?: (theme: "dark" | "light") => void;
  testSettingsConnection?: (provider: string) => void;
  watch: any;
  setValue: any;
  vaultPath?: string;
  pluginsList?: Array<{ id: string; name: string; active?: boolean }>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  register,
  handleSubmit,
  onSubmit,
  errors,
  isDirty,
  isValid,
  isTestingConnection: isTestingConnectionProp,
  theme: _theme,
  setTheme: _setTheme,
  testSettingsConnection,
  watch,
  setValue,
  vaultPath,
  pluginsList = [],
}) => {
  const [activeConfigTab, setActiveConfigTab] = useState<
    "llm" | "embed" | "image" | "tts" | "stt"
  >("llm");
  const [localIsTesting, setLocalIsTesting] = useState(false);
  const [testConnectionResult, setTestConnectionResult] = useState<
    string[] | null
  >(null);
  const [testConnectionError, setTestConnectionError] = useState<string | null>(
    null
  );
  const [isReindexing, setIsReindexing] = useState(false);

  const isTestingConnection = isTestingConnectionProp ?? localIsTesting;

  const getFieldName = (cap: string, suffix: string): string => {
    if (cap === "tts" && suffix === "model") return "tts_voice";
    return `${cap}_${suffix}`;
  };

  const onProviderSelect = (
    tab: "llm" | "embed" | "image" | "tts" | "stt",
    providerId: string
  ) => {
    const providerField = `${tab}_provider`;
    const baseUrlField = `${tab}_base_url`;
    setValue(providerField, providerId, { shouldDirty: true });

    const baseUrlDefaults: Record<string, Record<string, string>> = {
      llm: {
        ollama: "http://localhost:11434",
        openai: "https://api.openai.com",
        gemini: "https://generativelanguage.googleapis.com",
      },
      embed: {
        ollama: "http://localhost:11434",
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

  const handleTestConnection = () => {
    const provider = watch(getFieldName(activeConfigTab, "provider"));

    if (testSettingsConnection) {
      testSettingsConnection(provider);
      return;
    }

    setLocalIsTesting(true);
    setTestConnectionResult(null);
    setTestConnectionError(null);

    const baseUrl =
      activeConfigTab === "tts" || activeConfigTab === "stt"
        ? ""
        : watch(getFieldName(activeConfigTab, "base_url")) || "";

    const apiKey = watch(getFieldName(activeConfigTab, "api_key")) || "";

    invoke<string[]>("test_provider_connection", {
      provider,
      baseUrl,
      apiKey: apiKey || null,
    })
      .then((models) => {
        setLocalIsTesting(false);
        if (models && models.length > 0) {
          setTestConnectionResult(models);
        } else {
          setTestConnectionResult([]);
          setTestConnectionError(
            "Connection succeeded, but no models were returned by the provider."
          );
        }
      })
      .catch((err) => {
        setLocalIsTesting(false);
        setTestConnectionError(err.toString());
      });
  };

  const handleReindex = () => {
    if (isReindexing) return;
    setIsReindexing(true);
    invoke("reindex_vault")
      .then(() => {
        alert("Vault reindexed successfully!");
      })
      .catch((err) => {
        alert("Reindex failed: " + err);
      })
      .finally(() => {
        setIsReindexing(false);
      });
  };

  return (
    <form
      className="view-container"
      data-od-id="settings-view"
      onSubmit={handleSubmit(onSubmit)}
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
            data-od-id="settings-save-config-btn"
          >
            Save Configuration
          </button>
        </div>

        {/* Section: General Workspace */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 0,
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
                borderRadius: 0,
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
                    borderRadius: 0,
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
            borderRadius: 0,
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
              Configure your local and cloud AI providers for writing, search,
              art, and voice.
            </p>
          </div>

          {/* Allow Local Providers Toggle */}
          <div
            className="settings-item"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              border: "1px solid var(--border)",
              borderRadius: 0,
              padding: "12px 14px",
              background: "var(--bg)",
            }}
          >
            <div>
              <div
                className="settings-label"
                style={{ fontSize: "13px", fontWeight: 500 }}
              >
                Allow Local / Private Providers
              </div>
              <div
                className="settings-desc"
                style={{ fontSize: "11px", color: "var(--muted)" }}
              >
                Enable connections to localhost / LAN addresses (Ollama,
                ComfyUI, etc.). Disable to only allow public cloud endpoints.
              </div>
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              <input
                type="checkbox"
                {...register("allow_local_providers")}
                data-od-id="settings-allow-local-providers"
              />
              {watch("allow_local_providers") ? "Enabled" : "Disabled"}
            </label>
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
                { id: "llm", name: "Language Model", icon: <Brain size={12} /> },
                { id: "embed", name: "Embedding", icon: <FileText size={12} /> },
                { id: "image", name: "Image Gen", icon: <ImageIcon size={12} /> },
                { id: "tts", name: "Text-to-Speech", icon: <AudioLines size={12} /> },
                { id: "stt", name: "Speech-to-Text", icon: <Mic size={12} /> },
              ].map((tab) => (
                <button
                  key={tab.id}
                  className="btn btn-sm"
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 12px",
                    borderRadius: 0,
                    background:
                      activeConfigTab === tab.id
                        ? "var(--accent)"
                        : "var(--bg)",
                    border:
                      activeConfigTab === tab.id
                        ? "1px solid var(--accent)"
                        : "1px solid var(--border)",
                    color: activeConfigTab === tab.id ? "#fff" : "var(--fg)",
                    cursor: "pointer",
                    fontWeight: 500,
                    fontSize: "11px",
                  }}
                  onClick={() => {
                    setActiveConfigTab(
                      tab.id as "llm" | "embed" | "image" | "tts" | "stt"
                    );
                    setTestConnectionResult(null);
                    setTestConnectionError(null);
                  }}
                  data-od-id={`settings-category-${tab.id}`}
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
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: "10px",
              }}
            >
              {(activeConfigTab === "llm"
                ? [
                    { id: "ollama", name: "Ollama (Local)", logo: <Laptop size={18} /> },
                    { id: "openai", name: "OpenAI (Cloud)", logo: <Cloud size={18} /> },
                    { id: "gemini", name: "Google Gemini (Cloud)", logo: <Cloud size={18} /> },
                    {
                      id: "openai-compatible",
                      name: "Custom OpenAI Compatible",
                      logo: <SettingsIcon size={18} />,
                    },
                  ]
                : activeConfigTab === "embed"
                  ? [
                      {
                        id: "local",
                        name: "Local ONNX (all-MiniLM)",
                        logo: <Laptop size={18} />,
                      },
                      { id: "ollama", name: "Ollama (Local)", logo: <Laptop size={18} /> },
                      { id: "openai", name: "OpenAI (Cloud)", logo: <Cloud size={18} /> },
                      {
                        id: "gemini",
                        name: "Google Gemini (Cloud)",
                        logo: <Cloud size={18} />,
                      },
                    ]
                  : activeConfigTab === "image"
                    ? [
                        {
                          id: "local",
                          name: "Local ComfyUI",
                          logo: <Laptop size={18} />,
                        },
                        {
                          id: "openai",
                          name: "OpenAI DALL-E",
                          logo: <Cloud size={18} />,
                        },
                        {
                          id: "stability",
                          name: "Stability AI API",
                          logo: <Palette size={18} />,
                        },
                      ]
                    : activeConfigTab === "tts"
                      ? [
                          {
                            id: "local",
                            name: "Local Native TTS",
                            logo: <Laptop size={18} />,
                          },
                          {
                            id: "openai",
                            name: "OpenAI TTS",
                            logo: <Cloud size={18} />,
                          },
                        ]
                      : [
                          {
                            id: "local",
                            name: "Local Whisper",
                            logo: <Laptop size={18} />,
                          },
                          {
                            id: "openai",
                            name: "OpenAI Whisper",
                            logo: <Cloud size={18} />,
                          },
                        ]
              ).map((item) => {
                const isSelected =
                  watch(getFieldName(activeConfigTab, "provider")) === item.id;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "14px 10px",
                      borderRadius: 0,
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
                    data-od-id={`settings-provider-${activeConfigTab}-${item.id}`}
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
            <>
              <div
                style={{
                  background: "oklch(65% 0.12 85 / 0.08)",
                  border: "1px solid var(--warn)",
                  color: "var(--warn)",
                  padding: "10px 12px",
                  borderRadius: 0,
                  fontSize: "11px",
                  lineHeight: "1.4",
                }}
              >
                <strong>DIMENSION COMPATIBILITY CAVEAT:</strong> Modifying your
                embedding provider changes the dimension length of generated
                vectors. After saving, run <strong>Reindex</strong> on your
                vault to reindex all notes.
              </div>
              <button
                className="btn"
                type="button"
                style={{
                  marginTop: "10px",
                  padding: "8px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 0,
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 500,
                }}
                onClick={handleReindex}
                disabled={isReindexing}
                data-od-id="settings-reindex-btn"
              >
                {isReindexing ? (
                  <>
                    <RefreshCw size={12} /> Reindexing...
                  </>
                ) : (
                  <>
                    <Recycle size={12} /> Reindex Vault
                  </>
                )}
              </button>
            </>
          )}

          {/* Active Configuration Details */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 0,
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
                    {...register(getFieldName(activeConfigTab, "model"))}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: "12px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 0,
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
                  {errors[getFieldName(activeConfigTab, "model")] && (
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--danger)",
                        marginTop: "4px",
                        display: "block",
                      }}
                    >
                      {
                        errors[getFieldName(activeConfigTab, "model")]
                          ?.message as string
                      }
                    </span>
                  )}
                </div>
              )}

              {activeConfigTab === "stt" && (
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
                    Local Model Path
                  </label>
                  <input
                    type="text"
                    {...register("stt_base_url")}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: "12px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 0,
                      color: "var(--fg)",
                    }}
                    placeholder="Path to sherpa-onnx model directory"
                  />
                  {errors.stt_base_url && (
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--danger)",
                        marginTop: "4px",
                        display: "block",
                      }}
                    >
                      {errors.stt_base_url?.message as string}
                    </span>
                  )}
                </div>
              )}

              {activeConfigTab !== "tts" && activeConfigTab !== "stt" && (
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
                    {...register(getFieldName(activeConfigTab, "base_url"))}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: "12px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 0,
                      color: "var(--fg)",
                    }}
                    placeholder="Provider base URL override if using proxy/local server"
                  />
                  {errors[getFieldName(activeConfigTab, "base_url")] && (
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--danger)",
                        marginTop: "4px",
                        display: "block",
                      }}
                    >
                      {
                        errors[getFieldName(activeConfigTab, "base_url")]
                          ?.message as string
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
                {...register(getFieldName(activeConfigTab, "api_key"))}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  fontSize: "12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 0,
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
                type="button"
                style={{
                  width: "100%",
                  padding: "8px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 0,
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
                data-od-id="settings-test-connection-btn"
              >
                {isTestingConnection ? (
                  <>
                    <RefreshCw size={12} /> Testing Connection...
                  </>
                ) : (
                  <>
                    <Plug size={12} /> Run Connection Test
                  </>
                )}
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
                    borderRadius: 0,
                    fontSize: "11px",
                    lineHeight: "1.4",
                  }}
                >
                  <XCircle size={12} /> <strong>Connection Failed:</strong> {testConnectionError}
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
                    <CheckCircle2 size={12} /> Connected Successfully! Available Models (Click to
                    select):
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
                            const field = getFieldName(
                              activeConfigTab,
                              "model"
                            );
                            setValue(field, modelName, {
                              shouldDirty: true,
                            });
                          }}
                          style={{
                            fontSize: "10px",
                            padding: "3px 8px",
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 0,
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
  );
};
