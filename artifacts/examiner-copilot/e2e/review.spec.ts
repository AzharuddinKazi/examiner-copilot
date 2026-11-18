import { expect, test, type Page } from "@playwright/test";
import { FakeApi, PEOPLE, type Person } from "./fake-api";

/**
 * The maker-checker step in Review (queue and finding page): an examiner decides, a Breach or any change or
 * rejection waits for approval, the maker cannot approve it, a different senior examiner approves or returns
 * it with a note, a returned decision goes back to the maker, and a viewer can only read.
 * Findings: 201 = R-1 proposed Breach, 202 = R-4 proposed Warning, 203 = R-7 proposed Compliant.
 */

let api: FakeApi;

test.beforeEach(async ({ page }) => {
  api = new FakeApi();
  await api.attach(page);
});

test.afterEach(() => {
  expect(api.unknown, "the page called API endpoints the test fake does not know").toEqual([]);
});

async function openAs(page: Page, who: Person, path: string) {
  api.signInAs(who);
  await page.goto(path);
}

const toast = (page: Page, title: string) => page.getByText(title, { exact: true }).first();

test("an examiner's decisions await approval; a different senior examiner returns one with a note and approves the other; the returned one goes back to the maker", async ({ page }) => {
  // The maker sees every finding waiting for a decision.
  await openAs(page, PEOPLE.maker, "/review");
  await expect(page.getByTestId("text-answer")).toHaveText("3 of 3 findings await your decision, 2 of them breach, warning or needs review.");
  await expect(page.getByTestId("filter-review-to_approve"), "only senior examiners get a To approve filter").toHaveCount(0);

  // Accepting a proposed Breach needs approval.
  await page.getByTestId("row-review-201").click();
  await expect(page).toHaveURL(/\/review\/201$/);
  await expect(page.getByTestId("text-undecided")).toBeVisible();
  await expect(page.getByTestId("text-approval-needed")).toBeVisible();
  await page.getByTestId("button-submit-decision").click();
  await expect(toast(page, "Accepted: R-1")).toBeVisible();
  expect(api.writes.at(-1)).toMatchObject({ method: "POST", path: "/findings/201/decisions", status: 201, body: { decision: "accept", finalStatus: null } });

  // The page moves on to the next undecided finding. Changing a Warning needs a status and a note.
  await expect(page).toHaveURL(/\/review\/202$/);
  await page.getByRole("radio", { name: /Modify/ }).click();
  await expect(page.getByTestId("button-submit-decision")).toBeDisabled();
  await page.getByTestId("select-final-status").click();
  await page.getByRole("option", { name: "Compliant" }).click();
  await expect(page.getByTestId("button-submit-decision"), "a change needs a note").toBeDisabled();
  await page.getByTestId("input-examiner-note").fill("The cap is in the main terms on page 3.");
  await expect(page.getByTestId("text-approval-needed")).toBeVisible();
  await page.getByTestId("button-submit-decision").click();
  await expect(toast(page, "Changed: R-4")).toBeVisible();
  expect(api.writes.at(-1)).toMatchObject({
    path: "/findings/202/decisions", status: 201,
    body: { decision: "modify", finalStatus: "compliant", examinerNote: "The cap is in the main terms on page 3." },
  });

  // Both show as Awaiting approval in the queue.
  await page.goto("/review");
  await expect(page.getByTestId("text-answer")).toHaveText("1 of 3 findings await your decision.");
  await page.getByTestId("filter-review-awaiting").click();
  await expect(page.getByTestId("list-review").locator("li")).toHaveCount(2);
  await expect(page.getByTestId("outcome-201")).toContainText("Awaiting approval");
  await expect(page.getByTestId("outcome-202")).toContainText("Awaiting approval");

  // The maker cannot approve their own decision.
  await page.getByTestId("row-review-201").click();
  await expect(page.getByTestId("block-current-decision")).toContainText("You decided");
  await expect(page.getByTestId("block-current-decision")).toContainText("Awaiting approval");
  await expect(page.getByTestId("text-own-decision")).toHaveText("You made this decision, so a different senior examiner must approve it.");
  await expect(page.getByTestId("form-approval")).toHaveCount(0);
  await expect(page.getByTestId("button-approve")).toHaveCount(0);

  // A senior examiner sees both waiting for them.
  await openAs(page, PEOPLE.senior, "/review");
  await expect(page.getByTestId("banner-to-approve")).toContainText("2 decisions to approve.");
  await page.getByTestId("button-show-to-approve").click();
  await expect(page.getByTestId("filter-review-to_approve")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("list-review").locator("li")).toHaveCount(2);

  // Returning needs a note; nothing is sent without one.
  await page.getByTestId("row-review-201").click();
  await expect(page.getByTestId("block-current-decision")).toContainText("Maya Examiner (Examiner) decided");
  await expect(page.getByTestId("form-approval")).toBeVisible();
  const writesBefore = api.writes.length;
  await page.getByTestId("button-return").click();
  await expect(page.getByTestId("text-approval-error")).toHaveText("Write a note telling the examiner what to change.");
  expect(api.writes.length, "no request is sent without a note").toBe(writesBefore);
  await page.getByTestId("input-checker-note").fill("Quote the fee table on page 2.");
  await page.getByTestId("button-return").click();
  await expect(toast(page, "Returned: R-1")).toBeVisible();
  await expect(page.getByTestId("tag-approval-returned").first()).toBeVisible();
  await expect(page.getByTestId("block-checker")).toContainText("Returned by Sara Senior");
  await expect(page.getByTestId("block-checker")).toContainText("Quote the fee table on page 2.");
  await expect(page.getByTestId("form-approval")).toHaveCount(0);
  const returned = api.writes.at(-1)!;
  expect(returned).toMatchObject({ as: "senior_examiner", status: 200, body: { action: "return", note: "Quote the fee table on page 2." } });
  expect(returned.path).toMatch(/^\/decisions\/\d+\/approval$/);

  // Approving the change counts it as final.
  await page.goto("/review/202");
  await page.getByTestId("input-checker-note").fill("Agreed.");
  await page.getByTestId("button-approve").click();
  await expect(toast(page, "Approved: R-4")).toBeVisible();
  await expect(page.getByTestId("block-checker")).toContainText("Approved by Sara Senior");
  await expect(page.getByTestId("tag-self-approved")).toHaveCount(0);
  expect(api.writes.at(-1)).toMatchObject({ status: 200, body: { action: "approve", note: "Agreed." } });
  await page.goto("/review");
  await expect(page.getByTestId("banner-to-approve")).toHaveCount(0);
  await page.getByTestId("filter-review-decided").click();
  await expect(page.getByTestId("outcome-202")).toContainText("Approved");

  // The returned decision reappears for the maker, with the checker's note.
  await openAs(page, PEOPLE.maker, "/review");
  await expect(page.getByTestId("text-answer")).toHaveText("2 of 3 findings await your decision, 1 of them breach, warning or needs review; 1 were returned with a note.");
  await expect(page.getByTestId("outcome-201")).toContainText("Returned");
  await page.getByTestId("filter-review-returned").click();
  await expect(page.getByTestId("list-review").locator("li")).toHaveCount(1);
  await page.getByTestId("row-review-201").click();
  await expect(page.getByTestId("block-checker")).toContainText("Quote the fee table on page 2.");
  await expect(page.getByTestId("block-checker")).toContainText("Returned to the examiner: record a new decision below.");

  // The maker records a new decision; it waits for approval again and the old one stays in the history.
  await page.getByTestId("input-examiner-note").fill("The fee table on page 2 omits the AED 300 annual fee.");
  await expect(page.getByTestId("button-submit-decision")).toHaveText("Record new decision");
  await page.getByTestId("button-submit-decision").click();
  await expect(toast(page, "Accepted: R-1")).toBeVisible();
  await page.goto("/review/201");
  await expect(page.getByTestId("block-current-decision")).toContainText("Awaiting approval");
  await expect(page.getByTestId("text-own-decision")).toBeVisible();
  const history = page.getByTestId("list-history");
  await expect(history.locator("li")).toHaveCount(2);
  await expect(history.locator("li").nth(1)).toContainText("Returned by Sara Senior");

  expect(api.writes.every((w) => w.status < 300), "every write came from a person allowed to make it").toBe(true);
});

