import { getAuthenticatedUser } from "@/lib/supabase/server";
import { checkAiAccess } from "@/lib/server/aiAccess";
import { isTrustedMutation } from "@/lib/server/requestSecurity";

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return Response.json({ error: "Cross-site request blocked" }, { status: 403 });
  const { supabase, user } = await getAuthenticatedUser(request);
  if (!supabase || !user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const access = await checkAiAccess(supabase, user, "voice");
  if (!access.allowed) return Response.json({ error: access.message }, { status: access.message.startsWith("Hourly") ? 429 : 403 });
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl = (process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  if (!apiKey) return Response.json({ error: "Qwen speech is not configured" }, { status: 503 });
  try {
    const payload = await request.json() as { audio?: string; locale?: string; lexicon?: string[] };
    if (!payload.audio?.startsWith("data:audio/") || payload.audio.length > 14_000_000) {
      return Response.json({ error: "A short audio recording is required" }, { status: 400 });
    }
    const lexicon = (payload.lexicon || []).map((item) => item.trim()).filter(Boolean).slice(0, 35).join(", ").slice(0, 400);
    const messages: unknown[] = [];
    if (lexicon) messages.push({ role: "system", content: `Transcribe the audio faithfully. Prefer these exact spellings when they match the speech: ${lexicon}.` });
    messages.push({ role: "user", content: [{ type: "input_audio", input_audio: { data: payload.audio } }] });
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.QWEN_ASR_MODEL || "qwen3-asr-flash",
        messages,
        stream: false,
        asr_options: { enable_itn: true, ...(payload.locale?.startsWith("en") ? { language: "en" } : {}) },
      }),
    });
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (!response.ok) return Response.json({ error: result.error?.message || "Speech recognition failed" }, { status: 502 });
    const transcript = result.choices?.[0]?.message?.content?.trim();
    if (!transcript) return Response.json({ error: "No speech was recognised" }, { status: 422 });
    return Response.json({ transcript, model: process.env.QWEN_ASR_MODEL || "qwen3-asr-flash" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Speech recognition failed" }, { status: 500 });
  }
}
