import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "مسابقة عصومي",
    short_name: "مسابقة",
    description: "منصة تفاعلية لإدارة التحديات والمسابقات المباشرة.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#070314",
    theme_color: "#070314",
    lang: "ar",
    dir: "rtl",
    categories: ["games", "entertainment", "education"],
    icons: [
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/app-icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
