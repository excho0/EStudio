import { spawn } from "child_process";
import { getLogger } from "@/lib/logging";
import {
  getStorage,
  createTempDir,
  removePath,
  readFilePath,
  writeStreamToPath,
  storageKey,
} from "@/lib/storage";

const storage = getStorage();
const logger = getLogger("render-thumbnail");

const THUMBNAIL_EXTENSION = ".jpg";
const THUMBNAIL_CAPTURE_PERCENT = 0.45;

const runProcess = (bin: string, args: string[]) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `Failed command: ${bin} ${args.join(" ")} (exit ${code})${stderr ? `\n${stderr.slice(-1200)}` : ""}`
        )
      );
    });
  });

const getVideoDurationSeconds = async (inputPath: string) => {
  const ffprobeBin = process.env.REMOTION_FFPROBE_PATH?.trim() || "ffprobe";
  const { stdout } = await runProcess(ffprobeBin, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ]);
  const parsed = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ffprobe duration output: ${stdout.trim() || "<empty>"}`);
  }
  return parsed;
};

const writeThumbnailFromInputPath = async ({
  userId,
  contentId,
  renderFileName,
  inputPath,
}: {
  userId: string;
  contentId: string;
  renderFileName: string;
  inputPath: string;
}) => {
  const ffmpegBin = process.env.REMOTION_FFMPEG_PATH?.trim() || "ffmpeg";
  const thumbnailKey = getRenderThumbnailPath(userId, contentId, renderFileName);
  const tempDir = await createTempDir(`render-thumb-${contentId}`);
  const outputName = getRenderThumbnailName(renderFileName.split("/").pop() ?? renderFileName);
  const outputPath = `${tempDir}/${outputName}`;

  try {
    let durationSeconds: number | null = null;
    try {
      durationSeconds = await getVideoDurationSeconds(inputPath);
    } catch (error) {
      logger.warn(
        { error, renderFileName, contentId },
        "Failed to probe render duration for thumbnail; falling back to first representative frame."
      );
    }

    const timestampArgs =
      durationSeconds && Number.isFinite(durationSeconds)
        ? ["-ss", Math.max(0, durationSeconds * THUMBNAIL_CAPTURE_PERCENT).toFixed(3)]
        : [];

    await runProcess(ffmpegBin, [
      "-y",
      ...timestampArgs,
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      "-vf",
      "scale=min(960\\,iw):-2",
      outputPath,
    ]);

    const outputBuffer = await readFilePath(outputPath);
    await storage.writeFile(thumbnailKey, outputBuffer);
    return thumbnailKey;
  } finally {
    await removePath(tempDir, { recursive: true, force: true });
  }
};

export const getRenderThumbnailName = (renderFileName: string) => {
  const lastDotIndex = renderFileName.lastIndexOf(".");
  const baseName = lastDotIndex > 0 ? renderFileName.slice(0, lastDotIndex) : renderFileName;
  return `${baseName}${THUMBNAIL_EXTENSION}`;
};

export const getRenderThumbnailPath = (
  userId: string,
  contentId: string,
  renderFileName: string
) => storageKey("users", userId, "renders", contentId, getRenderThumbnailName(renderFileName));

export const generateRenderThumbnailFromFile = async ({
  userId,
  contentId,
  renderFileName,
  inputPath,
}: {
  userId: string;
  contentId: string;
  renderFileName: string;
  inputPath: string;
}) => {
  return writeThumbnailFromInputPath({
    userId,
    contentId,
    renderFileName,
    inputPath,
  });
};

export const generateRenderThumbnail = async ({
  userId,
  contentId,
  renderFileName,
  renderKey,
}: {
  userId: string;
  contentId: string;
  renderFileName: string;
  renderKey: string;
}) => {
  const tempDir = await createTempDir(`render-thumb-source-${contentId}`);
  const inputName = renderFileName.split("/").pop() ?? renderFileName;
  const inputPath = `${tempDir}/${inputName}`;

  try {
    await writeStreamToPath(storage.createReadStream(renderKey), inputPath);
    return await writeThumbnailFromInputPath({
      userId,
      contentId,
      renderFileName,
      inputPath,
    });
  } finally {
    await removePath(tempDir, { recursive: true, force: true });
  }
};
