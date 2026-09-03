import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: isSupabaseConfigured(),
    service: "Lifetime Finance",
    databaseConfigured: isSupabaseConfigured(),
    aiConfigured: Boolean(process.env.DASHSCOPE_API_KEY),
    timestamp: new Date().toISOString(),
  }, {
    status: isSupabaseConfigured() ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
