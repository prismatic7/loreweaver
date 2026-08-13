import { zodResolver } from "@hookform/resolvers/zod";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

export const settingsSchema = z.object({
  allow_local_providers: z.boolean(),
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
  tts_base_url: z.union([
    z.string().url("Must be a valid URL"),
    z.literal(""),
  ]),

  stt_provider: z.string().min(1, "Provider is required"),
  stt_api_key: z.string(),
  stt_base_url: z.string(),
});

export type SettingsForm = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: SettingsForm = {
  allow_local_providers: true,
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
  tts_base_url: "",

  stt_provider: "local",
  stt_api_key: "",
  stt_base_url: "",
};

export function useSettings() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [settingsTab, setSettingsTab] = useState<
    "build" | "contributors" | "licenses" | "profile"
  >("build");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty, isValid },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: DEFAULT_SETTINGS,
  });

  const loadSettings = useCallback(async () => {
    try {
      const settings = await invoke<Partial<SettingsForm>>("load_settings");
      if (settings) {
        reset({
          allow_local_providers:
            settings.allow_local_providers ??
            DEFAULT_SETTINGS.allow_local_providers,
          llm_provider: settings.llm_provider || DEFAULT_SETTINGS.llm_provider,
          llm_model: settings.llm_model || DEFAULT_SETTINGS.llm_model,
          llm_api_key: settings.llm_api_key || "",
          llm_base_url: settings.llm_base_url || DEFAULT_SETTINGS.llm_base_url,

          embed_provider:
            settings.embed_provider || DEFAULT_SETTINGS.embed_provider,
          embed_model: settings.embed_model || DEFAULT_SETTINGS.embed_model,
          embed_api_key: settings.embed_api_key || "",
          embed_base_url: settings.embed_base_url || "",

          image_provider:
            settings.image_provider || DEFAULT_SETTINGS.image_provider,
          image_model: settings.image_model || "",
          image_api_key: settings.image_api_key || "",
          image_base_url: settings.image_base_url || "",

          tts_provider: settings.tts_provider || DEFAULT_SETTINGS.tts_provider,
          tts_api_key: settings.tts_api_key || "",
          tts_voice: settings.tts_voice || DEFAULT_SETTINGS.tts_voice,
          tts_base_url: settings.tts_base_url || "",

          stt_provider: settings.stt_provider || DEFAULT_SETTINGS.stt_provider,
          stt_api_key: settings.stt_api_key || "",
          stt_base_url: settings.stt_base_url || "",
        });
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  }, [reset]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const handleSaveSettings = useCallback(
    async (data: SettingsForm, alert: (message: string) => void) => {
      try {
        await invoke("save_settings", { settings: data });
        reset(data);
        alert("Configuration settings saved successfully!");
      } catch (err) {
        alert("Failed to save settings: " + err);
        throw err;
      }
    },
    [reset]
  );

  const llmProvider = watch("llm_provider");
  const llmModel = watch("llm_model");
  const llmApiKey = watch("llm_api_key");
  const llmBaseUrl = watch("llm_base_url");
  const imageProvider = watch("image_provider");
  const imageModel = watch("image_model");
  const imageApiKey = watch("image_api_key");
  const imageBaseUrl = watch("image_base_url");
  const ttsProvider = watch("tts_provider");
  const ttsApiKey = watch("tts_api_key");
  const sttProvider = watch("stt_provider");
  const sttApiKey = watch("stt_api_key");
  const ttsBaseUrl = watch("tts_base_url");
  const sttBaseUrl = watch("stt_base_url");

  return {
    theme,
    setTheme,
    settingsTab,
    setSettingsTab,
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
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
    ttsBaseUrl,
    sttProvider,
    sttApiKey,
    sttBaseUrl,
  };
}
