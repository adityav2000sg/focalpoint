import LegalPage from "@/components/LegalPage";

export default function PrivacyPage() {
  return <LegalPage eyebrow="Privacy" title="Your finances deserve plain language.">
    <h2>What Lifetime stores</h2>
    <p>Lifetime stores your profile, accounts, transactions, goals, plans, recurring payments, and review inbox in the configured Supabase project. Sign-in identifiers come from Google or Apple through Supabase Auth. The app does not receive your identity-provider password.</p>
    <h2>Personal and Together</h2>
    <p>Personal records are restricted to their owner by database row-level rules. Records deliberately marked Together are readable and editable by active members of that Together space. The Supabase project administrator can administer the hosted database; this is protected access, not end-to-end or zero-knowledge encryption.</p>
    <h2>Optional AI processing</h2>
    <p>AI Coach and reliable voice transcription are separate controls and both are off by default. If you enable AI Coach, text questions and the financial context needed to answer them may be sent to the configured Qwen service. If you enable reliable voice, only recordings you deliberately make and your chosen pronunciation vocabulary are sent after you stop recording. Lifetime does not write voice recordings to its database and does not allow AI to move money or change a record without your review.</p>
    <h2>Your controls</h2>
    <p>You can export a portable JSON backup, turn AI off, clear finance records, leave or close Together, and permanently delete your account from Settings. Deletion removes the authentication account and data owned by it; shared information may remain where another member is the owner.</p>
    <h2>Operational data</h2>
    <p>Hosting and database providers may process security logs, IP addresses, and device information to operate and protect the service. Lifetime does not sell financial data or use it for advertising.</p>
  </LegalPage>;
}
