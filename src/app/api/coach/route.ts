import { getAuthenticatedUser } from "@/lib/supabase/server";
import { checkAiAccess } from "@/lib/server/aiAccess";
import { isTrustedMutation } from "@/lib/server/requestSecurity";

type CoachPayload = {
  mode?: "coach" | "capture";
  prompt?: string;
  context?: unknown;
  lexicon?: string[];
};

function qwenConfig() {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl = (process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  return { apiKey, baseUrl, model: process.env.QWEN_MODEL || "qwen3.6-flash" };
}

export async function GET(request: Request) {
  const { user } = await getAuthenticatedUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const { apiKey, model } = qwenConfig();
  return Response.json({ configured: Boolean(apiKey), model });
}

export async function POST(request: Request) {
  if (!isTrustedMutation(request)) return Response.json({ error: "Cross-site request blocked" }, { status: 403 });
  const { supabase, user } = await getAuthenticatedUser(request);
  if (!supabase || !user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const access = await checkAiAccess(supabase, user, "coach");
  if (!access.allowed) return Response.json({ error: access.message }, { status: access.message.startsWith("Hourly") ? 429 : 403 });
  const { apiKey, baseUrl, model } = qwenConfig();
  if (!apiKey) return Response.json({ error: "Qwen is not configured" }, { status: 503 });
  try {
    const payload = await request.json() as CoachPayload;
    const prompt = payload.prompt?.trim().slice(0, 2400) || "";
    if (!prompt) return Response.json({ error: "Prompt is required" }, { status: 400 });
    const lexicon = (payload.lexicon || []).map((item) => item.trim()).filter(Boolean).slice(0, 30).join(", ");
    const isCapture = payload.mode === "capture";
    const system = isCapture
      ? `Turn a short spoken finance note into one JSON object. Return only JSON with keys intent (expense, income, transfer, plan, question), description, amount, date, category, sourceAccount, destinationAccount, confidence. Use null when unknown. Do not invent amounts. Today is ${new Date().toISOString().slice(0, 10)}. The user's vocabulary includes: ${lexicon || "none supplied"}.`
      : `You are Lifetime Coach, a calm evidence-led personal finance explainer for a Singapore consumer. Use only the supplied financial context. Never invent balances, transactions, returns, tax rules, or investment recommendations. Separate facts from assumptions, state uncertainty, and give one practical next step. Transfers are not income or spending. Be warm and concise.`;
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: isCapture ? `Return JSON for: ${prompt}` : `Financial context:\n${JSON.stringify(payload.context || {}).slice(0, 12000)}\n\nQuestion: ${prompt}` },
        ],
        temperature: 0.15,
        max_tokens: isCapture ? 220 : 520,
        enable_thinking: false,
        ...(isCapture ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (!response.ok) return Response.json({ error: result.error?.message || "Qwen request failed" }, { status: 502 });
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) return Response.json({ error: "Qwen returned an empty response" }, { status: 502 });
    if (isCapture) {
      try { return Response.json({ parsed: JSON.parse(content), model }); } catch { return Response.json({ error: "Qwen returned invalid capture data" }, { status: 502 }); }
    }
    return Response.json({ answer: content, model });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Qwen request failed" }, { status: 500 });
  }
}
