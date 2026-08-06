import * as React from "react"

import { cn } from "@/src/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-2xl border border-input bg-white px-4 py-3 text-base transition-all outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
