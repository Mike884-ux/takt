import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium outline-none transition-[color,background-color,opacity] duration-[var(--motion-quick)] ease-[var(--ease-out)] disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary/30",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-fg hover:bg-primary/90",
        secondary:
          "bg-surface-2 text-fg shadow-[var(--shadow-border)] hover:bg-surface-2/80",
        ghost: "text-muted hover:bg-surface-2 hover:text-fg",
        outline:
          "text-fg shadow-[var(--shadow-border)] hover:bg-surface-2",
      },
      size: {
        default: "h-10 rounded-sm px-3.5",
        sm: "h-8 rounded-sm px-2.5 text-xs",
        icon: "size-9 rounded-sm",
        chip: "h-8 rounded-sm px-2.5 font-mono text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
