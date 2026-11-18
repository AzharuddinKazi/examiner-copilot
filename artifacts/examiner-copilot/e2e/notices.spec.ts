import { expect, test, type Page } from "@playwright/test";
import { ASSESSMENT_ID, FakeApi, PEOPLE, addBusinessDays, todayInDubai, type Person } from "./fake-api";

/**
 * The Notices screens (report list and report detail) for each kind of person:
 * the examiner who drafts and sends a report, a different senior examiner who approves or returns it,
 * the sender who may not approve their own report, and a viewer who can only read.
 */

let api: FakeApi;

test.beforeEach(async ({ page }) => {
  api = new FakeApi();
  await api.attach(page);
});

test.afterEach(() => {
  expect(api.unknown, "the page called API endpoints the test fake does not know").toEqual([]);
});

/** Switches who is signed in and reloads, as when another person opens the app. */
async function openAs(page: Page, who: Person, path: string) {
  api.signInAs(who);
  await page.goto(path);
}

const toast = (page: Page, title: string) => page.getByText(title, { exact: true }).first();

test("an examiner drafts a report, edits a requested fix and its due date, and sends it for approval", async ({ page }) => {
  await openAs(page, PEOPLE.maker, "/notices");

  await expect(page.getByTestId("text-answer")).toHaveText("No reports yet. 1 card has approved breaches or warnings ready to report.");
  await expect(page.getByTestId("text-viewer-reason")).toHaveCount(0);
  await page.getByTestId(`button-draft-${ASSESSMENT_ID}`).click();

  // Drafting opens the new report.
  await expect(page).toHaveURL(/\/notices\/7$/);
  await expect(page.getByTestId("state-notice")).toHaveText("Draft");
  await expect(page.getByTestId("text-no-history")).toBeVisible();
  expect(api.writes[0]).toMatchObject({ method: "POST", path: "/notices", body: { assessmentId: ASSESSMENT_ID }, status: 200 });

  // A new report starts on today's reference date, with a default due date per finding (as on the server).
  const today = todayInDubai();
  const defaultDue = addBusinessDays(today, 20);
  await expect(page.getByTestId("input-reference-date")).toHaveValue(today);
  await expect(page.getByTestId("input-due-101")).toHaveValue(defaultDue);
  await expect(page.getByTestId("button-submit-notice")).toBeEnabled();

  // Change the reference date; the bank's response date follows it.
  await page.getByTestId("input-reference-date").fill("2026-11-19");
  await page.getByTestId("button-save-reference-date").click();
  await expect(toast(page, "Saved: reference date")).toBeVisible();
  await expect(page.getByTestId("text-response-due")).toContainText("9 Dec 2026");
  expect(addBusinessDays("2026-11-19", 14)).toBe("2026-12-09");

  // Edit what the bank must do and by when. Unsaved edits block sending.
  const action = page.getByTestId("input-action-101");
  await expect(action).toHaveValue("Correct the disclosure so that it meets R-1.");
  await action.fill("Add the annual fee of AED 300 to the fee table.");
  await page.getByTestId("input-due-101").fill("2026-12-16");
  await expect(page.getByTestId("text-submit-blocker")).toHaveText("Save or discard your unsaved changes first.");
  await expect(page.getByTestId("button-submit-notice")).toBeDisabled();

  // Discard puts the saved values back; then edit again and save.
  await page.getByTestId("button-discard-action-101").click();
  await expect(action).toHaveValue("Correct the disclosure so that it meets R-1.");
  await expect(page.getByTestId("input-due-101")).toHaveValue(defaultDue);
  await action.fill("Add the annual fee of AED 300 to the fee table.");
  await page.getByTestId("input-due-101").fill("2026-12-16");
  await page.getByTestId("button-save-action-101").click();
  await expect(toast(page, "Saved: action for R-1")).toBeVisible();
  await expect(page.getByTestId("button-save-action-101")).toHaveCount(0);
  expect(api.writes.at(-1)).toMatchObject({
    method: "PATCH", path: "/notices/7", status: 200,
    body: { findings: [{ findingId: 101, action: "Add the annual fee of AED 300 to the fee table.", dueDate: "2026-12-16" }] },
  });

  // The saved edit is still there after a reload.
  await page.reload();
  await expect(page.getByTestId("input-action-101")).toHaveValue("Add the annual fee of AED 300 to the fee table.");
  await expect(page.getByTestId("input-due-101")).toHaveValue("2026-12-16");

  // Send for approval: the report locks, and the sender is told someone else must approve it.
  await expect(page.getByTestId("text-submit-blocker")).toHaveCount(0);
  await page.getByTestId("button-submit-notice").click();
  await expect(toast(page, "Sent for approval")).toBeVisible();
  await expect(page.getByTestId("state-notice")).toHaveText("Awaiting approval");
  await expect(page.getByTestId("text-awaiting")).toContainText("Sent for approval by Maya Examiner");
  await expect(page.getByTestId("text-who-approves")).toHaveText("You sent this report, so a different senior examiner must approve it.");
  await expect(page.getByTestId("form-notice-approval")).toHaveCount(0);
  await expect(page.getByTestId("input-action-101")).toHaveCount(0);
  await expect(page.getByTestId("text-action-101")).toHaveText("Add the annual fee of AED 300 to the fee table.");
  await expect(page.getByTestId("text-due-101")).toHaveText("Fix by 16 Dec 2026");
  await expect(page.getByTestId("button-delete-notice")).toHaveCount(0);
  await expect(page.getByTestId("list-notice-history")).toContainText("Sent for approval");
  expect(api.writes.at(-1)).toMatchObject({ method: "POST", path: "/notices/7/submit", status: 200 });

  // The list shows the new state.
  await page.goto("/notices");
  await expect(page.getByTestId("state-notice-7")).toHaveText("Awaiting approval");
  await expect(page.getByTestId("text-answer")).toHaveText("1 report: 1 awaiting a senior examiner's approval.");
  await expect(page.getByTestId(`button-open-${ASSESSMENT_ID}`)).toBeVisible();
});

