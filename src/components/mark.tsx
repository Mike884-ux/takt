import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("text-fg", className)}
      aria-hidden="true"
    >
      <rect
        x="3"
        y="3"
        width="26"
        height="26"
        rx="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8.5 19.5 13 14l4 3.5 6.5-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="23.5" cy="9.5" r="1.4" fill="currentColor" />
    </svg>
  );
}
