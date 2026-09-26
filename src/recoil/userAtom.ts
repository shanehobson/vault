import { AuthUser } from "aws-amplify/auth";
import { atom } from "recoil";

export const userAtom = atom<AuthUser | null>({
  key: "userAtom",
  default: null,
});
