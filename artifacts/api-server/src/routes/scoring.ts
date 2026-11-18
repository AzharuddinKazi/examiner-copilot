import { Router, type IRouter, type Response } from "express";
import {
  GetScoringSettingsParams,
  SaveScoringSettingsBody,
  CreateComplaintThemeBody,
  UpdateComplaintThemeParams,
  CreateComplaintBody,
  UpdateComplaintParams,
  GetAssessmentScorecardParams,
  GetAssessmentScorecardResponse,
  ListComplaintsResponse,
  ListComplaintThemesResponse,
  GetScoringSettingsResponse,
} from "@workspace/api-zod";
import { db, banksTable, complaintsTable, complaintThemesTable, productsTable, scoringSettingsTable } from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { getActiveDataset, type Dataset } from "../lib/dataset";
import { appendAudit } from "../lib/audit";
import { actorLabel, currentUser } from "../lib/auth";
import { requireWriter } from "../lib/roles";
import { receiveFile } from "../lib/upload";
import { splitCsv } from "../lib/rulebook-import";
import { SETTINGS, describeIssues, type SettingsKind } from "../lib/scoring/config";
import { getScoringConfig, getSettings } from "../lib/scoring/settings";
import { buildScorecard } from "../lib/scoring/scorecard";
import { aggregateCaseRows, isCaseLevel, type ComplaintAggregate } from "../lib/scoring/complaints-import";

const router: IRouter = Router();
const norm = (s: string) => s.trim().toLowerCase();

// ---------------- Settings (scoring rubric, document roles) ----------------

async function sendSettings(res: Response, dataset: Dataset, kind: SettingsKind) {
  const s = await getSettings(dataset, kind);
  res.json(GetScoringSettingsResponse.parse({ kind, content: s.content, isDefault: s.isDefault, updatedAt: s.updatedAt, updatedBy: s.updatedBy }));
}

router.get("/scoring/settings/:kind", async (req, res): Promise<void> => {
  const p = GetScoringSettingsParams.safeParse(req.params);
  if (!p.success) {
    res.status(404).json({ error: "Unknown settings. Use scoring or document_roles." });
    return;
  }
  await sendSettings(res, await getActiveDataset(), p.data.kind);
});

router.put("/scoring/settings/:kind", async (req, res): Promise<void> => {
  const role = requireWriter(req, res);
  if (!role) return;
  const p = GetScoringSettingsParams.safeParse(req.params);
  const b = SaveScoringSettingsBody.safeParse(req.body);
  if (!p.success || !b.success) {
    res.status(400).json({ error: "Send the settings as a JSON object under content." });
    return;
  }
  const kind = p.data.kind;
  const def = SETTINGS[kind];
  const parsed = def.schema.safeParse(b.data.content);
  if (!parsed.success) {
    res.status(400).json({ error: `The ${def.label} was not saved. ${describeIssues(parsed.error)}` });
    return;
  }
  const dataset = await getActiveDataset();
  const before = await getSettings(dataset, kind);
  const actor = actorLabel(currentUser());
  await db.transaction(async (tx) => {
    await tx
      .insert(scoringSettingsTable)
      .values({ dataset, kind, content: b.data.content, updatedBy: actor, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [scoringSettingsTable.dataset, scoringSettingsTable.kind], set: { content: b.data.content, updatedBy: actor, updatedAt: new Date() } });
    await appendAudit(
      {
        dataset,
        role,
        action: `settings.${kind}.saved`,
        entityType: "settings",
        entityId: kind,
        summary: `Saved the ${def.label} (version ${String((b.data.content as { version?: unknown }).version ?? "unnamed")}).`,
        before: { version: (before.content as { version: string }).version, isDefault: before.isDefault },
        after: b.data.content,
      },
      tx,
    );
  });
  await sendSettings(res, dataset, kind);
});

router.delete("/scoring/settings/:kind", async (req, res): Promise<void> => {
  const role = requireWriter(req, res);
  if (!role) return;
  const p = GetScoringSettingsParams.safeParse(req.params);
  if (!p.success) {
    res.status(404).json({ error: "Unknown settings." });
    return;
  }
  const dataset = await getActiveDataset();
  const kind = p.data.kind;
  await db.transaction(async (tx) => {
    const removed = await tx.delete(scoringSettingsTable).where(and(eq(scoringSettingsTable.dataset, dataset), eq(scoringSettingsTable.kind, kind))).returning();
    if (removed.length) {
      await appendAudit(
        { dataset, role, action: `settings.${kind}.reset`, entityType: "settings", entityId: kind, summary: `Reset the ${SETTINGS[kind].label} to the loaded file.`, before: removed[0]!.content, after: null },
        tx,
      );
    }
  });
  await sendSettings(res, dataset, kind);
});