test("a senior examiner cannot approve their own decision; an examiner cannot approve anyone's; a different senior examiner can", async ({ page }) => {
  api.review.seedDecision({ findingId: 202, decision: "reject", note: "The cap is in the main terms.", by: PEOPLE.senior });

  // The senior examiner who made it gets no approve or return controls and nothing to approve in the queue.
  await openAs(page, PEOPLE.senior, "/review");
  await expect(page.getByTestId("banner-to-approve")).toHaveCount(0);
  await expect(page.getByTestId("filter-review-to_approve")).toHaveText("To approve (0)");
  await page.goto("/review/202");
  await expect(page.getByTestId("block-current-decision")).toContainText("You decided");
  await expect(page.getByTestId("text-own-decision")).toBeVisible();
  await expect(page.getByTestId("form-approval")).toHaveCount(0);

  // An examiner (not senior) is told a senior examiner must approve it.
  await openAs(page, PEOPLE.maker, "/review/202");
  await expect(page.getByTestId("text-needs-senior")).toHaveText("A senior examiner must approve this decision before it counts.");
  await expect(page.getByTestId("form-approval")).toHaveCount(0);

  // A different senior examiner can approve it.
  await openAs(page, PEOPLE.otherSenior, "/review");
  await expect(page.getByTestId("banner-to-approve")).toContainText("1 decision to approve.");
  await page.goto("/review/202");
  await page.getByTestId("button-approve").click();
  await expect(toast(page, "Approved: R-4")).toBeVisible();
  await expect(page.getByTestId("block-checker")).toContainText("Approved by Omar Senior");
  expect(api.writes).toHaveLength(1);
  expect(api.writes[0]).toMatchObject({ as: "senior_examiner", status: 200, body: { action: "approve", note: null } });
});

