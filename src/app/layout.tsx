import type { Metadata } from "next";
import InteractionMotion from "@/components/InteractionMotion";
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
      <body><InteractionMotion />{children}</body>
    </html>
  );
}
