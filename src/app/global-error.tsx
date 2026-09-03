"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#edf2e9", color: "#0b342b" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section style={{ width: "min(100%, 560px)", padding: 40, borderRadius: 28, background: "#fffffc", boxShadow: "0 24px 70px rgba(11,52,43,.12)" }}>
            <h1 style={{ fontSize: 42, letterSpacing: "-.04em" }}>Lifetime needs a refresh.</h1>
            <p style={{ lineHeight: 1.6 }}>Your records have not been deleted. Reload the application to reconnect securely.</p>
            <button onClick={reset} style={{ minHeight: 48, padding: "0 20px", border: 0, borderRadius: 14, color: "white", background: "#0b4a3b", fontWeight: 800 }}>Reload Lifetime</button>
          </section>
        </main>
      </body>
    </html>
  );
}