test("a viewer can read the queue and findings but cannot decide, approve or return", async ({ page }) => {
  api.review.seedDecision({ findingId: 201, decision: "accept", by: PEOPLE.maker });

  await openAs(page, PEOPLE.viewer, "/review");
  await expect(page.getByTestId("text-viewer-reason")).toBeVisible();
  await expect(page.getByTestId("filter-review-to_approve")).toHaveCount(0);
  await expect(page.getByTestId("banner-to-approve")).toHaveCount(0);
  await expect(page.getByTestId("button-bulk-52")).toBeDisabled();

  // An undecided finding: the decision cannot be recorded.
  await page.goto("/review/202");
  await expect(page.getByTestId("text-undecided")).toBeVisible();
  await expect(page.getByTestId("button-submit-decision")).toBeDisabled();
  await expect(page.getByTestId("text-viewer-reason")).toBeVisible();

  // A decision awaiting approval: no approve or return controls.
  await page.goto("/review/201");
  await expect(page.getByTestId("block-current-decision")).toContainText("Awaiting approval");
  await expect(page.getByTestId("text-needs-senior")).toBeVisible();
  for (const id of ["form-approval", "input-checker-note", "button-approve", "button-return"]) {
    await expect(page.getByTestId(id), `${id} should not be shown to a viewer`).toHaveCount(0);
  }
  await expect(page.getByTestId("button-submit-decision")).toBeDisabled();

  expect(api.writes, "a viewer's page sent no changes").toEqual([]);
});
