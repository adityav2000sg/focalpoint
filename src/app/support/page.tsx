import LegalPage from "@/components/LegalPage";

export default function SupportPage() {
  return <LegalPage eyebrow="Support" title="Help with Lifetime.">
    <h2>Before reporting a problem</h2>
    <p>Check the Saved indicator, confirm you are signed in with the intended email, and export a private backup from Settings before making major changes.</p>
    <h2>Sign-in and Together</h2>
    <p>Use the exact email named in a Together invitation. If an invitation fails, ask its owner to remove and resend it. Personal data never becomes shared merely because two people join Together.</p>
    <h2>Report an issue</h2>
    <p>Open an issue in the public <a href="https://github.com/adityav2000sg/focalpoint/issues">Focal Point support tracker</a>. Do not attach statements, balances, account numbers, API keys, or other private financial data.</p>
  </LegalPage>;
}
