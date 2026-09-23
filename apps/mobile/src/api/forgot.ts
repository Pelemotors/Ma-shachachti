import { apiRequest } from "./client";

export type ForgottenIcon =
  | "document"
  | "cart"
  | "doctor"
  | "phone"
  | "cake"
  | "airplane"
  | "shirt"
  | "sun"
  | "calendar"
  | "gift";

export type ForgottenItem = {
  id: string;
  title: string;
  subtitle: string | null;
  bucket: "today" | "week" | "later";
  icon: ForgottenIcon;
};

export type ForgottenSection = {
  id: "today" | "week" | "later";
  title: string;
  items: ForgottenItem[];
};

export type ForgottenSurface = {
  date: string;
  sections: ForgottenSection[];
};

export async function getForgotten() {
  return apiRequest<ForgottenSurface>("/api/forgot");
}
