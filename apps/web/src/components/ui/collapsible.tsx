"use client"

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { ChevronDown } from "lucide-react"
import { motion, type Transition } from "framer-motion"
import * as React from "react"

import { cn } from "@/lib/shared/utils"

export const COLLAPSIBLE_ANIMATION_TRANSITION = {
  duration: 0.25,
  ease: "easeInOut",
} as const

type CollapsibleStateContextValue = {
  open: boolean
}

const CollapsibleStateContext =
  React.createContext<CollapsibleStateContextValue | null>(null)

const useCollapsibleState = () => {
  const ctx = React.useContext(CollapsibleStateContext)
  if (!ctx) {
    throw new Error("Collapsible components must be used within Collapsible")
  }
  return ctx
}

const useControllableState = <T,>({
  prop,
  defaultProp,
  onChange,
}: {
  prop?: T
  defaultProp: T
  onChange?: (value: T) => void
}) => {
  const [state, setState] = React.useState(defaultProp)
  const isControlled = prop !== undefined
  const value = isControlled ? (prop as T) : state

  const setValue = React.useCallback(
    (next: React.SetStateAction<T>) => {
      const nextValue =
        typeof next === "function"
          ? (next as (prev: T) => T)(value)
          : next
      if (!isControlled) {
        setState(nextValue)
      }
      onChange?.(nextValue)
    },
    [isControlled, onChange, value]
  )

  return [value, setValue] as const
}

function Collapsible({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  })

  return (
    <CollapsibleStateContext.Provider value={{ open }}>
      <CollapsiblePrimitive.Root
        data-slot="collapsible"
        open={open}
        onOpenChange={setOpen}
        {...props}
      />
    </CollapsibleStateContext.Provider>
  )
}

type CollapsibleTriggerProps = React.ComponentProps<
  typeof CollapsiblePrimitive.CollapsibleTrigger
> & {
  title?: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  rightSlot?: React.ReactNode
}

function CollapsibleTrigger({
  className,
  title,
  description,
  icon: Icon,
  rightSlot,
  children,
  ...props
}: CollapsibleTriggerProps) {
  const shouldRenderDefault = Boolean(title || description || Icon)
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      className={cn(
        "group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-900 transition hover:bg-slate-50 dark:text-zinc-100 dark:hover:bg-white/5",
        className
      )}
      {...props}
    >
      {shouldRenderDefault ? (
        <>
          <div className="flex min-w-0 items-center gap-3 text-left">
            {Icon ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-zinc-300">
                <Icon className="h-4 w-4 shrink-0" />
              </span>
            ) : null}
            <div className="flex min-w-0 flex-col items-start">
              {title ? <span className="truncate">{title}</span> : null}
              {description ? (
                <span className="truncate text-xs font-normal text-slate-500 dark:text-zinc-400">
                  {description}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {rightSlot ? <div className="text-sm">{rightSlot}</div> : null}
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
          </div>
        </>
      ) : (
        children
      )}
    </CollapsiblePrimitive.CollapsibleTrigger>
  )
}

function CollapsibleContent({
  className,
  children,
  animateSpacing = true,
  animateOpacity = true,
  transition = COLLAPSIBLE_ANIMATION_TRANSITION,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent> & {
  animateSpacing?: boolean;
  animateOpacity?: boolean;
  transition?: Transition;
}) {
  const { open } = useCollapsibleState()
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      asChild
      forceMount
      {...props}
    >
      <motion.div
        className={cn("overflow-hidden grid gap-3", className)}
        initial={false}
        animate={{
          height: open ? "auto" : 0,
          opacity: animateOpacity ? (open ? 1 : 0) : 1,
          marginTop: animateSpacing && open ? 12 : 0,
          paddingLeft: animateSpacing && open ? 12 : 0,
          paddingRight: animateSpacing && open ? 12 : 0,
          paddingBottom: animateSpacing && open ? 8 : 0,
        }}
        transition={transition}
        style={{ pointerEvents: open ? "auto" : "none" }}
      >
         {children}
      </motion.div>
    </CollapsiblePrimitive.CollapsibleContent>
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
