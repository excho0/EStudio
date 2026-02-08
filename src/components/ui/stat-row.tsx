"use client";

import * as React from "react";
import { motion, type MotionProps } from "framer-motion";

import { cn } from "@/lib/shared/utils";

type StatRowProps = Omit<React.HTMLAttributes<HTMLDivElement>, "onDrag"> &
  MotionProps & {
  show?: boolean;
};

export function StatRow({ show = true, className, children, ...props }: StatRowProps) {
  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -6, height: 0 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      style={{ overflow: "hidden" }}
      className={cn("space-y-2", className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
