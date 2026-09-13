import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      suppressHydrationWarning
      className={cn(
        "h-11 w-full min-w-0 rounded-md bg-surface-2 px-3.5 text-base text-fg shadow-[var(--shadow-border)] outline-none transition-[box-shadow,background-color] duration-[var(--motion-quick)] placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
