import { randomUUID } from "crypto";
import { spawn } from "child_process";
import path from "path";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  type Language,
  type WhisperModel,
  type TranscriptionJson,
} from "@remotion/install-whisper-cpp";
import {
  captionDocumentSchema,
  type CaptionDocument,
  type CaptionWord,
} from "@/types";
import { getStorage, storageKey } from "@/lib/storage";

const DEFAULT_WHISPER_CPP_VERSION = "1.7.6";
const DEFAULT_WHISPER_MODEL: WhisperModel = "large-v3";

let setupPromise: Promise<{
  whisperPathKey: string;
  modelFolderKey: string;
  whisperPath: string;
  modelFolder: string;
}> | null = null;
const storage = getStorage();

const resolveWhisperPaths = () => {
  const whisperPathKey = storageKey(
    process.env.CAPTION_LOCAL_WHISPER_PATH?.trim() || "cache/whisper-cpp"
  );
  const modelFolderKey = storageKey(
    process.env.CAPTION_LOCAL_WHISPER_MODEL_PATH?.trim() || "cache/whisper-models"
  );
  const whisperPath = storage.resolvePath(whisperPathKey);
  const modelFolder = storage.resolvePath(modelFolderKey);
  return { whisperPathKey, modelFolderKey, whisperPath, modelFolder };
};

const resolveWhisperVersion = () =>
  process.env.CAPTION_LOCAL_WHISPER_CPP_VERSION?.trim() || DEFAULT_WHISPER_CPP_VERSION;

const resolveWhisperModel = (): WhisperModel =>
  (process.env.CAPTION_LOCAL_WHISPER_MODEL?.trim() as WhisperModel) || DEFAULT_WHISPER_MODEL;

const resolveWhisperLanguage = (language?: string): Language | undefined => {
  const normalized = language?.trim();
  if (!normalized) return undefined;
  return normalized as Language;
};

const isTruthy = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const resolveWhisperFlashAttention = () =>
  isTruthy(process.env.CAPTION_LOCAL_WHISPER_FLASH_ATTENTION);

const resolveWhisperGpuEnabled = () => {
  const raw = process.env.CAPTION_LOCAL_WHISPER_GPU?.trim();
  if (!raw) return true;
  return isTruthy(raw);
};

const resolveWhisperGpuLayers = () => {
  const parsed = Number.parseInt(
    process.env.CAPTION_LOCAL_WHISPER_GPU_LAYERS?.trim() || "999",
    10
  );
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 999;
};

const resolveWhisperBuildCuda = () =>
  isTruthy(process.env.CAPTION_LOCAL_WHISPER_BUILD_CUDA);

const resolveWhisperBuildThreads = () => {
  const parsed = Number.parseInt(
    process.env.CAPTION_LOCAL_WHISPER_BUILD_THREADS?.trim() || "0",
    10
  );
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const resolveWhisperAdditionalArgs = (): string[] => {
  const raw = process.env.CAPTION_LOCAL_WHISPER_ADDITIONAL_ARGS?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // Fallback: whitespace-delimited flags for quick local usage.
  }
  return raw.split(/\s+/).filter(Boolean);
};

const hasAnyFlag = (args: string[], ...flags: string[]) =>
  args.some((arg) => flags.includes(arg));

const resolveWhisperBeamSize = () => {
  const parsed = Number.parseInt(
    process.env.CAPTION_LOCAL_WHISPER_BEAM_SIZE?.trim() || "8",
    10
  );
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 32 ? parsed : 8;
};

const resolveWhisperDecodeStrategy = () => {
  const raw = process.env.CAPTION_LOCAL_WHISPER_DECODE_STRATEGY?.trim().toLowerCase();
  if (raw === "greedy" || raw === "beam") return raw;
  return "beam";
};

