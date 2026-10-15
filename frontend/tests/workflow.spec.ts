import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const samples = path.resolve(__dirname, "../../samples");

test("upload, tailor, review, edit, and download via the real backend", async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));
  const connected = page.waitForResponse((response) =>
    response.url().endsWith("/health"),
  );
  await page.goto("/");
  await connected;
  await expect(
    page.getByRole("heading", { name: "A better fit for your next role." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Customize Resume", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("empty.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Customize Resume", exact: true })
    .click();
  await expect(
    page.getByRole("alert", { name: "We couldn’t complete that step" }),
  ).toContainText("Upload a PDF or DOCX resume before customizing.");
  await expect(
    page.getByRole("alert", { name: "We couldn’t complete that step" }),
  ).toBeFocused();
  await page
    .getByLabel("Job description", { exact: true })
    .fill(
      await fs.readFile(path.join(samples, "job-description.txt"), "utf-8"),
    );
  await page
    .getByLabel("Your resume", { exact: true })
    .setInputFiles(path.join(samples, "alex-morgan.docx"));
  await expect(
    page.getByText("Ready to tailor", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Resume document" }),
  ).toContainText("Alex Morgan");
  await expect(
    page.getByText("Original resume · Before tailoring"),
  ).toBeVisible();
  await expect(page.getByText("2 / 2 inputs added")).toBeVisible();
  await page.getByText("Preview extracted text").click();
  await expect(page.locator(".extraction-preview pre")).toContainText(
    "Alex Morgan",
  );
  await page.getByRole("checkbox", { name: "Projects", exact: true }).click();
  await page
    .getByRole("button", { name: "Customize Resume", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Tailored Resume", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Resume document" }),
  ).toContainText("Alex Morgan");
  await expect(
    page.getByRole("article", { name: "Resume document" }),
  ).not.toContainText("Kubernetes");
  await page.getByRole("tab", { name: /Changes/ }).click();
  await expect(page.getByText("Every change, in the open")).toBeVisible();
  await expect(page.locator(".change-after").first()).toBeVisible();
  await page.getByRole("tab", { name: "Suggestions" }).click();
  await expect(page.locator(".suggestion-card")).toContainText("Kubernetes");
  await expect(page.locator(".suggestion-card")).toContainText("Confirm first");
  await page.getByRole("tab", { name: "Tailored Resume", exact: true }).click();
  await page.getByRole("button", { name: "Edit resume", exact: true }).click();
  await page
    .getByLabel("Summary", { exact: true })
    .fill("My manually reviewed résumé with café experience.");
  const skills = page.getByLabel("Skills separated by middle dots");
  await skills.press("ControlOrMeta+End");
  await skills.pressSequentially(" · Documentation");
  await expect(skills).toHaveValue(/ · Documentation$/);
  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(page.getByRole("article")).toContainText(
    "My manually reviewed résumé with café experience.",
  );
  for (const format of ["TXT", "PDF", "DOCX"]) {
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: format, exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe(
      `tailorcv-resume.${format.toLowerCase()}`,
    );
    const saved = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(saved);
    const bytes = await fs.readFile(saved);
    expect(bytes.length).toBeGreaterThan(100);
    if (format === "TXT")
      expect(bytes.toString("utf-8")).toContain(
        "My manually reviewed résumé with café experience.",
      );
    if (format === "PDF") expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    if (format === "DOCX") expect(bytes.subarray(0, 2).toString()).toBe("PK");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "DOCX", exact: true }),
  ).toBeFocused();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: testInfo.outputPath("reviewed.png"),
    fullPage: true,
  });
  expect(browserErrors).toEqual([]);
});

