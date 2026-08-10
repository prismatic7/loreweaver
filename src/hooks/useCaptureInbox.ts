import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WebClip } from "../types";

interface CaptureInboxDeps {
  alert: (message: string) => void;
  confirm: (message: string, onConfirm: () => void) => void;
}

export interface CaptureInboxState {
  captureTitle: string;
  setCaptureTitle: (value: string) => void;
  captureContent: string;
  setCaptureContent: (value: string) => void;
  captureUrl: string;
  setCaptureUrl: (value: string) => void;
  captureSourceType: string;
  setCaptureSourceType: (value: string) => void;
  isClipping: boolean;
  clipResult: WebClip | null;
  handleClipUrl: () => void;
  handleSaveClipAsNote: () => void;
  handleSaveCapture: () => void;
  handleFileDrop: (file: File) => void;
  clearCapture: () => void;
}

/**
 * Capture Inbox — the "shoggoth's mouth". Accepts text, paste, URL clips, and
 * file drops, and lands them as notes via the backend `capture_note` command.
 */
export const useCaptureInbox = (deps: CaptureInboxDeps): CaptureInboxState => {
  const { alert, confirm } = deps;

  const [captureTitle, setCaptureTitle] = useState("");
  const [captureContent, setCaptureContent] = useState("");
  const [captureUrl, setCaptureUrl] = useState("");
  const [captureSourceType, setCaptureSourceType] = useState("history");
  const [isClipping, setIsClipping] = useState(false);
  const [clipResult, setClipResult] = useState<WebClip | null>(null);

  const clearCapture = useCallback(() => {
    setCaptureTitle("");
    setCaptureContent("");
    setCaptureUrl("");
    setClipResult(null);
  }, []);

  const handleClipUrl = useCallback(() => {
    const url = captureUrl.trim();
    if (!url) {
      alert("Enter a URL to clip.");
      return;
    }
    setIsClipping(true);
    setClipResult(null);
    invoke<WebClip>("clip_webpage", { url })
      .then((clip) => {
        setClipResult(clip);
        if (!captureTitle && clip.title) setCaptureTitle(clip.title);
      })
      .catch((err) => {
        alert("Failed to clip webpage: " + err);
      })
      .finally(() => {
        setIsClipping(false);
      });
  }, [captureUrl, captureTitle, alert]);

  const handleSaveClipAsNote = useCallback(() => {
    if (!clipResult) return;
    const title = captureTitle.trim() || clipResult.title || "Web Clip";
    const content = clipResult.markdown || captureContent;
    confirm(`Save "${title}" as a note?`, () => {
      invoke<string>("capture_note", {
        title,
        content,
        sourceType: captureSourceType,
        sourceTitle: clipResult.title,
        sourceAuthor: clipResult.site,
        sourceUrl: clipResult.url,
        target: "liminal",
      })
        .then(() => {
          alert("Note saved.");
          clearCapture();
        })
        .catch((err) => {
          alert("Failed to save note: " + err);
        });
    });
  }, [clipResult, captureTitle, captureContent, captureSourceType, confirm, alert, clearCapture]);

  const handleSaveCapture = useCallback(() => {
    const title = captureTitle.trim();
    const content = captureContent.trim();
    if (!title && !content) {
      alert("Enter a title and/or content to save as a note.");
      return;
    }
    invoke<string>("capture_note", {
      title: title || "Untitled Capture",
      content,
      sourceType: captureSourceType || null,
      sourceUrl: captureUrl.trim() || null,
      target: "liminal",
    })
      .then(() => {
        alert("Note saved.");
        clearCapture();
      })
      .catch((err) => {
        alert("Failed to save note: " + err);
      });
  }, [captureTitle, captureContent, captureUrl, captureSourceType, alert, clearCapture]);

  const handleFileDrop = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = String(event.target?.result || "");
        setCaptureContent((prev) => (prev ? `${prev}\n\n${text}` : text));
        if (!captureTitle) setCaptureTitle(file.name.replace(/\.[^.]+$/, ""));
      };
      reader.readAsText(file);
    },
    [captureTitle],
  );

  return {
    captureTitle,
    setCaptureTitle,
    captureContent,
    setCaptureContent,
    captureUrl,
    setCaptureUrl,
    captureSourceType,
    setCaptureSourceType,
    isClipping,
    clipResult,
    handleClipUrl,
    handleSaveClipAsNote,
    handleSaveCapture,
    handleFileDrop,
    clearCapture,
  };
};
