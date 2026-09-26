import { atom } from "recoil";

export interface Media {
  fileKey: string;
  uploadUrl: string;
}

export interface FileInput {
  fileName: string;
  fileType: string;
}

export const mediaListState = atom<Media[]>({
  key: "mediaListState",
  default: [],
});

export const isLoadingState = atom<boolean>({
  key: "isLoadingState",
  default: false,
});
