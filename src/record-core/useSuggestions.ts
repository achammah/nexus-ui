import * as React from "react";
import type { Block, InlineChange } from "./NotionEditor";

/* useSuggestions — the accept/reject/undo engine for inline tracked changes over a
   Block[] document. Entity-agnostic: it knows nothing about objects, fields, or the
   platform — it applies a change's `original → replacement` into the document and
   tracks each change's status. The caller owns persistence (it passes the current
   `changes` in and receives the next set out) and the document (it passes `blocks` in
   and receives the folded document out).

   Two channels, deliberately separate (the document and the change-set persist
   independently): accepting folds `original → replacement` into the document via
   `onBlocksChange` AND flips the change to `accepted` via `onChangesChange`; rejecting
   or undoing an already-accepted change reverts `replacement → original` in the
   document first. This mirrors a Google-Docs "suggesting" review: the text and the
   review state move together but persist through their own paths. */

export interface Suggestion extends InlineChange {
  reason?: string;
}

const isTextBlock = (b: Block): b is Extract<Block, { text: string }> =>
  b.type !== "divider" && b.type !== "image" && b.type !== "table";

/* fold a change's original → replacement into the FIRST text block that carries the
   original (first occurrence only), leaving every other block untouched */
function applyToDoc(blocks: Block[], from: string, to: string): { next: Block[]; applied: boolean } {
  let applied = false;
  const next = blocks.map((b) => {
    if (applied || !isTextBlock(b)) return b;
    if (b.text.includes(from)) {
      applied = true;
      return { ...b, text: b.text.replace(from, to) } as Block;
    }
    return b;
  });
  return { next, applied };
}

export interface UseSuggestions {
  pending: number;
  resolved: number;
  total: number;
  accept: (id: string) => void;
  reject: (id: string) => void;
  undo: (id: string) => void;
  acceptAll: () => void;
  rejectAll: () => void;
}

export function useSuggestions(
  blocks: Block[],
  onBlocksChange: (next: Block[]) => void,
  changes: Suggestion[],
  onChangesChange: (next: Suggestion[]) => void,
): UseSuggestions {
  // read the live document/changes through refs so the callbacks stay stable across
  // renders while always acting on the latest values
  const blocksRef = React.useRef(blocks);
  blocksRef.current = blocks;
  const changesRef = React.useRef(changes);
  changesRef.current = changes;

  const setStatus = React.useCallback(
    (id: string, status: Suggestion["status"]) => {
      onChangesChange(changesRef.current.map((c) => (c.id === id ? { ...c, status } : c)));
    },
    [onChangesChange],
  );

  // put an accepted change's replacement back to its original text in the document
  const revertInDoc = React.useCallback(
    (ch: Suggestion) => {
      const { next, applied } = applyToDoc(blocksRef.current, ch.replacement, ch.original);
      if (applied) onBlocksChange(next);
    },
    [onBlocksChange],
  );

  const accept = React.useCallback(
    (id: string) => {
      const ch = changesRef.current.find((c) => c.id === id);
      if (!ch) return;
      const { next, applied } = applyToDoc(blocksRef.current, ch.original, ch.replacement);
      if (applied) onBlocksChange(next);
      setStatus(id, "accepted");
    },
    [onBlocksChange, setStatus],
  );

  const reject = React.useCallback(
    (id: string) => {
      const ch = changesRef.current.find((c) => c.id === id);
      if (!ch) return;
      if (ch.status === "accepted") revertInDoc(ch);
      setStatus(id, "rejected");
    },
    [revertInDoc, setStatus],
  );

  const undo = React.useCallback(
    (id: string) => {
      const ch = changesRef.current.find((c) => c.id === id);
      if (!ch) return;
      if (ch.status === "accepted") revertInDoc(ch);
      setStatus(id, "pending");
    },
    [revertInDoc, setStatus],
  );

  const acceptAll = React.useCallback(() => {
    let doc = blocksRef.current;
    let changed = false;
    for (const ch of changesRef.current.filter((c) => c.status === "pending")) {
      const { next, applied } = applyToDoc(doc, ch.original, ch.replacement);
      if (applied) { doc = next; changed = true; }
    }
    if (changed) onBlocksChange(doc);
    onChangesChange(changesRef.current.map((c) => (c.status === "pending" ? { ...c, status: "accepted" } : c)));
  }, [onBlocksChange, onChangesChange]);

  const rejectAll = React.useCallback(() => {
    onChangesChange(changesRef.current.map((c) => (c.status === "pending" ? { ...c, status: "rejected" } : c)));
  }, [onChangesChange]);

  const pending = changes.filter((c) => c.status === "pending").length;
  return {
    pending,
    resolved: changes.length - pending,
    total: changes.length,
    accept,
    reject,
    undo,
    acceptAll,
    rejectAll,
  };
}
