import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fallbackRoll } from "../utils/dice";

interface SessionToolsDeps {
  pluginsList: Array<{ id: string; name: string; active?: boolean }>;
  alert: (message: string) => void;
  imageProvider: string;
  imageModel: string;
  imageApiKey: string;
  imageBaseUrl: string;
  ttsProvider: string;
  ttsApiKey: string;
}

export const useSessionTools = (deps: SessionToolsDeps) => {
  const {
    pluginsList,
    alert,
    imageProvider,
    imageModel,
    imageApiKey,
    imageBaseUrl,
    ttsProvider,
    ttsApiKey,
  } = deps;

  const [scratchpadText, setScratchpadText] = useState(() => {
    return (
      localStorage.getItem("loreweaver_scratchpad") ||
      "## GM Session Scratchpad\n- Active Party: \n- Notes: \n- Combat Tracker: \n"
    );
  });

  useEffect(() => {
    localStorage.setItem("loreweaver_scratchpad", scratchpadText);
  }, [scratchpadText]);

  const [diceHistory, setDiceHistory] = useState<string[]>([]);
  const [diceNotation, setDiceNotation] = useState<string>("2d20+5");

  const [imagePrompt, setImagePrompt] = useState(
    "A detailed portrait of Lirael, the elven mage",
  );
  const [imageStyle, setImageStyle] = useState("Fantasy Portrait");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string>("");

  const [ttsText, setTtsText] = useState("");
  const [isGeneratingSpeech, setIsGeneratingSpeech] = useState(false);
  const [generatedSpeechUrl, setGeneratedSpeechUrl] = useState<string>("");

  const rollDiceNotation = (notation: string) => {
    if (!notation.trim()) return;
    const hasDicePlugin = pluginsList.some(
      (p) => p.id === "dice-roller" && p.active,
    );
    const addHistory = (text: string) => {
      setDiceHistory((prev) => [text, ...prev.slice(0, 15)]);
    };

    if (hasDicePlugin) {
      invoke<string>("execute_plugin_hook", {
        pluginId: "dice-roller",
        hook: "roll_notation",
        payload: notation,
      })
        .then((resultStr) => {
          const res = JSON.parse(resultStr);
          addHistory(`${res.notation}: ${res.rolls} = ${res.total}`);
        })
        .catch(() => {
          addHistory(fallbackRoll(notation));
        });
    } else {
      addHistory(fallbackRoll(notation));
    }
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

  return {
    scratchpadText,
    setScratchpadText,
    diceHistory,
    setDiceHistory,
    diceNotation,
    setDiceNotation,
    rollDiceNotation,
    imagePrompt,
    setImagePrompt,
    imageStyle,
    setImageStyle,
    isGeneratingImage,
    generatedImageUrl,
    handleGenerateImage,
    ttsText,
    setTtsText,
    isGeneratingSpeech,
    generatedSpeechUrl,
    handleGenerateSpeech,
  };
};
