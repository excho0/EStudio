import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/shared/utils";
import { getStatusMeta } from "@/lib/jobs/status-meta";

type JobStatusBadgeProps = {
  status: string;
  showLabel?: boolean;
  progress?: number;
  className?: string;
};

const toPercent = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = value > 1 ? value : value * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
};

export const JobStatusBadge = ({
  status,
  showLabel = true,
  progress,
  className,
}: JobStatusBadgeProps) => {
  const meta = getStatusMeta(status);
  const Icon = meta.icon;
  const progressPercent = toPercent(progress);
  const showProgress =
    (status === "rendering" || status === "publishing" || status === "processing") &&
    progressPercent !== null;

  return (
    <Badge className={cn("inline-flex items-center gap-2", meta.className, className)}>
      <Icon className={cn("h-4 w-4 shrink-0", meta.iconClassName)} />
      {showLabel ? (
        <span className="flex items-center gap-2">
          <span>{meta.label}</span>
          {showProgress ? (
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-amber-700/80 dark:text-amber-100/80">
              {progressPercent}%
            </span>
          ) : null}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="sr-only">{meta.label}</span>
          {showProgress ? (
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-amber-700/80 dark:text-amber-100/80">
              {progressPercent}%
            </span>
          ) : null}
        </span>
      )}
    </Badge>
  );
};
