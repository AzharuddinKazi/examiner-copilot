import { createHash } from "node:crypto";
import { db, storedFilesTable, type StoredFile } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { Dataset } from "./dataset";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Strips path parts and control characters from a client-supplied file name. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
  return cleaned || "file";
}

export async function storeFile(
  input: { dataset: Dataset; purpose: "document" | "rulebook"; originalName: string; mime: string; data: Buffer },
  tx?: Tx,
): Promise<StoredFile> {
  const q = tx ?? db;
  const [row] = await q
    .insert(storedFilesTable)
    .values({
      dataset: input.dataset,
      purpose: input.purpose,
      originalName: safeFileName(input.originalName),
      mime: input.mime,
      sizeBytes: input.data.length,
      sha256: sha256(input.data),
      data: input.data,
    })
    .returning();
  return row!;
}

export async function getFile(dataset: Dataset, id: number): Promise<StoredFile | null> {
  const rows = await db
    .select()
    .from(storedFilesTable)
    .where(and(eq(storedFilesTable.dataset, dataset), eq(storedFilesTable.id, id)));
  return rows[0] ?? null;
}
