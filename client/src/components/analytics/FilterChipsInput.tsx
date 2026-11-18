import React, { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  parseChipsFromValue,
  validateChip,
  type FilterChipsFieldType,
} from "./filter-chips-helpers";

export type { FilterChipsFieldType } from "./filter-chips-helpers";

export interface FilterChipsInputProps {
  /**
   * Current value. Accepted as `string | string[]` so reports saved
   * before this component switched to a real array (legacy comma string)
   * still load cleanly. Outgoing changes always emit `string[]`.
   */
  value: string | string[];
  /**
   * Optional because the read-only summary surfaces (preview tab,
   * schedule dialog) render the same chip layout without an editable
   * input and have nothing to commit. Editable callers always pass
   * one.
   */
  onChange?: (next: string[]) => void;
  fieldType?: FilterChipsFieldType;
  placeholder?: string;
  testIdPrefix?: string;
  className?: string;
  /**
   * Render the chips without an input area or remove buttons. Used by
   * read-only summary surfaces (the report preview tab, the schedule
   * report dialog) to present the same chip layout the editable
   * Report Builder uses without exposing edit affordances.
   */
  readOnly?: boolean;
  /**
   * Text shown in place of the chip group when there are no chips and
   * `readOnly` is true. Defaults to an em-dash so empty list filters
   * stay visually distinct from a missing filter.
   */
  readOnlyEmptyText?: string;
}

function chipsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * A chip/tag input for the Report Builder's `in` / `not_in` filter rows.
 *
 * Emits the committed values as a real `string[]` to the parent so the
 * server receives a proper array on the wire (no more comma-joining,
 * no escape-tricks needed for chips that contain commas, and saved
 * reports are easier to read in the JSONB column). Each chip is
 * validated against the field type as it's added so bad values can't
 * sneak into the filter payload.
 */
