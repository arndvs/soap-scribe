import { resolve } from "node:path";
import { JANE, finishRecording, syncAndConfirm, test } from "./fixtures.js";

// Regenerates the README screenshots from demo mode (synthetic patients only):
//   SCREENSHOTS=1 E2E_TZ=America/Los_Angeles pnpm test:e2e screenshots
const OUT = resolve(import.meta.dirname, "../../../docs/images");
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate the README images");

test("README screenshots", async ({ panel, jane }) => {
  await panel.setViewportSize({ width: 400, height: 900 });
  await jane.setViewportSize({ width: 900, height: 900 });
  await finishRecording("1001");
  await finishRecording("1002");
  await syncAndConfirm(panel, jane, ["Maria Lopez", "James Carter"]);
  await panel.screenshot({ path: `${OUT}/today.png`, clip: { x: 0, y: 0, width: 400, height: 520 } });

  await jane.goto(`${JANE}/patients/1001/chart`);
  await panel.getByRole("button", { name: "Chart", exact: true }).click();
  await panel.getByRole("button", { name: "Draft today's note" }).click();
  await panel.locator(".sentence.updated").first().getByText("What was said").click();
  await panel.setViewportSize({ width: 400, height: 1060 }); // tall enough for the whole draft; a full-page shot catches the sticky Insert bar mid-page
  await panel.screenshot({ path: `${OUT}/chart-draft.png` });

  await panel.getByRole("button", { name: "Insert into Jane" }).click();
  await panel.getByText("Inserted.").waitFor();
  await jane.screenshot({ path: `${OUT}/jane-inserted.png` });
});
