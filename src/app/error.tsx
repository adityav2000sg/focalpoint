"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="legal-page join-page">
      <section className="legal-card error-card" role="alert">
        <span className="error-mark"><AlertTriangle size={25} /></span>
        <p className="eyebrow">A temporary pause</p>
        <h1>Lifetime could not open this view.</h1>
        <p>Your saved finance data has not been removed. Try the view again, or return to your dashboard.</p>
        <div className="error-actions"><button className="primary-button" onClick={reset}><RotateCcw size={17} /> Try again</button><a className="secondary-button" href="/">Dashboard</a></div>
      </section>
    </main>
  );
}
