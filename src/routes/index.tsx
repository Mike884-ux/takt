import { createFileRoute } from "@tanstack/react-router";
import { LoginPanel } from "@/components/login-panel";
import { Desk } from "@/components/desk";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  return (
    <div className="relative h-dvh min-h-0">
      <Desk ready={Boolean(user)} />
      {!user && !isPending ? <LoginPanel overlay /> : null}
    </div>
  );
}
