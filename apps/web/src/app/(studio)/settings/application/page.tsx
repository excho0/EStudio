"use client";

import { useEffect, useState } from "react";
import { Cloud, HardDrive, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconSelect } from "@/components/ui/icon-select";
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";
import type { SettingsResponse } from "@/types";

export default function ApplicationSettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery<SettingsResponse>({
    queryKey: queryKeys.settings,
    staleTime: 30_000,
    queryFn: async () => sdk.settings.get(),
  });
  const updateSettingsMutation = useMutation({
    mutationFn: async (backend: "openai" | "local") =>
      sdk.settings.update({
        captions: { backend },
      }),
    onSuccess: async () => {
      toast.success("Caption backend updated.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update caption backend."
      );
    },
  });

  const data = settingsQuery.data ?? null;
  const serverCaptionBackend = data?.captions.backend ?? "openai";
  const [captionBackendDraft, setCaptionBackendDraft] = useState<
    "openai" | "local" | null
  >(null);
  const effectiveCaptionBackend = captionBackendDraft ?? serverCaptionBackend;

  useEffect(() => {
    if (!settingsQuery.error) return;
    toast.error(
      settingsQuery.error instanceof Error
        ? settingsQuery.error.message
        : "Failed to load settings."
    );
  }, [settingsQuery.error]);

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-white">
            <Settings2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-50">
              Application
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
              Configure global behavior for application-level features.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 p-4 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:text-zinc-300">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
            <Cloud className="h-3.5 w-3.5" />
            Captions
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">
            Global transcription backend used across all modes. Caption language remains mode-specific.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <IconSelect
              value={effectiveCaptionBackend}
              onValueChange={(value) =>
                setCaptionBackendDraft(value as "openai" | "local")
              }
              triggerClassName="h-9 min-w-48"
              options={[
                { value: "openai", label: "OpenAI Whisper", icon: Cloud },
                { value: "local", label: "Local Whisper.cpp", icon: HardDrive },
              ]}
            />
            <Button
              type="button"
              onClick={async () => {
                await updateSettingsMutation.mutateAsync(effectiveCaptionBackend);
                setCaptionBackendDraft(null);
              }}
              loading={updateSettingsMutation.isPending}
              loadingText="Saving..."
              disabled={effectiveCaptionBackend === serverCaptionBackend}
            >
              Save backend
            </Button>
            <span className="text-xs text-slate-500 dark:text-zinc-500">
              Default language: {data?.captions.defaultLanguage ?? "en"}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
