"use client";

import { useState } from "react";
import { Player } from "@remotion/player";
import { ContentLoopComposition } from "@/remotion/ContentLoopComposition";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useContentList, type ContentItem } from "../_components/use-content-list";
import { useMediaBlobUrl } from "@/hooks/use-media-blob-url";
import { toast } from "sonner";

export default function DashboardLibraryPage() {
  const { items, loading, refresh } = useContentList();
  const [renderingId, setRenderingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedVideoUrl = selected
    ? `/api/content/${selected.id}/asset?type=video`
    : null;
  const selectedAudioUrl = selected
    ? `/api/content/${selected.id}/asset?type=song`
    : null;
  const { blobUrl: selectedVideoBlobUrl, loading: selectedVideoLoading } =
    useMediaBlobUrl(selectedVideoUrl);
  const { blobUrl: selectedAudioBlobUrl, loading: selectedAudioLoading } =
    useMediaBlobUrl(selectedAudioUrl);

  const handleRender = async (id: string) => {
    setRenderingId(id);
    setError(null);
    const response = await fetch(`/api/content/${id}/render`, { method: "POST" });

    if (!response.ok) {
      setError("Render failed. Please check server logs.");
      toast.error("Render failed. Please check server logs.");
    } else {
      toast.message("Render started.");
    }

    await refresh();
    setRenderingId(null);
  };

  const handleDelete = async (id: string) => {
    setError(null);
    const response = await fetch(`/api/content/${id}`, { method: "DELETE" });

    if (!response.ok) {
      setError("Delete failed. Please try again.");
      toast.error("Delete failed. Please try again.");
    } else {
      toast.success("Item deleted.");
    }

    await refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Library</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400">
              Manage your uploaded content, previews, and renders.
            </p>
          </div>
          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-200">
              {error}
            </div>
          )}
        </div>

        {loading ? (
          <div className="mt-6 text-sm text-slate-500 dark:text-zinc-400">
            Loading content...
          </div>
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500 dark:border-white/10 dark:text-zinc-400">
            Upload your first project to get started.
          </div>
        ) : (
          <>
            <div className="mt-6 hidden lg:block">
              <Table>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                    <th className="py-3">Project</th>
                    <th>Status</th>
                    <th>Settings</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t border-slate-200 dark:border-white/10"
                    >
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={`/api/content/${item.id}/asset?type=thumbnail`}
                            alt={`${item.title} thumbnail`}
                            className="h-12 w-16 rounded-md object-cover ring-1 ring-slate-200 dark:ring-white/10"
                          />
                          <div>
                            <div className="font-medium">{item.title}</div>
                            <div className="text-xs text-slate-500 dark:text-zinc-500">
                              {new Date(item.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge
                          className={
                            item.status === "rendered"
                              ? "bg-emerald-500 text-black"
                              : item.status === "failed"
                                ? "bg-red-500 text-white"
                                : "bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white"
                          }
                        >
                          {item.status}
                        </Badge>
                      </td>
                      <td>
                        <div className="text-xs text-slate-500 dark:text-zinc-400">
                          {item.segmentDurationSeconds}s segments /{" "}
                          {item.fadeDurationSeconds}s fade
                        </div>
                        <div className="text-xs text-slate-500 dark:text-zinc-500">
                          {item.width}x{item.height} @ {item.fps}fps
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                variant="outline"
                                className="border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
                                onClick={() => setSelected(item)}
                              >
                                Preview
                              </Button>
                              <Button
                                className="bg-emerald-500 text-black hover:bg-emerald-400"
                                onClick={() => handleRender(item.id)}
                                disabled={renderingId === item.id}
                              >
                                {renderingId === item.id ? "Rendering..." : "Render"}
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-200 dark:hover:bg-red-500/10"
                                  >
                                    Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will remove the upload and rendered file from
                                      local storage. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-red-600 text-white hover:bg-red-500"
                                      onClick={() => handleDelete(item.id)}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                              {item.renderPath && (
                                <a
                                  href={`/api/content/${item.id}/asset?type=render`}
                                  className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
                                >
                                  Download
                                </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            <div className="mt-6 grid gap-4 lg:hidden">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-black/20"
                >
                  <div className="flex gap-3">
                    <img
                      src={`/api/content/${item.id}/asset?type=thumbnail`}
                      alt={`${item.title} thumbnail`}
                      className="h-16 w-20 rounded-md object-cover ring-1 ring-slate-200 dark:ring-white/10"
                    />
                    <div>
                      <div className="text-sm font-semibold">{item.title}</div>
                      <div className="text-xs text-slate-500 dark:text-zinc-500">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                      <Badge className="mt-2 bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white">
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-500 dark:text-zinc-500">
                    {item.segmentDurationSeconds}s segments /{" "}
                    {item.fadeDurationSeconds}s fade
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-200 text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
                      onClick={() => setSelected(item)}
                    >
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-500 text-black hover:bg-emerald-400"
                      onClick={() => handleRender(item.id)}
                      disabled={renderingId === item.id}
                    >
                      {renderingId === item.id ? "Rendering..." : "Render"}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-200 dark:hover:bg-red-500/10"
                        >
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove the upload and rendered file from local
                            storage. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-red-600 text-white hover:bg-red-500"
                            onClick={() => handleDelete(item.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    {item.renderPath && (
                      <a
                        href={`/api/content/${item.id}/asset?type=render`}
                        className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-900 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
                      >
                        Download
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-4xl border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50">
          <DialogHeader>
            <DialogTitle>{selected?.title ?? "Preview"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-black dark:border-white/10">
              {selectedVideoLoading || selectedAudioLoading || !selectedVideoBlobUrl ? (
                <div className="p-6 text-sm text-slate-500 dark:text-zinc-400">
                  Preparing preview assets...
                </div>
              ) : (
                <Player
                  component={ContentLoopComposition}
                  inputProps={{
                    title: selected.title,
                    videoSrc: selectedVideoBlobUrl,
                    audioSrc: selectedAudioBlobUrl ?? "",
                    segmentDurationSeconds: selected.segmentDurationSeconds,
                    fadeDurationSeconds: selected.fadeDurationSeconds,
                    videoDurationSeconds:
                      selected.videoDurationSeconds ?? selected.segmentDurationSeconds,
                  }}
                  durationInFrames={Math.max(
                    1,
                    Math.round(selected.songDurationSeconds * selected.fps)
                  )}
                  fps={selected.fps}
                  compositionWidth={selected.width}
                  compositionHeight={selected.height}
                  controls
                  style={{ width: "100%" }}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
