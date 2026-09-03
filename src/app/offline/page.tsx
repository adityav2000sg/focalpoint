import Link from "next/link";
import { CloudOff, Leaf } from "lucide-react";

export default function OfflinePage() {
  return <main className="legal-page join-page"><section className="legal-card offline-card"><span className="legal-brand"><span><Leaf size={18} /></span> LIFETIME</span><CloudOff size={34} /><p className="eyebrow">On-device mode</p><h1>You’re offline.</h1><p>Your last open workspace remains on this device, and queued edits retry when the connection returns. Reconnect before reloading the finance dashboard.</p><Link className="primary-button legal-button" href="/">Try again</Link></section></main>;
}
