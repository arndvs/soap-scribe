import { JANE, draftLines, expect, finishRecording, syncAndConfirm, test } from "./fixtures.js";

test("a visit end to end: record, confirm, draft, insert, sign (Story 1, T-01/T-03/T-05)", async ({ panel, jane }) => {
  await finishRecording("1001");
  await syncAndConfirm(panel, jane, ["Maria Lopez"]);

  await jane.goto(`${JANE}/patients/1001/chart`);
  await panel.getByRole("button", { name: "Chart", exact: true }).click();
  await panel.getByRole("button", { name: "Draft today's note" }).click();

  // Carry-forward with visible tags: the changed pain score is "updated", her library text is verbatim.
  await expect(panel.locator(".sentence.updated textarea").first()).toHaveValue("Low back 3/10.");
  await expect(panel.locator(".sentence.updated").first()).toHaveAttribute("title", "Was: Low back 5/10, worse at night.");
  // Her library wording verbatim, dated the way she dates "clinical advice" (G-17):
  // new today → "given", given on an earlier visit → "since" its first date (G-18).
  const lines = await draftLines(panel);
  expect(lines).toContainEqual(expect.stringMatching(/^Place a wedge under the belly when side-lying to support the lumbar spine — given \d+\/\d+\/\d\d$/));
  expect(lines).toContainEqual(expect.stringMatching(/^Cat-cow T\/S mobilization on hands and knees, slow and pain-free, 10 reps \(2x\/day\) — since \d+\/\d+\/\d\d$/));
  await expect(panel.locator(".chip", { hasText: /^from \d{4}-\d{2}-\d{2}$/ }).first()).toBeVisible();

  // She edits a line before inserting.
  const assessment = panel.locator(".section", { hasText: "Assessment" }).locator("textarea").first();
  await assessment.fill("Lumbar segmental dysfunction, pregnancy related, improving steadily.");

  await panel.getByRole("button", { name: "Insert into Jane" }).click();
  await expect(panel.getByText("Inserted. Review, then save and sign the note in Jane.")).toBeVisible();

  await expect(jane.locator("#soap-s")).toHaveValue(/Low back 3\/10\./);
  await expect(jane.locator("#soap-a")).toHaveValue(/improving steadily/);
  await expect(jane.locator("#soap-p")).toHaveValue(/Place a wedge under the belly/);

  // The extension never saves or signs; she does.
  await jane.getByRole("button", { name: "Save & sign" }).click();
  await expect(jane.locator("article[data-soap-note]").first()).toContainText("improving steadily");
});

test("a near-identical visit shows the clone warning (Story 4, T-04)", async ({ panel, jane }) => {
  await finishRecording("1002");
  await syncAndConfirm(panel, jane, ["James Carter"]);
  await jane.goto(`${JANE}/patients/1002/chart`);
  await panel.getByRole("button", { name: "Chart", exact: true }).click();
  await panel.getByRole("button", { name: "Draft today's note" }).click();
  await expect(panel.getByText("This note is almost the same as the last one")).toBeVisible();
});

test("never inserts into the wrong patient's chart (T-06)", async ({ panel, jane }) => {
  await finishRecording("1001");
  await syncAndConfirm(panel, jane, ["Maria Lopez"]);
  await jane.goto(`${JANE}/patients/1001/chart`);
  await panel.getByRole("button", { name: "Chart", exact: true }).click();
  await panel.getByRole("button", { name: "Draft today's note" }).click();
  await expect(panel.getByRole("button", { name: "Insert into Jane" })).toBeVisible();

  // The page changes underneath the panel without a navigation (as a single-page app can):
  // it now shows a different patient than its URL says.
  await jane.evaluate(() => document.querySelector("[data-soap-patient-id]")!.setAttribute("data-soap-patient-id", "1002"));
  await panel.getByRole("button", { name: "Insert into Jane" }).click();

  await expect(panel.getByRole("alert")).toContainText("but the draft is for patient 1001");
  for (const id of ["#soap-s", "#soap-o", "#soap-a", "#soap-p"]) await expect(jane.locator(id)).toHaveValue("");
});

test("a recording with no schedule yet still gets a suggestion after sync (G-25)", async ({ panel, jane }) => {
  await finishRecording("1003");
  await panel.getByRole("button", { name: "Today", exact: true }).click();
  await expect(panel.getByText("Confirm patient")).toBeVisible({ timeout: 10_000 });
  await syncAndConfirm(panel, jane, ["Priya Shah"]);
});

test("shows what the patient was given before and adds one back in one click (Story 3, G-18, T-11)", async ({ panel, jane }) => {
  await finishRecording("1001");
  await syncAndConfirm(panel, jane, ["Maria Lopez"]);
  await jane.goto(`${JANE}/patients/1001/chart`);
  await panel.getByRole("button", { name: "Chart", exact: true }).click();
  await panel.getByRole("button", { name: "Draft today's note" }).click();

  const prior = panel.locator("details.prior");
  await expect(prior.locator("summary")).toHaveText("Given before (2): Cat-cow, Lumbar pillow");
  await expect(prior.locator("li", { hasText: "Cat-cow" })).toContainText("in today's Plan");
  await prior.locator("li", { hasText: "Lumbar pillow" }).getByRole("button", { name: "Add to Plan" }).click();
  await expect(prior.locator("li", { hasText: "Lumbar pillow" })).toContainText("in today's Plan");

  await panel.getByRole("button", { name: "Insert into Jane" }).click();
  await expect(jane.locator("#soap-p")).toHaveValue(/Use a lumbar pillow when sitting for more than 20 minutes — since /);
});

test("shows what was said behind a sentence (Story 4, G-19)", async ({ panel, jane }) => {
  await finishRecording("1001");
  await syncAndConfirm(panel, jane, ["Maria Lopez"]);
  await jane.goto(`${JANE}/patients/1001/chart`);
  await panel.getByRole("button", { name: "Chart", exact: true }).click();
  await panel.getByRole("button", { name: "Draft today's note" }).click();
  const pain = panel.locator(".sentence.updated", { has: panel.locator("textarea") }).first();
  await pain.getByText("What was said").click();
  await expect(pain.locator(".evidence li").first()).toContainText("About a three out of ten");
});

test("a visit with no recording is visible and can be drafted from previous notes (Story 2, G-23, T-08)", async ({ panel, jane }) => {
  await jane.goto(`${JANE}/admin/schedule`);
  await panel.getByRole("button", { name: "Today", exact: true }).click();
  await panel.getByRole("button", { name: "Sync schedule" }).click();
  const row = panel.locator("li.card.no-recording", { hasText: "Priya Shah" });
  await expect(row).toContainText("No recording");
  await expect(panel.getByText("0 of 3 notes inserted")).toBeVisible();

  await row.getByRole("button", { name: "Open chart" }).click(); // G-22
  await expect(jane).toHaveURL(`${JANE}/patients/1003/chart`);
  await panel.getByRole("button", { name: "Chart", exact: true }).click();
  await panel.getByRole("button", { name: "Visit wasn't recorded? Draft from previous notes" }).click();

  await expect(panel.locator(".flags")).toContainText("No recording for this visit: everything here is carried from");
  expect(await panel.locator(".sentence.today").count()).toBe(0);
  await panel.getByRole("button", { name: "Insert into Jane" }).click();
  await expect(jane.locator("#soap-o")).toHaveValue("T6 left posterior.");

  await panel.getByRole("button", { name: "Today", exact: true }).click();
  await expect(panel.getByText("1 of 3 notes inserted")).toBeVisible();
});
