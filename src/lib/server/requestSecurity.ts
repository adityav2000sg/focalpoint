import "server-only";

export function isTrustedMutation(request: Request) {
  if (request.headers.get("authorization")?.startsWith("Bearer ")) return true;
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}
