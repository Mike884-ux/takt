import { Navigate, createFileRoute } from "@tanstack/react-router";
import { LoginPanel } from "@/components/login-panel";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-6">
        <div className="h-11 w-64 rounded-sm bg-surface-2" />
      </main>
    );
  }
  if (user) return <Navigate to="/" />;
  return <LoginPanel />;
}