test("a report without a reference date cannot be sent until one is set", async ({ page }) => {
  const id = api.seed({ referenceDate: null });
  await openAs(page, PEOPLE.maker, `/notices/${id}`);
  await expect(page.getByTestId("button-submit-notice")).toBeDisabled();
  await expect(page.getByTestId("text-submit-blocker")).toHaveText("Set a reference date first.");
  await page.getByTestId("input-reference-date").fill("2026-11-19");
  await page.getByTestId("button-save-reference-date").click();
  await expect(toast(page, "Saved: reference date")).toBeVisible();
  await expect(page.getByTestId("text-submit-blocker")).toHaveCount(0);
  await expect(page.getByTestId("button-submit-notice")).toBeEnabled();
  expect(api.writes.at(-1)).toMatchObject({ method: "PATCH", path: `/notices/${id}`, body: { referenceDate: "2026-11-19" }, status: 200 });
});

test("a senior examiner cannot approve their own report; a different one returns it with a note, then approves it", async ({ page }) => {
  const id = api.seed({ steps: [{ action: "submit", by: PEOPLE.senior }] });

  // The sender, although a senior examiner, gets no approve or return buttons.
  await openAs(page, PEOPLE.senior, `/notices/${id}`);
  await expect(page.getByTestId("state-notice")).toHaveText("Awaiting approval");
  await expect(page.getByTestId("text-who-approves")).toHaveText("You sent this report, so a different senior examiner must approve it.");
  await expect(page.getByTestId("form-notice-approval")).toHaveCount(0);

  // An examiner (not senior) cannot approve either.
  await openAs(page, PEOPLE.maker, `/notices/${id}`);
  await expect(page.getByTestId("text-who-approves")).toHaveText("A senior examiner other than Sara Senior must approve it.");
  await expect(page.getByTestId("form-notice-approval")).toHaveCount(0);

  // A different senior examiner can. Returning needs a note.
  await openAs(page, PEOPLE.otherSenior, `/notices/${id}`);
  await expect(page.getByTestId("form-notice-approval")).toBeVisible();
  const writesBefore = api.writes.length;
  await page.getByTestId("button-return").click();
  await expect(page.getByTestId("text-approval-error")).toHaveText("Write a note telling the examiner what to change.");
  expect(api.writes.length, "no request is sent without a note").toBe(writesBefore);

  await page.getByTestId("input-checker-note").fill("Cite the fee schedule page for R-1.");
  await page.getByTestId("button-return").click();
  await expect(toast(page, "Report returned")).toBeVisible();
  await expect(page.getByTestId("state-notice")).toHaveText("Returned");
  await expect(page.getByTestId("text-checker-note")).toContainText("Cite the fee schedule page for R-1.");
  expect(api.writes.at(-1)).toMatchObject({
    method: "POST", path: `/notices/${id}/approval`, as: "senior_examiner", status: 200,
    body: { action: "return", note: "Cite the fee schedule page for R-1." },
  });

  // The sender sees the returned block with the note, can edit again, and resends.
  await openAs(page, PEOPLE.senior, `/notices/${id}`);
  await expect(page.getByTestId("block-returned")).toContainText("Returned by Omar Senior");
  await expect(page.getByTestId("text-checker-note")).toContainText("Cite the fee schedule page for R-1.");
  await page.getByTestId("input-action-101").fill("Add the annual fee to the fee table on page 2 of the fee schedule.");
  await page.getByTestId("button-save-action-101").click();
  await expect(toast(page, "Saved: action for R-1")).toBeVisible();
  await page.getByTestId("button-submit-notice").click();
  await expect(page.getByTestId("state-notice")).toHaveText("Awaiting approval");

  // The other senior examiner approves with a note; the report is locked for everyone.
  await openAs(page, PEOPLE.otherSenior, `/notices/${id}`);
  await page.getByTestId("input-checker-note").fill("Evidence is clear.");
  await page.getByTestId("button-approve").click();
  await expect(toast(page, "Report approved")).toBeVisible();
  await expect(page.getByTestId("state-notice")).toHaveText("Approved");
  await expect(page.getByTestId("text-approved")).toContainText("Approved by Omar Senior");
  await expect(page.getByTestId("text-approved")).toContainText("prepared by Sara Senior");
  await expect(page.getByTestId("text-not-approved")).toHaveCount(0);
  expect(api.writes.at(-1)).toMatchObject({ path: `/notices/${id}/approval`, body: { action: "approve", note: "Evidence is clear." }, status: 200 });

  await openAs(page, PEOPLE.senior, `/notices/${id}`);
  await expect(page.getByTestId("text-approved")).toBeVisible();
  await expect(page.getByTestId("input-action-101")).toHaveCount(0);
  await expect(page.getByTestId("input-reference-date")).toHaveCount(0);
  await expect(page.getByTestId("form-submit-notice")).toHaveCount(0);
  await expect(page.getByTestId("text-action-101")).toHaveText("Add the annual fee to the fee table on page 2 of the fee schedule.");
  const history = page.getByTestId("list-notice-history");
  await expect(history.locator("li")).toHaveCount(4);
  await expect(history.locator("li").first()).toContainText("Approved");
  await expect(history).toContainText("Cite the fee schedule page for R-1.");

  // Every write in this test came from a person allowed to make it.
  expect(api.writes.every((w) => w.status === 200)).toBe(true);
});