// ---------------- Complaint category → theme ----------------

async function themeList(dataset: Dataset) {
  const [rows, counts, cfg] = await Promise.all([
    db.select().from(complaintThemesTable).where(eq(complaintThemesTable.dataset, dataset)).orderBy(asc(complaintThemesTable.category)),
    db
      .select({ category: complaintsTable.category, n: sql<number>`sum(${complaintsTable.count})::int` })
      .from(complaintsTable)
      .where(eq(complaintsTable.dataset, dataset))
      .groupBy(complaintsTable.category),
    getScoringConfig(dataset),
  ]);
  const mapped = new Set(rows.map((r) => norm(r.category)));
  const countOf = (c: string) => counts.filter((x) => norm(x.category) === norm(c)).reduce((s, x) => s + x.n, 0);
  return {
    items: rows.map((r) => ({ id: r.id, category: r.category, theme: r.theme, knownTheme: cfg.themes.includes(r.theme), complaintCount: countOf(r.category) })),
    themes: cfg.themes,
    unmappedCategories: [...new Set(counts.filter((c) => !mapped.has(norm(c.category))).map((c) => c.category))].sort(),
  };
}

router.get("/complaint-themes", async (_req, res): Promise<void> => {
  res.json(ListComplaintThemesResponse.parse(await themeList(await getActiveDataset())));
});

async function checkTheme(dataset: Dataset, theme: string): Promise<string | null> {
  const cfg = await getScoringConfig(dataset);
  return cfg.themes.includes(theme) ? null : `"${theme}" is not one of the scoring themes. Pick a theme from the scoring rubric.`;
}

router.post("/complaint-themes", async (req, res): Promise<void> => {
  const role = requireWriter(req, res);
  if (!role) return;
  const b = CreateComplaintThemeBody.safeParse(req.body);
  if (!b.success) {
    res.status(400).json({ error: "Enter a category and a theme." });
    return;
  }
  const dataset = await getActiveDataset();
  const category = b.data.category.trim();
  const bad = await checkTheme(dataset, b.data.theme);
  if (bad) {
    res.status(400).json({ error: bad });
    return;
  }
  const existing = await db.select().from(complaintThemesTable).where(eq(complaintThemesTable.dataset, dataset));
  if (existing.some((e) => norm(e.category) === norm(category))) {
    res.status(409).json({ error: `"${category}" is already mapped. Edit that row instead.` });
    return;
  }
  const row = await db.transaction(async (tx) => {
    const [r] = await tx.insert(complaintThemesTable).values({ dataset, category, theme: b.data.theme }).returning();
    await appendAudit({ dataset, role, action: "complaint_theme.created", entityType: "complaint_theme", entityId: String(r!.id), summary: `Mapped complaint category "${category}" to ${b.data.theme}.`, after: r }, tx);
    return r!;
  });
  res.status(201).json((await themeList(dataset)).items.find((i) => i.id === row.id));
});

router.patch("/complaint-themes/:id", async (req, res): Promise<void> => {
  const role = requireWriter(req, res);
  if (!role) return;
  const p = UpdateComplaintThemeParams.safeParse(req.params);
  const b = CreateComplaintThemeBody.safeParse(req.body);
  if (!p.success || !b.success) {
    res.status(400).json({ error: "Enter a category and a theme." });
    return;
  }
  const dataset = await getActiveDataset();
  const all = await db.select().from(complaintThemesTable).where(eq(complaintThemesTable.dataset, dataset));
  const cur = all.find((r) => r.id === p.data.id);
  if (!cur) {
    res.status(404).json({ error: "Mapping not found." });
    return;
  }
  const bad = await checkTheme(dataset, b.data.theme);
  if (bad) {
    res.status(400).json({ error: bad });
    return;
  }
  const category = b.data.category.trim();
  if (all.some((r) => r.id !== cur.id && norm(r.category) === norm(category))) {
    res.status(409).json({ error: `"${category}" is already mapped.` });
    return;
  }
  await db.transaction(async (tx) => {
    const [r] = await tx.update(complaintThemesTable).set({ category, theme: b.data.theme }).where(eq(complaintThemesTable.id, cur.id)).returning();
    await appendAudit({ dataset, role, action: "complaint_theme.updated", entityType: "complaint_theme", entityId: String(cur.id), summary: `Changed complaint mapping "${category}" → ${b.data.theme}.`, before: cur, after: r }, tx);
  });
  res.json((await themeList(dataset)).items.find((i) => i.id === cur.id));
});

