import { useState } from "react";
import {
  GROK_PROVIDERS,
  authClient,
  authEnabled,
  signIn,
} from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BEARER_KEY = "grok-auth.bearer-token";

function keepToken(token?: string | null) {
  if (!token || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(BEARER_KEY, token);
  } catch {
    /* ignore */
  }
}

function failText(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message ?? "")
      : "";
  if (/password/i.test(message) && /short|8/i.test(message)) {
    return "Пароль не короче 8 символов.";
  }
  if (/exist|already|registered/i.test(message)) {
    return "Этот email уже зарегистрирован. Войди.";
  }
  if (/invalid|incorrect|credential/i.test(message)) {
    return "Неверный email или пароль.";
  }
  return message || "Не получилось. Проверь данные и попробуй ещё раз.";
}

function Mark() {
  return (
    <span className="grid size-10 place-items-center rounded-sm bg-primary font-display text-xs font-bold text-primary-fg">
      TK
    </span>
  );
}

function tokenOf(data: unknown) {
  if (data && typeof data === "object" && "token" in data) {
    return String((data as { token?: string }).token ?? "");
  }
  return "";
}

export function LoginPanel({ overlay = false }: { overlay?: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!authEnabled || busy) return;
    setError("");
    const mail = email.trim().toLowerCase();
    if (!mail || !password) {
      setError("Нужны email и пароль.");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setError("Пароль не короче 8 символов.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: err } = await authClient.signUp.email({
          email: mail,
          password,
          name: name.trim() || mail.split("@")[0] || "Трейдер",
        });
        if (err) throw err;
        keepToken(tokenOf(data));
      } else {
        const { data, error: err } = await authClient.signIn.email({
          email: mail,
          password,
        });
        if (err) throw err;
        keepToken(tokenOf(data));
      }
      await authClient.getSession();
      window.location.assign("/");
    } catch (err) {
      setError(failText(err));
      setBusy(false);
    }
  }

  const card = (
    <div className="w-full max-w-sm space-y-5 rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
      <div className="flex items-center gap-3">
        <Mark />
        <div>
          <p className="font-display text-lg font-semibold text-fg">Takt</p>
          <p className="text-sm text-muted">Войди, чтобы считать сделки.</p>
        </div>
      </div>

      <div className="flex gap-1 rounded-sm bg-surface-2 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError("");
          }}
          className={
            mode === "signin"
              ? "h-9 flex-1 rounded-sm bg-primary text-xs text-primary-fg"
              : "h-9 flex-1 rounded-sm text-xs text-muted"
          }
        >
          Войти
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError("");
          }}
          className={
            mode === "signup"
              ? "h-9 flex-1 rounded-sm bg-primary text-xs text-primary-fg"
              : "h-9 flex-1 rounded-sm text-xs text-muted"
          }
        >
          Регистрация
        </button>
      </div>

      {authEnabled ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {mode === "signup" ? (
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Имя"
              autoComplete="name"
            />
          ) : null}
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            autoComplete="email"
          />
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "signup" ? "Пароль от 8 символов" : "Пароль"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          {error ? <p className="text-sm text-short">{error}</p> : null}
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {busy ? "Секунда…" : mode === "signup" ? "Создать аккаунт" : "Войти"}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">Вход выключен.</p>
      )}

      {authEnabled ? (
        <div className="space-y-2">
          <p className="text-center text-[11px] uppercase tracking-wide text-faint">
            или
          </p>
          {GROK_PROVIDERS.map((p) => (
            <Button
              key={p.providerId}
              type="button"
              variant="secondary"
              className="h-11 w-full"
              onClick={() => signIn(p.providerId, { callbackURL: "/" })}
            >
              Войти через {p.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (overlay) {
    return (
      <div className="absolute inset-0 z-50 grid place-items-center bg-bg/75 px-6 backdrop-blur-sm">
        {card}
      </div>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6">{card}</main>
  );
}
