import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-muted",
        className,
      )}
      {...props}
    />
  );
}
