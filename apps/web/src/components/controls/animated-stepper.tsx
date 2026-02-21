"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import { cn } from "@/lib/shared/utils";

type Step = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type StepperContextValue = {
  steps: Step[];
  currentId: string;
  currentIndex: number;
  isComplete: boolean;
  direction: number;
  progress: number;
  onStepClick?: (id: string) => void;
  validate?: (id: string) => boolean | Promise<boolean>;
};

const StepperContext = React.createContext<StepperContextValue | null>(null);

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 200 : -200, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction < 0 ? 200 : -200, opacity: 0 }),
};

export function StepperShell({
  steps,
  currentId,
  isComplete,
  onStepClick,
  validate,
  children,
}: {
  steps: Step[];
  currentId: string;
  isComplete: boolean;
  onStepClick?: (id: string) => void;
  validate?: (id: string) => boolean | Promise<boolean>;
  children: React.ReactNode;
}) {
  const currentIndex = steps.findIndex((step) => step.id === currentId);
  const previousIndex = React.useRef(currentIndex);
  const [direction, setDirection] = React.useState(0);

  React.useEffect(() => {
    setDirection(currentIndex - previousIndex.current);
    previousIndex.current = currentIndex;
  }, [currentIndex]);

  const progress =
    steps.length > 1 ? (currentIndex / (steps.length - 1)) * 100 : 0;

  const value = React.useMemo(
    () => ({
      steps,
      currentId,
      currentIndex,
      isComplete,
      direction,
      progress,
      onStepClick,
      validate,
    }),
    [
      steps,
      currentId,
      currentIndex,
      isComplete,
      direction,
      progress,
      onStepClick,
      validate,
    ]
  );

  return (
    <StepperContext.Provider value={value}>
      <div className="flex flex-col gap-6">{children}</div>
    </StepperContext.Provider>
  );
}

export function StepperHeader() {
  const context = React.useContext(StepperContext);
  if (!context) {
    throw new Error("StepperHeader must be used within StepperShell.");
  }

  const { steps, currentId, currentIndex, isComplete, progress } = context;

  return (
    <nav className="my-6">
      <ol className="relative flex items-center justify-between">
        <div className="absolute top-5 left-4 right-4 z-0 h-0.5 bg-border sm:left-12 sm:right-12">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        {steps.map((step, index) => {
          const isActive = step.id === currentId;
          const isDone = index < currentIndex || isComplete;
          const isClickable = !!context.onStepClick && !isComplete;
          return (
            <motion.li
              key={step.id}
              className={cn(
                "relative z-10 flex shrink-0 flex-col items-center gap-2",
                isClickable && "cursor-pointer"
              )}
              onClick={() => {
                if (!context.onStepClick || isComplete) return;
                const allow = context.validate?.(step.id);
                if (allow instanceof Promise) {
                  void allow.then((ok) => {
                    if (ok) {
                      context.onStepClick?.(step.id);
                    }
                  });
                  return;
                }
                if (allow === false) return;
                context.onStepClick?.(step.id);
              }}
              whileHover={!isComplete ? { scale: 1.03 } : {}}
            >
              <div
                className={cn(
                  "relative flex h-10 w-10 items-center justify-center rounded-full border bg-card text-muted-foreground transition",
                  isDone && "border-primary bg-primary text-primary-foreground",
                  isActive &&
                    !isDone &&
                    "border-primary/70 bg-accent text-accent-foreground shadow-[inset_0_0_0_2px_hsl(var(--primary)/0.35)]",
                  !isActive && !isDone && "border-border bg-muted text-muted-foreground"
                )}
              >
                <AnimatePresence mode="wait">
                  {isDone ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                    >
                      <CheckCircle className="h-5 w-5" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key={step.id}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                    >
                      <step.icon className="h-5 w-5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <span
                className={cn(
                  "hidden text-xs font-medium text-muted-foreground sm:block",
                  isActive && "text-primary"
                )}
              >
                {step.label}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StepperContent({
  children,
}: {
  children: (props: { direction: number }) => React.ReactNode;
}) {
  const context = React.useContext(StepperContext);
  if (!context) {
    throw new Error("StepperContent must be used within StepperShell.");
  }

  return (
    <AnimatePresence mode="wait">
      {children({ direction: context.direction })}
    </AnimatePresence>
  );
}

export function StepperMotion({
  stepKey,
  direction,
  children,
  className,
}: {
  stepKey: string;
  direction: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      key={stepKey}
      className={className}
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{
        x: { type: "spring", stiffness: 260, damping: 28 },
        opacity: { duration: 0.2 },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StepperFooter({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex flex-col gap-3 w-full">{children}</div>;
}
