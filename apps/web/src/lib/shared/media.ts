export const getMediaDuration = (
  file: File,
  kind: "audio" | "video"
) =>
  new Promise<number>((resolve, reject) => {
    const element =
      kind === "audio"
        ? document.createElement("audio")
        : document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => {
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(objectUrl);
    };

    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const duration = Number.isFinite(element.duration) ? element.duration : 0;
      cleanup();
      resolve(duration);
    };
    element.onerror = () => {
      cleanup();
      reject(new Error(`Failed to inspect ${kind} duration.`));
    };
    element.src = objectUrl;
  });

export const getMediaDurationFromSrc = (
  src: string,
  kind: "audio" | "video"
) =>
  new Promise<number>((resolve, reject) => {
    const element =
      kind === "audio"
        ? document.createElement("audio")
        : document.createElement("video");

    const cleanup = () => {
      element.removeAttribute("src");
      element.load();
    };

    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const duration = Number.isFinite(element.duration) ? element.duration : 0;
      cleanup();
      resolve(duration);
    };
    element.onerror = () => {
      cleanup();
      reject(new Error(`Failed to inspect ${kind} duration.`));
    };
    element.src = src;
  });
