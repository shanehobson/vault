import { useCallback, useMemo } from "react";
import { fetchAuthSession, signOut } from "aws-amplify/auth";
import { toast } from "react-toastify";
import { FileData, LibrarySummary } from "../types/media";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
if (!API_BASE_URL) {
  throw new Error("Missing VITE_API_BASE_URL; copy .env.example to .env and fill it in.");
}

const handleMissingToken = async () => {
  toast.error("Your session has expired. Please sign in again.");
  await signOut();

  const currentPath = window.location.pathname;

  // Prevent redirect loop: Only redirect if not already on home page
  if (currentPath !== "/") {
    console.log("Token is missing. Redirecting to home...");
    window.location.href = "/";
  }
};

export const useApiClient = () => {
  // Stable identities: these end up in the dependency arrays of the library hook's
  // loaders, and a new function every render would re-fetch forever.
  const apiCall = useCallback(async <T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> => {
    const token = (await fetchAuthSession()).tokens?.idToken?.toString();

    if (!token) {
      await handleMissingToken();
      throw new Error("User is not authenticated or token is missing.");
    }

    const headers: HeadersInit = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    try {
      // Make the network request
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      // Handle response errors
      if (!response.ok) {
        let errorBody;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = { message: "Unknown error" };
        }

        // Handle 401 and 403 errors by signing out
        if (response.status === 401 || response.status === 403) {
          handleMissingToken();
          throw new Error(`Session expired: ${response.status}`);
        }

        // For other errors, display a toast message
        const errorMessage =
          errorBody.message ||
          `API request failed with status ${response.status}`;
        toast.error(errorMessage);
        throw new Error(errorMessage);
      }

      // Parse and return the response
      return response.json();
    } catch (error) {
      // Display any unexpected errors in a toast
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred.");
      throw error;
    }
  }, []);

  const deleteFiles = useCallback(async (userId: string, mediaIds: string[]) => {
    return apiCall(`/media`, {
      method: "DELETE",
      body: JSON.stringify({ userId, mediaIds }),
    });
  }, [apiCall]);

  /** Per-year/month counts for the whole library — sizes the timeline before any fetch. */
  const getSummary = useCallback(async (userId: string): Promise<LibrarySummary> => {
    const data = await apiCall<{ body: LibrarySummary }>(
      `/media?userId=${encodeURIComponent(userId)}&mode=summary`
    );
    return data.body;
  }, [apiCall]);

  /**
   * One page of media in capture-date order, newest first. `from`/`to` are `YYYYMMDD`
   * and bound the range to a single month (or whatever window the caller wants).
   */
  const listMedia = useCallback(async (params: {
    userId: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ files: FileData[]; cursor?: string }> => {
    const query = new URLSearchParams({
      userId: params.userId,
      order: "taken",
      limit: String(params.limit ?? 200),
    });
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    if (params.cursor) query.set("cursor", params.cursor);

    const data = await apiCall<{ body: { files?: FileData[]; cursor?: string | null } }>(
      `/media?${query}`
    );
    const { files, cursor } = data.body ?? {};
    if (!Array.isArray(files)) throw new Error("Invalid response format: files is not an array");
    return { files, cursor: cursor ?? undefined };
  }, [apiCall]);

  return useMemo(
    () => ({ apiCall, deleteFiles, getSummary, listMedia }),
    [apiCall, deleteFiles, getSummary, listMedia]
  );
};
