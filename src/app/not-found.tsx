import Link from "next/link";
import { Leaf } from "lucide-react";

export default function NotFound() {
  return (
    <main className="legal-page join-page">
      <section className="legal-card error-card">
        <span className="error-mark"><Leaf size={25} /></span>
        <p className="eyebrow">Page not found</p>
        <h1>This part of your financial home does not exist.</h1>
        <p>The link may be old, or the page may have moved.</p>
        <Link className="primary-button legal-button" href="/">Return to Lifetime</Link>
      </section>
    </main>
  );
}
