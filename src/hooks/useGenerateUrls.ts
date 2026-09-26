import { fetchAuthSession } from "aws-amplify/auth";
import { Media } from "../recoil/mediaAtoms";
import { UploadFileInput } from "../types/media";
import { useApiClient } from "./useApiClient";

/**
 * Function to generate pre-signed URLs for uploading media.
 * @param files - The array of files to upload.
 * @returns A promise resolving to an object with the pre-signed URLs.
 */
export const useGenerateUrls = () => {
  const { apiCall: apiClient } = useApiClient(); // Get the API client

  const generateUrls = async (
    files: UploadFileInput[]
  ): Promise<{ urls: Media[] }> => {
    const userId = (await fetchAuthSession()).userSub;

    // Use the apiClient to make the POST request
    const data = await apiClient<{
      body: { urls: Media[] };
      statusCode: number;
    }>("/media", {
      method: "POST",
      body: JSON.stringify({ files, userId }),
      headers: { "Content-Type": "application/json" },
    });

    if (data.statusCode !== 200) {
      throw new Error("Failed to generate pre-signed URLs");
    }

    return data.body;
  };

  return generateUrls;
};