test("preview, connection recovery, help, and start-over keep the user in control", async ({
  page,
}) => {
  await page.route("**/health", (route) => route.abort("connectionfailed"));
  await page.goto("/");
  await expect(
    page.getByText("The connection was interrupted.", { exact: false }),
  ).toBeVisible();
  await page
    .locator(".topbar")
    .getByRole("button", { name: "How it works", exact: true })
    .click();
  const help = page.getByRole("dialog", { name: /Your next application/ });
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).not.toBeVisible();
  await page
    .getByLabel("Your resume", { exact: true })
    .setInputFiles(path.join(samples, "alex-morgan.docx"));
  await expect(page.getByRole("article")).toContainText("Alex Morgan");
  await expect(
    page.getByText("The connection was interrupted.", { exact: false }),
  ).not.toBeVisible();
  await page
    .getByLabel("Job description", { exact: true })
    .fill("An application I want to keep while reviewing the new interface.");
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  const reset = page.getByRole("dialog", { name: "Start a new application?" });
  await expect(reset).toBeVisible();
  await reset.getByRole("button", { name: "Keep working" }).click();
  await expect(page.getByLabel("Job description", { exact: true })).toHaveValue(
    "An application I want to keep while reviewing the new interface.",
  );
  await expect(page.getByRole("article")).toContainText("Alex Morgan");
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await reset.getByRole("button", { name: "Start fresh" }).click();
  await expect(reset).not.toBeVisible();
  await expect(page.getByLabel("Job description", { exact: true })).toBeEmpty();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Customize Resume", exact: true }),
  ).toBeEnabled();
});

test("Customize explains quota and validation blockers, then works after preparation recovers", async ({
  page,
}, testInfo) => {
  let parseCount = 0;
  let customizeRequests = 0;
  page.on("request", (request) => {
    if (
      request.url().endsWith("/api/resume/customize") &&
      request.method() === "POST"
    )
      customizeRequests++;
  });
  await page.route("**/api/resume/parse", async (route) => {
    const response = await route.fetch();
    const parsed = await response.json();
    parseCount++;
    if (parseCount === 1) {
      await route.fulfill({
        response,
        json: {
          ...parsed,
          structured_resume: null,
          source_token: null,
          warnings: [
            {
              code: "PROVIDER_QUOTA",
              message:
                "Text extracted, but the daily provider quota has been reached.",
            },
          ],
        },
      });
    } else await route.fulfill({ response });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Try sample data" }).click();
  await expect(page.getByText("2 / 2 inputs added")).toBeVisible();
  await expect(
    page.getByText("Resume uploaded. AI quota reached.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Extracted resume text", { exact: true }),
  ).toContainText("Alex Morgan");
  await expect(
    page.getByText("Upload your resume to get started.", { exact: true }),
  ).not.toBeVisible();
  const customize = page.getByRole("button", {
    name: "Customize Resume",
    exact: true,
  });
  await customize.click();
  await expect(
    page.getByRole("alert", { name: "We couldn’t complete that step" }),
  ).toContainText("Gemini’s free daily quota has been reached");
  await expect(
    page.getByRole("alert", { name: "We couldn’t complete that step" }),
  ).toBeFocused();
  expect(customizeRequests).toBe(0);
  await expect(
    page.getByText("alex-morgan.docx", { exact: true }),
  ).toBeVisible();
  const job = page.getByLabel("Job description", { exact: true });
  const originalJob = await job.inputValue();
  expect(originalJob.length).toBeGreaterThan(100);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: testInfo.outputPath("quota-button-feedback.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Retry AI structuring", exact: true })
    .click();
  await expect(
    page.getByText("Ready to tailor", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert", { name: "We couldn’t complete that step" }),
  ).not.toBeVisible();
  await expect(job).toHaveValue(originalJob);
  await job.fill("Too short");
  await customize.click();
  await expect(
    page.getByRole("alert", { name: "We couldn’t complete that step" }),
  ).toContainText("Add at least 100 non-whitespace characters");
  expect(customizeRequests).toBe(0);
  await job.fill(originalJob);
  for (const checkbox of await page.getByRole("checkbox").all())
    await checkbox.click();
  await customize.click();
  await expect(
    page.getByRole("alert", { name: "We couldn’t complete that step" }),
  ).toContainText("Choose at least one section to customize.");
  expect(customizeRequests).toBe(0);
  await page.getByRole("checkbox", { name: "Summary", exact: true }).click();
  await customize.click();
  await expect(
    page.getByRole("tab", { name: "Tailored Resume", exact: true }),
  ).toBeVisible();
  expect(customizeRequests).toBe(1);
  await expect(page.getByRole("article")).toContainText("Alex Morgan");
});

test("failed replacement preserves the existing upload and JD", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try sample data" }).click();
  await expect(
    page.getByText("Ready to tailor", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Your resume", { exact: true }).setInputFiles({
    name: "renamed.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("This is not a PDF"),
  });
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "We couldn’t complete that step" }),
  ).toContainText("do not match a PDF");
  await expect(
    page.getByText("alex-morgan.docx", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Job description", { exact: true }),
  ).not.toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Customize Resume", exact: true }),
  ).toBeEnabled();
});
