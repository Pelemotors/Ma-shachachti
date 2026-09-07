import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "מה שכחתי?",
    short_name: "מה שכחתי?",
    lang: "he",
    dir: "rtl",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#FAF7F4",
    theme_color: "#9C4565",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
