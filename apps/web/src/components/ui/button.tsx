import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/shared/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:text-secondary-foreground/80 hover:shadow-xs hover:bg-secondary/10 dark:bg-secondary/10 dark:hover:bg-secondary/20",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
    loadingText?: string
    progress?: number | null
    progressClassName?: string
  }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "default",
    size = "default",
    asChild = false,
    loading = false,
    loadingText,
    children,
    disabled,
    progress = null,
    progressClassName,
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading
  const hasProgress = progress !== null && !loading
  const classNames = cn(
    buttonVariants({ variant, size, className }),
    hasProgress && "relative overflow-hidden"
  )
  const content = (
    <>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {loading ? (loadingText ?? null) : children}
    </>
  )
  const clampedProgress = Math.max(0, Math.min(progress ?? 0, 100))
  const progressFill = hasProgress ? (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-y-0.5 left-0.5 rounded-[calc(var(--radius-md)-2px)] bg-current/18 ring-1 ring-current/12 transition-[width] duration-200 ease-linear",
        progressClassName
      )}
      style={{ width: `calc((100% - 4px) * ${clampedProgress / 100})` }}
    />
  ) : null

  if (asChild) {
    return (
      <Slot
        ref={ref}
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={classNames}
        aria-disabled={isDisabled || undefined}
        data-disabled={isDisabled ? "true" : undefined}
        {...props}
      >
        {children}
      </Slot>
    )
  }

  return (
    <button
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={classNames}
      disabled={isDisabled}
      {...props}
    >
      {progressFill}
      {hasProgress ? <span className="relative z-10 flex items-center gap-2">{content}</span> : content}
    </button>
  )
})

export { Button, buttonVariants }
