import {
  CheckCircle2,
  CircleSlash,
  Loader2,
  Play,
  Upload,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type JobLikeStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "publishing"
  | "rendering"
  | "rendered"
  | "completed"
  | "canceled"
  | "failed";

export type JobStatusMeta = {
  label: string;
  icon: LucideIcon;
  className: string;
  iconClassName?: string;
};

const DEFAULT_STATUS_META: JobStatusMeta = {
  label: "Queued",
  icon: Play,
  className: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-zinc-100",
};

const STATUS_META_REGISTRY: Record<JobLikeStatus, JobStatusMeta> = {
  uploaded: {
    label: "Uploaded",
    icon: Upload,
    className: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-zinc-100",
  },
  queued: {
    label: "Queued",
    icon: Play,
    className: "bg-sky-500/15 text-sky-700 dark:bg-sky-400/20 dark:text-sky-200",
  },
  processing: {
    label: "Processing",
    icon: Loader2,
    iconClassName: "animate-spin",
    className: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200",
  },
  publishing: {
    label: "Publishing",
    icon: Loader2,
    iconClassName: "animate-spin",
    className: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200",
  },
  rendering: {
    label: "Rendering",
    icon: Loader2,
    iconClassName: "animate-spin",
    className: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200",
  },
  rendered: {
    label: "Rendered",
    icon: CheckCircle2,
    className: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-200",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-200",
  },
  canceled: {
    label: "Canceled",
    icon: CircleSlash,
    className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700/40 dark:text-zinc-200",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className: "bg-red-500/15 text-red-700 dark:bg-red-400/20 dark:text-red-200",
  },
};

export const getStatusMeta = (status: string): JobStatusMeta => {
  const key = status as JobLikeStatus;
  return STATUS_META_REGISTRY[key] ?? DEFAULT_STATUS_META;
};
