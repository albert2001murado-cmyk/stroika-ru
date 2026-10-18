import type { MetadataRoute } from "next";
import { BRAND_NAME } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: "Всё для стройки в одном месте: материалы, услуги и спецтехника.",
    lang: "ru",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0057ff",
  };
}
