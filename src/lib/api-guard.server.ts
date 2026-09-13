import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import {
  UnauthorizedError,
  getSessionUser,
} from "@/lib/auth/verify.server";

/** OAuth 2.0 session (cookie or bearer) required. Same-origin only. */
export async function requireApiSession() {
  assertSameSiteRequest();
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export function unauthorizedResponse() {
  return Response.json(
    { ok: false, error: "Unauthorized", hint: "Нужен вход в Takt." },
    {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="takt", charset="UTF-8"' },
    },
  );
}

export function telegramSecretOk(request: Request, token: string) {
  if (!token) return false;
  const header =
    request.headers.get("x-telegram-bot-api-secret-token") ||
    request.headers.get("x-takt-telegram") ||
    "";
  if (!header || header.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= header.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}
