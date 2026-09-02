import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lifetime Finance",
    short_name: "Lifetime",
    description: "Personal and Together finance, built around real accounts and a unified ledger.",
    start_url: "/",
    display: "standalone",
    background_color: "#f0f3ec",
    theme_color: "#113b32",
    orientation: "portrait-primary",
    categories: ["finance", "productivity"],
  };
}
