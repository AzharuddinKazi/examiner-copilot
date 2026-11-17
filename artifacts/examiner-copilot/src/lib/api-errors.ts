export type ParsedApiError = { message: string; status: number | null; existingId: number | null };

/** Plain-text server error ({error}) when present; never invents success. */
export function parseApiError(err: unknown): ParsedApiError {
  let status: number | null = null;
  let existingId: number | null = null;
  let message = "The server did not respond as expected.";
  if (err && typeof err === "object") {
    const e = err as { status?: unknown; data?: unknown; message?: unknown };
    if (typeof e.status === "number") status = e.status;
    if (typeof e.message === "string" && e.message) message = e.message;
    if (e.data && typeof e.data === "object") {
      const d = e.data as { error?: unknown; existingId?: unknown };
      if (typeof d.error === "string" && d.error.trim()) message = d.error;
      if (typeof d.existingId === "number") existingId = d.existingId;
    }
  }
  return { message, status, existingId };
}
