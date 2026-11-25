import { JANE, draftLines, expect, finishRecording, syncAndConfirm, test } from "./fixtures.js";

test("a visit end to end: record, confirm, draft, insert, sign (Story 1, T-01/T-03/T-05)", async ({ panel, jane }) => {
  await finishRecording("1001");
  await syncAndConfirm(panel, jane, ["Maria Lopez"]);

  await jane.goto(`${JANE}/patients/1001/chart`);
  await panel.getByRole("button", { name: "Chart" }).click();
  await panel.getByRole("button", { name: "Draft today's note" }).click();

  // Carry-forward with visible tags: the changed pain score is "updated", her library text is verbatim.
  await expect(panel.locator(".sentence.updated textarea").first()).toHaveValue("Low back 3/10.");
  await expect(panel.locator(".sentence.updated").first()).toHaveAttribute("title", "Was: Low back 5/10, worse at night.");
  const lines = await draftLines(panel);
  expect(lines).toContain("Place a wedge under the belly when side-lying to support the lumbar spine");
  expect(lines).toContain("Cat-cow T/S mobilization on hands and knees, slow and pain-free, 10 reps (2x/day)");
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
  await panel.getByRole("button", { name: "Chart" }).click();
  await panel.getByRole("button", { name: "Draft today's note" }).click();
  await expect(panel.getByText("This note is almost the same as the last one")).toBeVisible();
});

test("never inserts into the wrong patient's chart (T-06)", async ({ panel, jane }) => {
  await finishRecording("1001");
  await syncAndConfirm(panel, jane, ["Maria Lopez"]);
  await jane.goto(`${JANE}/patients/1001/chart`);
  await panel.getByRole("button", { name: "Chart" }).click();
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
  await panel.getByRole("button", { name: "Today" }).click();
  await expect(panel.getByText("Confirm patient")).toBeVisible({ timeout: 10_000 });
  await syncAndConfirm(panel, jane, ["Priya Shah"]);
});