router.delete("/complaint-themes/:id", async (req, res): Promise<void> => {
  const role = requireWriter(req, res);
  if (!role) return;
  const p = UpdateComplaintThemeParams.safeParse(req.params);
  const dataset = await getActiveDataset();
  const [cur] = p.success ? await db.select().from(complaintThemesTable).where(and(eq(complaintThemesTable.dataset, dataset), eq(complaintThemesTable.id, p.data.id))) : [];
  if (!cur) {
    res.status(404).json({ error: "Mapping not found." });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(complaintThemesTable).where(eq(complaintThemesTable.id, cur.id));
    await appendAudit({ dataset, role, action: "complaint_theme.deleted", entityType: "complaint_theme", entityId: String(cur.id), summary: `Removed complaint mapping "${cur.category}".`, before: cur }, tx);
  });
  res.status(204).end();
});

/** Reads an uploaded CSV into objects keyed by lower-case header. */
function readCsv(buf: Buffer): { rows: Record<string, string>[]; error: string | null } {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\uFEFF/, "");
  } catch {
    return { rows: [], error: 'The CSV is not UTF-8 text. In Excel, save it as "CSV UTF-8 (Comma delimited)".' };
  }
  let cells: string[][];
  try {
    cells = splitCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  } catch (e) {
    return { rows: [], error: (e as Error).message };
  }
  if (cells.length < 2) return { rows: [], error: "The CSV needs a header row and at least one data row." };
  const head = cells[0]!.map((h) => norm(h).replace(/[^a-z]/g, ""));
  return { rows: cells.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()]))), error: null };
}

router.post("/complaint-themes/import", async (req, res): Promise<void> => {
  if (!(await receiveFile(req, res, 2 * 1024 * 1024, "CSV file"))) return;
  const role = requireWriter(req, res);
  if (!role) return;
  const { rows, error } = readCsv(req.file!.buffer);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  if (!rows.length || !("category" in rows[0]!) || !("theme" in rows[0]!)) {
    res.status(400).json({ error: "The CSV needs two columns: category and theme." });
    return;
  }
  const dataset = await getActiveDataset();
  const cfg = await getScoringConfig(dataset);
  const existing = await db.select().from(complaintThemesTable).where(eq(complaintThemesTable.dataset, dataset));
  const out = { added: 0, updated: 0, skipped: 0, errors: [] as string[] };
  await db.transaction(async (tx) => {
    for (const [i, r] of rows.entries()) {
      const category = r.category!;
      const theme = cfg.themes.find((t) => norm(t) === norm(r.theme ?? ""));
      if (!category || /^<.*>$/.test(category)) {
        out.skipped++;
        out.errors.push(`Row ${i + 2}: no real category (placeholder or empty), skipped.`);
        continue;
      }
      if (!theme) {
        out.skipped++;
        out.errors.push(`Row ${i + 2}: "${r.theme}" is not a scoring theme.`);
        continue;
      }
      const cur = existing.find((e) => norm(e.category) === norm(category));
      if (cur) {
        if (cur.theme !== theme) {
          await tx.update(complaintThemesTable).set({ theme }).where(eq(complaintThemesTable.id, cur.id));
          out.updated++;
        } else out.skipped++;
      } else {
        const [n] = await tx.insert(complaintThemesTable).values({ dataset, category, theme }).returning();
        existing.push(n!);
        out.added++;
      }
    }
    await appendAudit({ dataset, role, action: "complaint_theme.imported", entityType: "complaint_theme", entityId: null, summary: `Imported complaint mappings from ${req.file!.originalname}: ${out.added} added, ${out.updated} updated, ${out.skipped} skipped.`, after: { added: out.added, updated: out.updated, skipped: out.skipped } }, tx);
  });
  res.json(out);
});

// ---------------- Complaint counts ----------------

async function complaintList(dataset: Dataset) {
  const [rows, banks, products, map] = await Promise.all([
    db.select().from(complaintsTable).where(eq(complaintsTable.dataset, dataset)).orderBy(asc(complaintsTable.bankId), asc(complaintsTable.category)),
    db.select().from(banksTable).where(eq(banksTable.dataset, dataset)),
    db.select().from(productsTable).where(eq(productsTable.dataset, dataset)),
    db.select().from(complaintThemesTable).where(eq(complaintThemesTable.dataset, dataset)),
  ]);
  return rows.map((r) => ({
    id: r.id,
    bankId: r.bankId,
    bankName: banks.find((b) => b.id === r.bankId)?.nameEn ?? "Unknown bank",
    productId: r.productId,
    productName: products.find((p) => p.id === r.productId)?.name ?? null,
    category: r.category,
    theme: map.find((m) => norm(m.category) === norm(r.category))?.theme ?? null,
    count: r.count,
    period: r.period,
  }));
}

