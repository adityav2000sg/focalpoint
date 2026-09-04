import type { Metadata } from "next";
// Self-hosted so the PWA keeps its typography offline and renders identically on every device.
// Inter carries the interface; Open Sauce One carries headings and figures.
import "@fontsource-variable/inter/wght.css";
import "@fontsource/open-sauce-one/400.css";
import "@fontsource/open-sauce-one/500.css";
import "@fontsource/open-sauce-one/600.css";
import InteractionMotion from "@/components/InteractionMotion";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import "./globals.css";

const siteTitle = "Lifetime — Finance for the life you’re building";
const siteDescription = "A voice-first Personal and Together finance hub for trusted transactions, shared money, intelligent goals, and the future you are building.";

export async function generateMetadata(): Promise<Metadata> {
  const base = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");

  return {
    metadataBase: base,
    title: siteTitle,
    description: siteDescription,
    applicationName: "Lifetime",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [{ url: "/icon-192.png", type: "image/png", sizes: "192x192" }, { url: "/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Lifetime",
    },
    openGraph: {
      title: siteTitle,
      description: siteDescription,
      type: "website",
      images: [{ url: new URL("/og-v5.png", base), width: 1200, height: 675, alt: "Lifetime voice-first finance hub" }],
    },
    twitter: {
      card: "summary_large_image",
      title: siteTitle,
      description: siteDescription,
      images: [new URL("/og-v5.png", base)],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-SG">
      <body><InteractionMotion /><ServiceWorkerRegistration />{children}</body>
    </html>
  );
}