const buildWhisperAdditionalArgs = () => {
  const args = [...resolveWhisperAdditionalArgs()];
  // Default to beam search for better caption accuracy; allow opt-out via env.
  const strategy = resolveWhisperDecodeStrategy();
  if (
    strategy === "beam" &&
    !hasAnyFlag(args, "--beam-size", "-bs", "--best-of", "-bo")
  ) {
    args.push("--beam-size", String(resolveWhisperBeamSize()));
  }
  const gpuEnabled = resolveWhisperGpuEnabled();
  if (!gpuEnabled && !hasAnyFlag(args, "--no-gpu", "-ng")) {
    args.push("--no-gpu");
  }
  // NOTE:
  // Newer whisper.cpp CLI builds may not support GPU-layer flags (-ngl/--gpu-layers),
  // while GPU is enabled by default unless --no-gpu/-ng is passed.
  // Keep layer config as a no-op for compatibility across versions.
  void resolveWhisperGpuLayers();
  return args;
};

const runCommand = async ({
  bin,
  args,
  cwd,
}: {
  bin: string;
  args: string[];
  cwd?: string;
}) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Failed command: ${bin} ${args.join(" ")} (exit ${code})`));
    });
  });
};

const storageExistsAtPath = async (absolutePath: string) =>
  storage.exists(storageKey(path.relative(storage.baseDir, absolutePath)));

const rebuildWhisperWithCuda = async ({
  whisperPath,
  whisperPathKey,
  buildThreads,
}: {
  whisperPath: string;
  whisperPathKey: string;
  buildThreads: number;
}) => {
  const hasCmakeLists = await storageExistsAtPath(path.join(whisperPath, "CMakeLists.txt"));
  if (hasCmakeLists) {
    await storage.deleteDir(storageKey(whisperPathKey, "build"));
    await runCommand({
      bin: "cmake",
      args: [
        "-S",
        ".",
        "-B",
        "build",
        "-DGGML_CUDA=ON",
        "-DCMAKE_BUILD_TYPE=Release",
      ],
      cwd: whisperPath,
    });
    await runCommand({
      bin: "cmake",
      args: [
        "--build",
        "build",
        ...(buildThreads > 0 ? ["-j", String(buildThreads)] : []),
      ],
      cwd: whisperPath,
    });
    return;
  }

  await runCommand({
    bin: "make",
    args: ["GGML_CUDA=1", ...(buildThreads > 0 ? [`-j${buildThreads}`] : [])],
    cwd: whisperPath,
  });
};

const convertToWhisperWav = async (inputPath: string, outputPath: string) => {
  const ffmpegBin = process.env.REMOTION_FFMPEG_PATH?.trim() || "ffmpeg";
  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(ffmpegBin, [
      "-y",
      "-i",
      inputPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      outputPath,
    ]);
    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    ffmpeg.on("error", (error) => {
      reject(error);
    });
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Failed to convert audio for local whisper (ffmpeg exit ${code}). ${stderr.slice(-1200)}`
        )
      );
    });
  });
};

type WhisperTimedToken = {
  rawText: string;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number | null;
};

const normalizeInlineWhitespace = (value: string) => value.replace(/\s+/g, " ");

const isWhisperControlToken = (value: string) =>
  /^\[\s*_[^\]]+\]$/i.test(value.trim()) ||
  /^\[[^\]]*tt[_-]?\d+[^\]]*\]$/i.test(value.trim()) ||
  /^\[[^\]]*beg[^\]]*\]$/i.test(value.trim()) ||
  /^\[[^\]]*end[^\]]*\]$/i.test(value.trim());

const hasLeadingWhitespace = (value: string) => /^\s/.test(value);