router.get("/complaints", async (_req, res): Promise<void> => {
  res.json(ListComplaintsResponse.parse({ items: await complaintList(await getActiveDataset()) }));
});

async function checkBankProduct(dataset: Dataset, bankId: number, productId: number | null | undefined): Promise<string | null> {
  const [bank] = await db.select().from(banksTable).where(and(eq(banksTable.dataset, dataset), eq(banksTable.id, bankId)));
  if (!bank) return "Choose a bank from the library.";
  if (productId) {
    const [p] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    if (!p || p.bankId !== bankId) return "The product does not belong to that bank.";
  }
  return null;
}

router.post("/complaints", async (req, res): Promise<void> => {
  const role = requireWriter(req, res);
  if (!role) return;
  const b = CreateComplaintBody.safeParse(req.body);
  if (!b.success) {
    res.status(400).json({ error: "Enter a bank, a category and a whole number of complaints (0 or more)." });
    return;
  }
  const dataset = await getActiveDataset();
  const bad = await checkBankProduct(dataset, b.data.bankId, b.data.productId);
  if (bad) {
    res.status(400).json({ error: bad });
    return;
  }
  const row = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(complaintsTable)
      .values({ dataset, bankId: b.data.bankId, productId: b.data.productId ?? null, category: b.data.category.trim(), count: b.data.count, period: b.data.period?.trim() || null })
      .returning();
    await appendAudit({ dataset, role, action: "complaint.created", entityType: "complaint", entityId: String(r!.id), summary: `Added ${r!.count} complaint(s) under "${r!.category}".`, after: r }, tx);
    return r!;
  });
  res.status(201).json((await complaintList(dataset)).find((c) => c.id === row.id));
});

router.patch("/complaints/:id", async (req, res): Promise<void> => {
  const role = requireWriter(req, res);
  if (!role) return;
  const p = UpdateComplaintParams.safeParse(req.params);
  const b = CreateComplaintBody.safeParse(req.body);
  if (!p.success || !b.success) {
    res.status(400).json({ error: "Enter a bank, a category and a whole number of complaints (0 or more)." });
    return;
  }
  const dataset = await getActiveDataset();
  const [cur] = await db.select().from(complaintsTable).where(and(eq(complaintsTable.dataset, dataset), eq(complaintsTable.id, p.data.id)));
  if (!cur) {
    res.status(404).json({ error: "Complaint row not found." });
    return;
  }
  const bad = await checkBankProduct(dataset, b.data.bankId, b.data.productId);
  if (bad) {
    res.status(400).json({ error: bad });
    return;
  }
  await db.transaction(async (tx) => {
    const [r] = await tx
      .update(complaintsTable)
      .set({ bankId: b.data.bankId, productId: b.data.productId ?? null, category: b.data.category.trim(), count: b.data.count, period: b.data.period?.trim() || null })
      .where(eq(complaintsTable.id, cur.id))
      .returning();
    await appendAudit({ dataset, role, action: "complaint.updated", entityType: "complaint", entityId: String(cur.id), summary: `Changed complaint row "${r!.category}" to ${r!.count}.`, before: cur, after: r }, tx);
  });
  res.json((await complaintList(dataset)).find((c) => c.id === cur.id));
});

router.delete("/complaints/:id", async (req, res): Promise<void> => {
  const role = requireWriter(req, res);
  if (!role) return;
  const p = UpdateComplaintParams.safeParse(req.params);
  const dataset = await getActiveDataset();
  const [cur] = p.success ? await db.select().from(complaintsTable).where(and(eq(complaintsTable.dataset, dataset), eq(complaintsTable.id, p.data.id))) : [];
  if (!cur) {
    res.status(404).json({ error: "Complaint row not found." });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(complaintsTable).where(eq(complaintsTable.id, cur.id));
    await appendAudit({ dataset, role, action: "complaint.deleted", entityType: "complaint", entityId: String(cur.id), summary: `Removed complaint row "${cur.category}" (${cur.count}).`, before: cur }, tx);
  });
  res.status(204).end();
});

