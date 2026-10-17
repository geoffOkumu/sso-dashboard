import { auth } from "@/lib/auth";
export async function GET(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/auth/.well-known/openid-configuration";
  return auth.handler(new Request(url, request));
}