export function FilterChipsInput({
  value,
  onChange,
  fieldType,
  placeholder,
  testIdPrefix,
  className,
  readOnly = false,
  readOnlyEmptyText = "—",
}: FilterChipsInputProps) {
  const [chips, setChips] = useState<string[]>(() => parseChipsFromValue(value));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Track the last array we emitted so an incoming `value` prop that we
  // ourselves caused doesn't get re-parsed and stomp on local edits.
  const lastEmittedRef = useRef<string[]>(parseChipsFromValue(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync chips when the parent value changes from outside (e.g. loading a
  // saved report). Skip when the change is one we just emitted ourselves.
  useEffect(() => {
    const parsed = parseChipsFromValue(value);
    if (!chipsEqual(parsed, lastEmittedRef.current)) {
      setChips(parsed);
      setDraft("");
      setError(null);
      lastEmittedRef.current = parsed;
    }
  }, [value]);

  const emit = (nextChips: string[]) => {
    lastEmittedRef.current = nextChips;
    setChips(nextChips);
    onChange?.(nextChips);
  };

  // Commit the current draft as a single chip. Commas are NOT a
  // delimiter here: now that the wire format is a real `string[]`,
  // commas inside a chip ("Smith, John") are fully supported and would
  // be a really surprising thing to silently split on. Multi-value
  // entry happens by pressing Enter once per chip (or pasting one
  // value at a time) — see `handlePaste` for the bulk-import path.
  const commit = (raw: string): { ok: boolean; remainingDraft: string } => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      setError(null);
      return { ok: true, remainingDraft: "" };
    }
    const result = validateChip(trimmed, fieldType);
    if (!result.ok) {
      setError(result.reason);
      // Keep the bad text in the input so the user can fix it.
      return { ok: false, remainingDraft: raw };
    }
    emit([...chips, result.value]);
    setError(null);
    return { ok: true, remainingDraft: "" };
  };

  // Bulk-commit a list of pre-split pieces (used by the newline-only
  // paste path). Stops at the first invalid entry and leaves the
  // remainder in the draft so the user can fix it without losing the
  // chips that already validated cleanly.
  const commitMany = (
    pieces: string[],
  ): { ok: boolean; remainingDraft: string } => {
    const cleaned = pieces.map((p) => p.trim()).filter((p) => p.length > 0);
    if (cleaned.length === 0) {
      setError(null);
      return { ok: true, remainingDraft: "" };
    }
    const accepted: string[] = [];
    for (let i = 0; i < cleaned.length; i++) {
      const result = validateChip(cleaned[i], fieldType);
      if (!result.ok) {
        setError(result.reason);
        if (accepted.length > 0) emit([...chips, ...accepted]);
        return { ok: false, remainingDraft: cleaned.slice(i).join("\n") };
      }
      accepted.push(result.value);
    }
    emit([...chips, ...accepted]);
    setError(null);
    return { ok: true, remainingDraft: "" };
  };

  const removeChip = (idx: number) => {
    const next = chips.slice();
    next.splice(idx, 1);
    emit(next);
    setError(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (draft.trim().length === 0) return;
      setDraft(commit(draft).remainingDraft);
      return;
    }
    if (event.key === "Backspace" && draft.length === 0 && chips.length > 0) {
      event.preventDefault();
      const next = chips.slice(0, -1);
      emit(next);
      setError(null);
    }
  };

  // Pasting multi-line text (one value per line) bulk-imports each
  // line as its own chip. We deliberately do NOT split on commas
  // anymore — a CSV cell like `"Smith, John"` should land as a single
  // chip. Single-line pastes fall through to the input's normal
  // onChange so the user can keep editing.
  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!/[\r\n]/.test(text)) return;
    event.preventDefault();
    const lines = text.split(/\r?\n/);
    if (draft.length > 0) {
      lines[0] = draft + lines[0];
    }
    setDraft(commitMany(lines).remainingDraft);
  };

  const handleBlur = () => {
    if (draft.trim().length === 0) {
      setError(null);
      return;
    }
    setDraft(commit(draft).remainingDraft);
  };

  // Keep the input element itself addressable by the original test-id
  // (`input-filter-value-{index}`) so existing automation that typed
  // into the old plain text input still finds an <input>. The wrapper
  // exposes a separate `-container` id for tests that need to assert on
  // the chip group as a whole.
  const wrapperTestId = testIdPrefix ? `${testIdPrefix}-container` : undefined;
  const inputTestId = testIdPrefix;

  const resolvedPlaceholder = useMemo(() => {
    if (placeholder) return placeholder;
    if (fieldType === "number") return "Type a number and press Enter";
    if (fieldType === "date") return "Type a date (YYYY-MM-DD) and press Enter";
    // Commas are no longer a delimiter (chips can contain them now), so
    // the hint text is plain "press Enter" instead of mentioning commas.
    return "Type a value and press Enter";
  }, [placeholder, fieldType]);

  if (readOnly) {
    return (
      <div
        className={cn("flex-1", className)}
        data-testid={wrapperTestId}
        data-readonly="true"
      >
        {chips.length === 0 ? (
          <span
            className="text-sm text-muted-foreground"
            data-testid={
              testIdPrefix ? `${testIdPrefix}-empty` : undefined
            }
          >
            {readOnlyEmptyText}
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip, idx) => (
              <Badge
                key={`${chip}-${idx}`}
                variant="secondary"
                className="px-2 py-0.5 text-xs"
                data-testid={
                  testIdPrefix ? `${testIdPrefix}-chip-${idx}` : undefined
                }
              >
                {chip}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex-1", className)}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm min-h-9 cursor-text",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          error && "border-destructive focus-within:ring-destructive",
        )}
        onClick={() => inputRef.current?.focus()}
        data-testid={wrapperTestId}
      >
        {chips.map((chip, idx) => (
          <Badge
            key={`${chip}-${idx}`}
            variant="secondary"
            className="gap-1 pr-1 pl-2 py-0.5 text-xs"
            data-testid={testIdPrefix ? `${testIdPrefix}-chip-${idx}` : undefined}
          >
            <span>{chip}</span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                removeChip(idx);
              }}
              aria-label={`Remove ${chip}`}
              className="rounded-full p-0.5 hover:bg-muted-foreground/20"
              data-testid={
                testIdPrefix ? `${testIdPrefix}-chip-${idx}-remove` : undefined
              }
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={handleBlur}
          placeholder={chips.length === 0 ? resolvedPlaceholder : ""}
          className="flex-1 min-w-[8rem] bg-transparent outline-none placeholder:text-muted-foreground"
          data-testid={inputTestId}
        />
      </div>
      {error ? (
        <p
          className="mt-1 text-xs text-destructive"
          role="alert"
          data-testid={testIdPrefix ? `${testIdPrefix}-error` : undefined}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
