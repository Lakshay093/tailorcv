import type {
  Health,
  ParsedResume,
  Resume,
  Section,
  TailoredResult,
} from "./types";

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "")
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public code = "NETWORK_ERROR",
    public requestId?: string,
  ) {
    super(message);
  }
}

async function request(
  path: string,
  options: RequestInit,
  timeout = 300000,
): Promise<Response> {
  if (!BASE_URL)
    throw new ApiError(
      "The frontend deployment needs NEXT_PUBLIC_API_BASE_URL configured with its backend URL.",
      "BACKEND_NOT_CONFIGURED",
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new ApiError(
        data?.error?.message ||
          `The server returned ${response.status}. Please try again.`,
        data?.error?.code || "SERVER_ERROR",
        data?.error?.request_id,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new ApiError(
        "The request timed out. Your inputs are saved on this page; try again.",
        "CLIENT_TIMEOUT",
      );
    throw new ApiError(
      "We couldn’t reach the server. Check your connection and the backend URL, then try again.",
    );
  } finally {
    clearTimeout(timer);
  }
}
export async function getHealth(): Promise<Health> {
  return (await request("/health", {}, 15000)).json();
}
export async function parseResume(file: File): Promise<ParsedResume> {
  const form = new FormData();
  form.append("file", file);
  return (
    await request("/api/resume/parse", { method: "POST", body: form })
  ).json();
}
export async function customizeResume(
  parsed: ParsedResume,
  jd: string,
  sections: Section[],
): Promise<TailoredResult> {
  return (
    await request("/api/resume/customize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_description: jd,
        original_text: parsed.original_text,
        original_resume: parsed.structured_resume,
        source_token: parsed.source_token,
        sections,
      }),
    })
  ).json();
}
export async function downloadResume(
  resume: Resume,
  format: "pdf" | "docx" | "txt",
) {
  const response = await request(
    "/api/resume/export",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume, format }),
    },
    30000,
  );
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tailorcv-resume.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
