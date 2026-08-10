import { useState, useCallback } from "react";

export interface UseDialogsReturn {
  confirmDialog: { open: boolean; message: string };
  setConfirmDialog: (dialog: { open: boolean; message: string }) => void;
  promptDialog: {
    open: boolean;
    message: string;
    defaultValue: string;
    resolve: (value: string | null) => void;
  };
  setPromptDialog: (dialog: {
    open: boolean;
    message: string;
    defaultValue: string;
    resolve: (value: string | null) => void;
  }) => void;
  alertDialog: { open: boolean; message: string };
  setAlertDialog: (dialog: { open: boolean; message: string }) => void;
  ingestDialog: {
    open: boolean;
    fileName: string;
    onSelect: ((mode: "text" | "ai") => void) | null;
  };
  setIngestDialog: (dialog: {
    open: boolean;
    fileName: string;
    onSelect: ((mode: "text" | "ai") => void) | null;
  }) => void;
  pendingConfirm: (() => void) | null;
  setPendingConfirm: (fn: (() => void) | null) => void;
  alert: (message: string) => void;
  showPrompt: (message: string, defaultValue?: string) => Promise<string | null>;
  confirm: (message: string, onConfirm: () => void) => void;
  closeAll: () => void;
}

export function useDialogs(): UseDialogsReturn {
  const [pendingConfirm, setPendingConfirm] = useState<(() => void) | null>(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, message: "" });
  const [promptDialog, setPromptDialog] = useState({
    open: false,
    message: "",
    defaultValue: "",
    resolve: (_value: string | null) => {},
  });
  const [alertDialog, setAlertDialog] = useState({ open: false, message: "" });
  const [ingestDialog, setIngestDialog] = useState<{
    open: boolean;
    fileName: string;
    onSelect: ((mode: "text" | "ai") => void) | null;
  }>({ open: false, fileName: "", onSelect: null });

  const alert = useCallback((message: string) => {
    setAlertDialog({ open: true, message });
  }, []);

  const showPrompt = useCallback(
    (message: string, defaultValue?: string): Promise<string | null> =>
      new Promise((resolve) => {
        setPromptDialog({
          open: true,
          message,
          defaultValue: defaultValue || "",
          resolve,
        });
      }),
    [],
  );

  const confirm = useCallback(
    (message: string, onConfirm: () => void) => {
      setPendingConfirm(() => onConfirm);
      setConfirmDialog({ open: true, message });
    },
    [],
  );

  const closeAll = useCallback(() => {
    setConfirmDialog({ open: false, message: "" });
    setPromptDialog({ open: false, message: "", defaultValue: "", resolve: () => {} });
    setAlertDialog({ open: false, message: "" });
    setIngestDialog({ open: false, fileName: "", onSelect: null });
    setPendingConfirm(null);
  }, []);

  return {
    confirmDialog,
    setConfirmDialog,
    promptDialog,
    setPromptDialog,
    alertDialog,
    setAlertDialog,
    ingestDialog,
    setIngestDialog,
    pendingConfirm,
    setPendingConfirm,
    alert,
    showPrompt,
    confirm,
    closeAll,
  };
}
