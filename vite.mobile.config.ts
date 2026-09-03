import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    root: path.resolve(process.cwd(), "mobile"),
    publicDir: path.resolve(process.cwd(), "public"),
    plugins: [react()],
    resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
    define: {
      __SUPABASE_URL__: JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL || ""),
      __SUPABASE_KEY__: JSON.stringify(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""),
      __SITE_URL__: JSON.stringify((env.NEXT_PUBLIC_SITE_URL || "https://myfocalpoint.netlify.app").replace(/\/$/, "")),
    },
    build: {
      outDir: path.resolve(process.cwd(), "mobile-dist"),
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
