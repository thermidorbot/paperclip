import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "../lib/utils";

interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}

/**
 * Click-to-edit text field. Enter saves, Escape cancels.
 */
export function InlineEdit({ value, onSave, className, inputClassName, placeholder }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    }
    setEditing(false);
  }, [draft, value, onSave]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  if (!editing) {
    return (
      <span
        className={cn("cursor-text hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors", className)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        {value || <span className="text-muted-foreground">{placeholder ?? "Untitled"}</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "w-full bg-transparent border border-ring rounded px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring",
        inputClassName,
      )}
      placeholder={placeholder}
    />
  );
}
