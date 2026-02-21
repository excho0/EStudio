import { fetchJson, throwForNonOkResponse } from "@/lib/http/fetch-json";
import type { z } from "zod";

export class ApiClient {
  constructor(private readonly baseUrl = "") {}

  private buildUrl(path: string) {
    if (!this.baseUrl) return path;
    return `${this.baseUrl}${path}`;
  }

  private parse(value: unknown, fallbackMessage?: string): unknown;
  private parse<S extends z.ZodTypeAny>(
    value: unknown,
    schema: S,
    fallbackMessage?: string
  ): z.infer<S>;
  private parse(
    value: unknown,
    schemaOrMessage?: z.ZodTypeAny | string,
    fallbackMessage?: string
  ): unknown {
    if (typeof schemaOrMessage === "string" || !schemaOrMessage) {
      return value;
    }
    const schema = schemaOrMessage;
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw new Error(
      fallbackMessage
        ? `${fallbackMessage}: ${parsed.error.message}`
        : parsed.error.message
    );
  }

  async get<S extends z.ZodTypeAny>(
    path: string,
    fallbackMessage: string | undefined,
    schema: S
  ): Promise<z.infer<S>>;
  async get(
    path: string,
    fallbackMessage?: string
  ): Promise<unknown>;
  async get(
    path: string,
    fallbackMessage?: string,
    schema?: z.ZodTypeAny
  ): Promise<unknown> {
    const value = await fetchJson<unknown>(
      this.buildUrl(path),
      undefined,
      fallbackMessage
    );
    return schema
      ? this.parse(value, schema, fallbackMessage)
      : this.parse(value, fallbackMessage);
  }

  async postJson<S extends z.ZodTypeAny>(
    path: string,
    body: unknown | undefined,
    fallbackMessage: string | undefined,
    schema: S
  ): Promise<z.infer<S>>;
  async postJson(
    path: string,
    body?: unknown,
    fallbackMessage?: string
  ): Promise<unknown>;
  async postJson(
    path: string,
    body?: unknown,
    fallbackMessage?: string,
    schema?: z.ZodTypeAny
  ): Promise<unknown> {
    const value = await fetchJson<unknown>(
      this.buildUrl(path),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      fallbackMessage
    );
    return schema
      ? this.parse(value, schema, fallbackMessage)
      : this.parse(value, fallbackMessage);
  }

  async putJson<S extends z.ZodTypeAny>(
    path: string,
    body: unknown | undefined,
    fallbackMessage: string | undefined,
    schema: S
  ): Promise<z.infer<S>>;
  async putJson(
    path: string,
    body?: unknown,
    fallbackMessage?: string
  ): Promise<unknown>;
  async putJson(
    path: string,
    body?: unknown,
    fallbackMessage?: string,
    schema?: z.ZodTypeAny
  ): Promise<unknown> {
    const value = await fetchJson<unknown>(
      this.buildUrl(path),
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      fallbackMessage
    );
    return schema
      ? this.parse(value, schema, fallbackMessage)
      : this.parse(value, fallbackMessage);
  }

  async patchJson<S extends z.ZodTypeAny>(
    path: string,
    body: unknown | undefined,
    fallbackMessage: string | undefined,
    schema: S
  ): Promise<z.infer<S>>;
  async patchJson(
    path: string,
    body?: unknown,
    fallbackMessage?: string
  ): Promise<unknown>;
  async patchJson(
    path: string,
    body?: unknown,
    fallbackMessage?: string,
    schema?: z.ZodTypeAny
  ): Promise<unknown> {
    const value = await fetchJson<unknown>(
      this.buildUrl(path),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      fallbackMessage
    );
    return schema
      ? this.parse(value, schema, fallbackMessage)
      : this.parse(value, fallbackMessage);
  }

  async del(path: string, fallbackMessage?: string) {
    const response = await fetch(this.buildUrl(path), { method: "DELETE" });
    await throwForNonOkResponse(response, fallbackMessage);
  }

  async delJson<S extends z.ZodTypeAny>(
    path: string,
    body: unknown | undefined,
    fallbackMessage: string | undefined,
    schema: S
  ): Promise<z.infer<S>>;
  async delJson(
    path: string,
    body?: unknown,
    fallbackMessage?: string
  ): Promise<unknown>;
  async delJson(
    path: string,
    body?: unknown,
    fallbackMessage?: string,
    schema?: z.ZodTypeAny
  ): Promise<unknown> {
    const response = await fetch(this.buildUrl(path), {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    await throwForNonOkResponse(response, fallbackMessage);
    const value = (await response.json()) as unknown;
    return schema
      ? this.parse(value, schema, fallbackMessage)
      : this.parse(value, fallbackMessage);
  }
}
