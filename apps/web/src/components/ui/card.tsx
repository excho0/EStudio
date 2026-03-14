import * as React from "react"

import { cn } from "@/lib/shared/utils"

type CardProps = React.ComponentProps<"div"> & {
  animateHeight?: boolean
  progress?: number | null
  progressClassName?: string
}

function Card({
  className,
  animateHeight = true,
  progress = null,
  progressClassName,
  children,
  style,
  ...props
}: CardProps) {
  const cardRef = React.useRef<HTMLDivElement | null>(null)
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  const [height, setHeight] = React.useState<number | null>(null)

  React.useLayoutEffect(() => {
    if (!animateHeight || !contentRef.current || !cardRef.current) return
    const node = contentRef.current
    const cardNode = cardRef.current
    const update = () => {
      const styles = window.getComputedStyle(cardNode)
      const paddingTop = Number.parseFloat(styles.paddingTop) || 0
      const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0
      setHeight(node.offsetHeight + paddingTop + paddingBottom)
    }
    update()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [animateHeight])

  const hasProgress = progress !== null
  const clampedProgress = Math.max(0, Math.min(progress ?? 0, 100))
  const progressFill = hasProgress ? (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-y-0.5 left-0.5 rounded-[calc(var(--radius-xl)-2px)] bg-current/10 ring-1 ring-current/8 transition-[width] duration-200 ease-linear",
        progressClassName
      )}
      style={{ width: `calc((100% - 4px) * ${clampedProgress / 100})` }}
    />
  ) : null

  const cardStyle =
    animateHeight && height !== null ? { ...style, height: `${height}px` } : style

  const content = animateHeight ? (
    <div ref={contentRef} className={hasProgress ? "relative z-10" : undefined}>
      {children}
    </div>
  ) : hasProgress ? (
    <div className="relative z-10">{children}</div>
  ) : (
    children
  )

  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
        animateHeight && "transition-[height] duration-100 ease-out",
        hasProgress && "relative overflow-hidden",
        className
      )}
      style={cardStyle}
      ref={cardRef}
      {...props}
    >
      {progressFill}
      {content}
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