test("a viewer can read the reports but not draft, edit, send or approve", async ({ page }) => {
  await openAs(page, PEOPLE.viewer, "/notices");
  await expect(page.getByTestId("text-viewer-reason")).toBeVisible();
  await expect(page.getByTestId(`button-draft-${ASSESSMENT_ID}`)).toBeDisabled();
  await expect(page.getByTestId("button-primary")).toBeDisabled();

  // A draft: everything shows as read-only text.
  const draft = api.seed({});
  await openAs(page, PEOPLE.viewer, `/notices/${draft}`);
  await expect(page.getByTestId("state-notice")).toHaveText("Draft");
  await expect(page.getByTestId("text-viewer-reason")).toBeVisible();
  await expect(page.getByTestId("text-reference-date")).toHaveText("19 Nov 2026");
  await expect(page.getByTestId("text-body")).toHaveText("Please respond in writing.");
  await expect(page.getByTestId("text-action-101")).toHaveText("Correct the disclosure so that it meets R-1.");
  await expect(page.getByTestId("text-due-101")).toHaveText("Fix by 17 Dec 2026");
  for (const id of ["input-reference-date", "input-body", "input-action-101", "input-due-101", "checkbox-include-101",
    "form-submit-notice", "button-submit-notice", "button-delete-notice", "button-sync-notice"]) {
    await expect(page.getByTestId(id), `${id} should not be shown to a viewer`).toHaveCount(0);
  }
  // Downloads stay available.
  await expect(page.getByTestId("button-download-pdf")).toBeEnabled();

  // A report awaiting approval: no approve or return controls for a viewer.
  api.notices.clear();
  const awaiting = api.seed({ steps: [{ action: "submit", by: PEOPLE.maker }] });
  await openAs(page, PEOPLE.viewer, `/notices/${awaiting}`);
  await expect(page.getByTestId("state-notice")).toHaveText("Awaiting approval");
  await expect(page.getByTestId("text-who-approves")).toHaveText("A senior examiner other than Maya Examiner must approve it.");
  await expect(page.getByTestId("form-notice-approval")).toHaveCount(0);
  await expect(page.getByTestId("button-approve")).toHaveCount(0);

  expect(api.writes, "a viewer's page sent no changes").toEqual([]);
});