router.post("/complaints/import", async (req, res): Promise<void> => {
  if (!(await receiveFile(req, res, 5 * 1024 * 1024, "CSV file"))) return;
  const role = requireWriter(req, res);
  if (!role) return;
  const { rows, error } = readCsv(req.file!.buffer);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const h = rows[0] ?? {};
  const dataset = await getActiveDataset();
  const caseLevel = isCaseLevel(h);
  const countKey = ["count", "complaints", "volume", "number"].find((k) => k in h);
  if (!caseLevel && (!("bank" in h) || !("category" in h) || !countKey)) {
    res.status(400).json({
      error: "The CSV needs either the columns bank, category and count (product and period optional), or one row per complaint with LFI Name, Product and Category.",
    });
    return;
  }
  const [banks, products] = await Promise.all([
    db.select().from(banksTable).where(eq(banksTable.dataset, dataset)),
    db.select().from(productsTable).where(eq(productsTable.dataset, dataset)),
  ]);
  const out = { added: 0, updated: 0, skipped: 0, errors: [] as string[] };
  let items: (ComplaintAggregate & { line: string })[];
  let note = "";
  if (caseLevel) {
    const agg = aggregateCaseRows(rows);
    items = agg.items.map((a) => ({ ...a, line: `${a.bank} / ${a.category}${a.period ? ` / ${a.period}` : ""}` }));
    out.errors.push(...agg.skipped);
    out.skipped += agg.total - agg.credit;
    note = ` Counted ${agg.credit} credit-card complaints out of ${agg.total} rows; personal details were not stored.`;
  } else {
    items = rows.map((r, i) => ({
      bank: r.bank ?? "",
      product: r.product || null,
      category: r.category ?? "",
      period: r.period || null,
      count: Number(String(r[countKey!] ?? "").replace(/,/g, "")),
      line: `Row ${i + 2}`,
    }));
  }
  const existing = await db.select().from(complaintsTable).where(eq(complaintsTable.dataset, dataset));
  await db.transaction(async (tx) => {
    for (const r of items) {
      const bank = banks.find((b) => norm(b.nameEn) === norm(r.bank) || (b.nameAr && norm(b.nameAr) === norm(r.bank)));
      if (!bank) {
        out.skipped++;
        out.errors.push(`${r.line}: bank "${r.bank}" is not in the library.`);
        continue;
      }
      const product = r.product ? products.find((p) => p.bankId === bank.id && norm(p.name) === norm(r.product!)) : null;
      if (r.product && !product) {
        out.skipped++;
        out.errors.push(`${r.line}: ${bank.nameEn} has no product "${r.product}".`);
        continue;
      }
      if (!r.category || !Number.isInteger(r.count) || r.count < 0) {
        out.skipped++;
        out.errors.push(`${r.line}: needs a category and a whole number of complaints.`);
        continue;
      }
      // The same bank, product, category and period replaces the earlier count, so importing a file twice does not double it.
      const same = existing.find(
        (e) => e.bankId === bank.id && e.productId === (product?.id ?? null) && norm(e.category) === norm(r.category) && (e.period ?? "") === (r.period ?? ""),
      );
      if (same) {
        if (same.count !== r.count) {
          await tx.update(complaintsTable).set({ count: r.count }).where(eq(complaintsTable.id, same.id));
          out.updated++;
        } else out.skipped++;
        continue;
      }
      const [n] = await tx.insert(complaintsTable).values({ dataset, bankId: bank.id, productId: product?.id ?? null, category: r.category, count: r.count, period: r.period }).returning();
      existing.push(n!);
      out.added++;
    }
    await appendAudit(
      {
        dataset,
        role,
        action: "complaint.imported",
        entityType: "complaint",
        entityId: null,
        summary: `Imported complaint counts from ${req.file!.originalname}: ${out.added} added, ${out.updated} updated, ${out.skipped} skipped.${note}`,
        after: { added: out.added, updated: out.updated, skipped: out.skipped },
      },
      tx,
    );
  });
  const banksMissing = [...new Set(out.errors.filter((e) => e.includes("is not in the library")).map((e) => e.match(/bank "([^"]+)"/)?.[1]))];
  if (banksMissing.length) out.errors.unshift(`Add these banks in the library and import again to include them: ${banksMissing.join(", ")}.`);
  res.json({ ...out, errors: out.errors.slice(0, 50) });
});

// ---------------- Scorecard ----------------

router.get("/assessments/:id/scorecard", async (req, res): Promise<void> => {
  const p = GetAssessmentScorecardParams.safeParse(req.params);
  const dataset = await getActiveDataset();
  const card = p.success ? await buildScorecard(dataset, p.data.id) : null;
  if (!card) {
    res.status(404).json({ error: "Assessment not found." });
    return;
  }
  res.json(GetAssessmentScorecardResponse.parse(card));
});

export default router;
