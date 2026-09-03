import { getAuthenticatedUser } from "@/lib/supabase/server";
import { checkAiAccess } from "@/lib/server/aiAccess";
import { isTrustedMutation } from "@/lib/server/requestSecurity";

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return Response.json({ error: "Cross-site request blocked" }, { status: 403 });
  const { supabase, user } = await getAuthenticatedUser(request);
  if (!supabase || !user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const access = await checkAiAccess(supabase, user, "coach");
  if (!access.allowed) return Response.json({ error: access.message }, { status: access.message.startsWith("Hourly") ? 429 : 403 });

  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl = (process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  if (!apiKey) return Response.json({ error: "Receipt recognition is not configured" }, { status: 503 });
  const payload = await request.json().catch(() => ({})) as { image?: string };
  if (!payload.image?.startsWith("data:image/") || payload.image.length > 11_000_000) return Response.json({ error: "Choose a receipt or payment screenshot under 8 MB" }, { status: 400 });

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.QWEN_VISION_MODEL || "qwen3-vl-flash",
        messages: [{ role: "system", content: "Read one receipt or payment screenshot. Return only JSON with merchant, total, date (YYYY-MM-DD or null), category, confidence (0 to 1). Do not invent missing values." }, { role: "user", content: [{ type: "image_url", image_url: { url: payload.image } }, { type: "text", text: `Today is ${new Date().toISOString().slice(0, 10)}. Extract the payment.` }] }],
        temperature: 0.05,
        max_tokens: 220,
        response_format: { type: "json_object" },
      }),
    });
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (!response.ok) return Response.json({ error: result.error?.message || "Receipt recognition failed" }, { status: 502 });
    const parsed = JSON.parse(result.choices?.[0]?.message?.content || "{}") as { merchant?: string; total?: number; date?: string | null; category?: string; confidence?: number };
    if (!parsed.merchant || !Number.isFinite(Number(parsed.total)) || Number(parsed.total) <= 0) return Response.json({ error: "The total could not be read. Try a clearer image or enter it manually." }, { status: 422 });
    return Response.json({ receipt: { merchant: parsed.merchant.slice(0, 120), total: Number(parsed.total), date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date || "") ? parsed.date : new Date().toISOString().slice(0, 10), category: parsed.category || "Other", confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.65)) } });
  } catch (reason) {
    return Response.json({ error: reason instanceof Error ? reason.message : "Receipt recognition failed" }, { status: 500 });
  }
}
