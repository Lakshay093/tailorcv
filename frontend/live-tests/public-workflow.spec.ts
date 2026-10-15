import { expect, test, type Response } from "@playwright/test";
import fs from "node:fs/promises";

test("real public Gemini workflow, edited downloads, and responsive review", async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const connected = page.waitForResponse((response) =>
    response.url().endsWith("/health"),
  );
  await page.goto("/");
  await connected;
  await expect(
    page.getByRole("heading", { name: "A better fit for your next role." }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("public-empty-desktop.png"),
    fullPage: true,
  });
  const parseResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/resume/parse") &&
      response.request().method() === "POST",
    { timeout: 180000 },
  );
  await page.getByRole("button", { name: "Try sample data" }).click();
  const parsedResponse = await parseResponse;
  expect(parsedResponse.status()).toBe(200);
  const parsed = await parsedResponse.json();
  expect(parsed.structured_resume).not.toBeNull();
  await expect(
    page.getByText("Ready to tailor", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Original resume · Before tailoring"),
  ).toBeVisible();
  await expect(page.getByRole("article")).toContainText("Alex Morgan");
  await expect(
    page.getByLabel("Job description", { exact: true }),
  ).not.toBeEmpty();
  await page.getByRole("checkbox", { name: "Projects", exact: true }).click();
  let tailoredResponse: Response | undefined;
  let lastFailure: { code?: string; message?: string } | undefined;
  // Exercise the visible retry path once for transient provider failures or a
  // safely rejected generation. Every rejection remains in the test report.
  for (let attempt = 0; attempt < 2; attempt++) {
    const customizeResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/resume/customize") &&
        response.request().method() === "POST",
      { timeout: 180000 },
    );
    await page
      .getByRole("button", { name: "Customize Resume", exact: true })
      .click();
    tailoredResponse = await customizeResponse;
    if (tailoredResponse.status() === 200) break;
    const failure = await tailoredResponse.json();
    lastFailure = failure.error;
    await testInfo.attach(`generation-attempt-${attempt + 1}`, {
      body: JSON.stringify(failure),
      contentType: "application/json",
    });
    await expect(page.getByRole("alert")).toContainText(failure.error.message);
    await expect(page.getByRole("article")).toContainText("Alex Morgan");
    await expect(
      page.getByLabel("Job description", { exact: true }),
    ).not.toBeEmpty();
    await expect(
      page.getByRole("checkbox", { name: "Projects", exact: true }),
    ).not.toBeChecked();
    if (
      ![
        "PROVIDER_UNAVAILABLE",
        "PROVIDER_TIMEOUT",
        "FACTUAL_VALIDATION_FAILED",
      ].includes(failure.error?.code)
    )
      break;
  }
  expect(
    tailoredResponse?.status(),
    lastFailure
      ? `Live generation: ${lastFailure.code}: ${lastFailure.message}`
      : undefined,
  ).toBe(200);
  const result = await tailoredResponse!.json();
  expect(result.model).toBe("gemini-3.6-flash");
  expect(result.resume.contact).toEqual(parsed.structured_resume.contact);
  expect(result.resume.education).toEqual(parsed.structured_resume.education);
  expect(result.resume.projects).toEqual(parsed.structured_resume.projects);
  await expect(
    page.getByRole("article", { name: "Resume document" }),
  ).toContainText("Alex Morgan");
  await expect(page.getByRole("article")).not.toContainText("Kubernetes");
  await page.getByRole("tab", { name: /Changes/ }).click();
  await expect(page.getByText("Every change, in the open")).toBeVisible();
  await page.getByRole("tab", { name: "Suggestions" }).click();
  await expect(page.getByText("Opportunities to consider")).toBeVisible();
  await page.getByRole("tab", { name: "Tailored Resume", exact: true }).click();
  await page.getByRole("button", { name: "Edit resume", exact: true }).click();
  const editedSummary =
    "Live deployment verification: manually reviewed résumé with café experience.";
  await page.getByLabel("Summary", { exact: true }).fill(editedSummary);
  await page.getByRole("button", { name: "Done editing" }).click();
  for (const format of ["PDF", "DOCX", "TXT"]) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: format, exact: true }).click();
    const download = await downloadPromise;
    const filename = `tailorcv-resume.${format.toLowerCase()}`;
    expect(download.suggestedFilename()).toBe(filename);
    const localPath = testInfo.outputPath(filename);
    await download.saveAs(localPath);
    const content = await fs.readFile(localPath);
    expect(content.length).toBeGreaterThan(100);
    if (format === "PDF")
      expect(content.subarray(0, 4).toString()).toBe("%PDF");
    if (format === "DOCX") expect(content.subarray(0, 2).toString()).toBe("PK");
    if (format === "TXT")
      expect(content.toString("utf-8")).toContain(editedSummary);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: testInfo.outputPath("public-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  for (const tab of await page.getByRole("tab").all()) {
    const box = await tab.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  }
  await page.screenshot({
    path: testInfo.outputPath("public-mobile.png"),
    fullPage: true,
  });
  expect(browserErrors).toEqual([]);
  await testInfo.attach("live-provider-result", {
    body: JSON.stringify({
      app: process.env.LIVE_APP_URL,
      model: result.model,
      changes: result.changes.length,
      warnings: result.warnings.map(
        (warning: { code: string }) => warning.code,
      ),
      formats: ["pdf", "docx", "txt"],
    }),
    contentType: "application/json",
  });
});
