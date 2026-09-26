import { useCallback, useMemo, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { toast } from "react-toastify";
import { useApiClient } from "./useApiClient";

/**
 * Selection for the timeline. A Set rather than the array the old grid used: with ~18k
 * tiles on one page, an `includes` per tile per render is the difference between a
 * smooth scroll and a stuttering one.
 */
export function useLibrarySelection(onDeleted: (mediaIds: string[]) => void) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const { deleteFiles } = useApiClient();

  const toggleSelection = useCallback((mediaId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(mediaId)) next.add(mediaId);
      return next;
    });
  }, []);

  /** "Select all" on a month header — or clear those same items if they're all on. */
  const toggleMany = useCallback((mediaIds: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = mediaIds.length > 0 && mediaIds.every((id) => next.has(id));
      mediaIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const deleteSelected = useCallback(async () => {
    if (selected.size === 0) return;
    const ids = [...selected];
    setIsDeleting(true);
    try {
      const userId = (await fetchAuthSession()).userSub;
      await deleteFiles(userId!, ids);
      onDeleted(ids);
      setSelected(new Set());
      toast.success(`Deleted ${ids.length} item${ids.length === 1 ? "" : "s"}.`);
    } catch {
      toast.error("Failed to delete. Nothing was removed.");
    } finally {
      setIsDeleting(false);
    }
  }, [selected, deleteFiles, onDeleted]);

  return useMemo(
    () => ({
      selected,
      count: selected.size,
      selectionMode: selected.size > 0,
      toggleSelection,
      toggleMany,
      clearSelection,
      deleteSelected,
      isDeleting,
    }),
    [selected, toggleSelection, toggleMany, clearSelection, deleteSelected, isDeleting]
  );
}
