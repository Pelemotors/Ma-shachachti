import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "מה שכחתי?",
    short_name: "מה שכחתי?",
    description: "עוזר אישי לבית ולמשימות",
    start_url: "/app",
    display: "standalone",
    background_color: "#FAF9F7",
    theme_color: "#FAF9F7",
    lang: "he",
    dir: "rtl",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
