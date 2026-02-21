"use client";

import { useEffect } from "react";

type UseCaptionEditorShortcutsArgs = {
  open: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectedCount: number;
  selectableCount: number;
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onDeleteSelected: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePlay: () => void;
};

export function useCaptionEditorShortcuts({
  open,
  canUndo,
  canRedo,
  selectedCount,
  selectableCount,
  onCopy,
  onPaste,
  onSelectAll,
  onDeleteSelected,
  onUndo,
  onRedo,
  onTogglePlay,
}: UseCaptionEditorShortcutsArgs) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const withMeta = event.ctrlKey || event.metaKey;

      if (withMeta && event.key.toLowerCase() === "c") {
        if (selectedCount === 0) return;
        event.preventDefault();
        onCopy();
        return;
      }

      if (withMeta && event.key.toLowerCase() === "v") {
        event.preventDefault();
        onPaste();
        return;
      }

      if (withMeta && event.key.toLowerCase() === "a") {
        if (isTypingTarget || selectableCount === 0) return;
        event.preventDefault();
        onSelectAll();
        return;
      }

      if (withMeta && event.key.toLowerCase() === "z" && !event.shiftKey) {
        if (!canUndo || isTypingTarget) return;
        event.preventDefault();
        onUndo();
        return;
      }

      if (
        withMeta &&
        ((event.key.toLowerCase() === "y" && !event.shiftKey) ||
          (event.key.toLowerCase() === "z" && event.shiftKey))
      ) {
        if (!canRedo || isTypingTarget) return;
        event.preventDefault();
        onRedo();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (isTypingTarget || selectedCount === 0) return;
        event.preventDefault();
        onDeleteSelected();
        return;
      }

      if (event.code === "Space") {
        if (isTypingTarget) return;
        event.preventDefault();
        onTogglePlay();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    onCopy,
    onDeleteSelected,
    onPaste,
    onRedo,
    onSelectAll,
    onTogglePlay,
    onUndo,
    canRedo,
    canUndo,
    open,
    selectableCount,
    selectedCount,
  ]);
}
