import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/src/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-2xl border-0 bg-gray-50 px-4 py-2 text-base transition-all outline-none placeholder:text-muted-foreground focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
