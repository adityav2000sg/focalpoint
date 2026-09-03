import Link from "next/link";
import { Leaf } from "lucide-react";

export default function LegalPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <Link className="legal-brand" href="/"><span><Leaf size={18} /></span> LIFETIME</Link>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="legal-updated">Effective 3 September 2026</p>
        <div className="legal-copy">{children}</div>
        <Link className="secondary-button legal-button" href="/">Back to Lifetime</Link>
      </article>
    </main>
  );
}
