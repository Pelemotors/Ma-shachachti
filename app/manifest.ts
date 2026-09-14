import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "מה שכחתי?",
    short_name: "מה שכחתי?",
    description: "עוזר אישי לבית ולמשימות",
    start_url: "/app",
    display: "standalone",
    background_color: "#FAF9F7",
    theme_color: "#315C4C",
    lang: "he",
    dir: "rtl",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