const startsWithJoiner = (value: string) => /^['’\-.,!?;:%)\]]/.test(value);

const endsWithOpenJoiner = (value: string) => /[(\["'’\-]$/.test(value);

const isLowercaseFragment = (value: string) => /^[a-z]{1,4}$/.test(value);

const shouldMergeWhisperTokens = (
  current: WhisperTimedToken,
  next: WhisperTimedToken
) => {
  const gapMs = Math.max(0, next.startMs - current.endMs);
  if (gapMs > 160) return false;
  if (!hasLeadingWhitespace(next.rawText)) return true;
  if (startsWithJoiner(next.text) || endsWithOpenJoiner(current.text)) return true;
  if (
    isLowercaseFragment(next.text) &&
    /[A-Za-z]$/.test(current.text) &&
    next.text.length <= 3
  ) {
    return true;
  }
  return false;
};

const shouldJoinWithoutSpace = (
  current: WhisperTimedToken,
  next: WhisperTimedToken
) => {
  if (!hasLeadingWhitespace(next.rawText)) return true;
  if (startsWithJoiner(next.text) || endsWithOpenJoiner(current.text)) return true;
  if (
    isLowercaseFragment(next.text) &&
    /[A-Za-z]$/.test(current.text) &&
    next.text.length <= 3
  ) {
    return true;
  }
  return false;
};

const buildWordsFromWhisperOutput = (whisperOutput: TranscriptionJson<true>): CaptionWord[] => {
  const tokens: WhisperTimedToken[] = whisperOutput.transcription
    .flatMap((item) =>
      item.tokens.map((token) => {
        const rawText = normalizeInlineWhitespace(token.text);
        const text = rawText.trim();
        const startMs = Math.max(0, Math.round(token.offsets.from));
        const endMs = Math.max(startMs + 1, Math.round(token.offsets.to));
        return {
          rawText,
          text,
          startMs,
          endMs,
          confidence: Number.isFinite(token.p) ? token.p : null,
        } satisfies WhisperTimedToken;
      })
    )
    .filter((token) => token.text.length > 0 && !isWhisperControlToken(token.text))
    .sort((a, b) => a.startMs - b.startMs);

  const words: CaptionWord[] = [];
  let current: WhisperTimedToken | null = null;

  const flush = () => {
    if (!current) return;
    const cleanedText = normalizeInlineWhitespace(current.text).trim();
    if (cleanedText.length > 0) {
      words.push({
        text: cleanedText,
        startMs: current.startMs,
        endMs: Math.max(current.startMs + 1, current.endMs),
      });
    }
    current = null;
  };

  for (const token of tokens) {
    if (!current) {
      current = { ...token };
      continue;
    }
    if (shouldMergeWhisperTokens(current, token)) {
      const joinWithoutSpace = shouldJoinWithoutSpace(current, token);
      current = {
        rawText: `${current.rawText}${token.rawText}`,
        text: joinWithoutSpace ? `${current.text}${token.text}` : `${current.text} ${token.text}`,
        startMs: current.startMs,
        endMs: Math.max(current.endMs, token.endMs),
        confidence:
          current.confidence === null
            ? token.confidence
            : token.confidence === null
              ? current.confidence
              : Math.min(current.confidence, token.confidence),
      };
      continue;
    }
    flush();
    current = { ...token };
  }

  flush();
  return words;
};

const ensureWhisperInstallation = async ({
  whisperPathKey,
  whisperPath,
  whisperCppVersion,
}: {
  whisperPathKey: string;
  whisperPath: string;
  whisperCppVersion: string;
}) => {
  const executableCandidates = [
    path.join(whisperPath, "build", "bin", "whisper-cli"),
    path.join(whisperPath, "build", "bin", "whisper-cli.exe"),
    path.join(whisperPath, "main"),
    path.join(whisperPath, "main.exe"),
  ];
  const hasExecutable = (
    await Promise.all(
      executableCandidates.map((candidate) =>
        storage.exists(storageKey(path.relative(storage.baseDir, candidate)))
      )
    )
  ).some(Boolean);
  if (!hasExecutable) {
    // Broken partial install cache: remove and reinstall cleanly.
    await storage.deleteDir(whisperPathKey);
  }
  try {
    await installWhisperCpp({
      version: whisperCppVersion,
      to: whisperPath,
      // Keep true so install errors are explicit and not silently ignored.
      printOutput: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isBrokenExistingFolder =
      message.includes("exists but the executable") && message.includes("is missing");
    if (!isBrokenExistingFolder) {
      throw error;
    }
    await storage.deleteDir(whisperPathKey);
    await installWhisperCpp({
      version: whisperCppVersion,
      to: whisperPath,
      printOutput: true,
    });
  }

  if (process.platform !== "linux" || !resolveWhisperBuildCuda()) {
    return;
  }

  const cudaMarkerKey = storageKey(whisperPathKey, ".cuda-build.ok");
  const hasCudaBuild = await storage.exists(cudaMarkerKey);
  if (hasCudaBuild) {
    return;
  }

  const buildThreads = resolveWhisperBuildThreads();
  await rebuildWhisperWithCuda({ whisperPath, whisperPathKey, buildThreads });
  await storage.writeFile(cudaMarkerKey, "ok");
};

const ensureWhisperReady = async (): Promise<{
  whisperPathKey: string;
  modelFolderKey: string;
  whisperPath: string;
  modelFolder: string;
}> => {
  if (!setupPromise) {
    setupPromise = (async () => {
      const whisperCppVersion = resolveWhisperVersion();
      const model = resolveWhisperModel();
      const { whisperPathKey, modelFolderKey, whisperPath, modelFolder } =
        resolveWhisperPaths();

      await storage.ensureDir(modelFolderKey);

      await ensureWhisperInstallation({
        whisperPathKey,
        whisperPath,
        whisperCppVersion,
      });
      await downloadWhisperModel({
        model,
        folder: modelFolder,
        printOutput: process.env.CAPTION_LOCAL_WHISPER_VERBOSE === "true",
      });

      return { whisperPathKey, modelFolderKey, whisperPath, modelFolder };
    })().catch((error) => {
      setupPromise = null;
      throw error;
    });
  }
  return setupPromise;
};

export const transcribeWithLocalWhisper = async ({
  audio,
  fileName,
  language,
  onProgress,
}: {
  userId: string;
  contentId: string;
  mode: string;
  audio: Buffer;
  fileName: string;
  language?: string;
  onProgress?: (progress: number) => void;
}): Promise<CaptionDocument> => {
  const whisperCppVersion = resolveWhisperVersion();
  const model = resolveWhisperModel();
  const flashAttention = resolveWhisperFlashAttention();
  const additionalArgs = buildWhisperAdditionalArgs();
  let { whisperPath, modelFolder } = await ensureWhisperReady();

  const tempRootKey = storageKey("tmp", "caption", randomUUID());
  await storage.ensureDir(tempRootKey);
  const tempAudioKey = storageKey(tempRootKey, `${randomUUID()}-${fileName}`);
  const tempAudioPath = storage.resolvePath(tempAudioKey);
  const whisperInputKey = storageKey(tempRootKey, `${randomUUID()}-whisper-input.wav`);
  const whisperInputPath = storage.resolvePath(whisperInputKey);

  try {
    await storage.writeFile(tempAudioKey, audio);
    await convertToWhisperWav(tempAudioPath, whisperInputPath);

    const runTranscribe = async () =>
      transcribe({
        inputPath: whisperInputPath,
        whisperPath,
        whisperCppVersion,
        model,
        modelFolder,
        language: resolveWhisperLanguage(language),
        tokenLevelTimestamps: true,
        splitOnWord: true,
        flashAttention,
        additionalArgs,
        printOutput: process.env.CAPTION_LOCAL_WHISPER_VERBOSE === "true",
        onProgress,
      });

    let whisperOutput;
    try {
      whisperOutput = await runTranscribe();
    } catch (error) {
      // Recover once if whisper binary is missing/corrupted at runtime.
      const isSpawnMissing =
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT";
      if (!isSpawnMissing) {
        throw error;
      }
      setupPromise = null;
      ({ whisperPath, modelFolder } = await ensureWhisperReady());
      whisperOutput = await runTranscribe();
    }

    const words = buildWordsFromWhisperOutput(whisperOutput);
    return captionDocumentSchema.parse({
      backend: "local",
      language: whisperOutput.result.language || language || "en",
      generatedAt: new Date().toISOString(),
      words,
    });
  } finally {
    await storage.deleteDir(tempRootKey);
  }
};
