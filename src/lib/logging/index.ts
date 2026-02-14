import pino from "pino";

type LogContext = Record<string, unknown>;

const resolveLogLevel = () => {
  const level = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (!level) {
    return process.env.NODE_ENV === "production" ? "info" : "debug";
  }
  return level;
};

const shouldPrettyPrint = () => {
  if (process.env.LOG_PRETTY?.trim().toLowerCase() === "true") return true;
  return process.env.NODE_ENV !== "production";
};

type LoggerGlobal = typeof globalThis & {
  __exchoBaseLogger?: pino.Logger;
};

const createBaseLogger = () =>
  pino(
    {
      level: resolveLogLevel(),
      base: {
        service: "excho-engine",
        env: process.env.NODE_ENV ?? "development",
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    shouldPrettyPrint()
      ? pino.transport({
          target: "pino-pretty",
          options: {
            colorize: true,
            singleLine: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        })
      : undefined
  );

const globalWithLogger = globalThis as LoggerGlobal;
const baseLogger = globalWithLogger.__exchoBaseLogger ?? createBaseLogger();
if (!globalWithLogger.__exchoBaseLogger) {
  globalWithLogger.__exchoBaseLogger = baseLogger;
}

export const logger = baseLogger;

export const getLogger = (scope: string, context?: LogContext) =>
  logger.child({
    scope,
    ...(context ?? {}),
  });
