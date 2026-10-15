import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const samples = path.resolve(__dirname, "../../samples");

test("upload, tailor, review, edit, and download via the real backend", async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  page.on("pageerror", e => browserErrors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your experience. The right words." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Customize Resume", exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("empty.png"), fullPage: true });
  await page.getByLabel("Job description", { exact: true }).fill(await fs.readFile(path.join(samples, "job-description.txt"), "utf-8"));
  await page.getByLabel("Your resume", { exact: true }).setInputFiles(path.join(samples, "alex-morgan.docx"));
  await expect(page.getByText("Ready to tailor", { exact: false })).toBeVisible();
  await page.getByText("Preview extracted text").click();
  await expect(page.locator(".extraction-preview pre")).toContainText("Alex Morgan");
  await page.getByRole("checkbox", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: "Customize Resume", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Tailored Resume", exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "Resume document" })).toContainText("Alex Morgan");
  await expect(page.getByRole("article", { name: "Resume document" })).not.toContainText("Kubernetes");
  await page.getByRole("tab", { name: /Changes/ }).click();
  await expect(page.getByText("Every change, in the open")).toBeVisible();
  await expect(page.locator(".change-after").first()).toBeVisible();
  await page.getByRole("tab", { name: "Suggestions" }).click();
  await expect(page.locator(".suggestion-card")).toContainText("Kubernetes");
  await expect(page.locator(".suggestion-card")).toContainText("Confirm first");
  await page.getByRole("tab", { name: "Tailored Resume", exact: true }).click();
  await page.getByRole("button", { name: "Edit resume", exact: true }).click();
  await page.getByLabel("Summary", { exact: true }).fill("My manually reviewed résumé with café experience.");
  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(page.getByRole("article")).toContainText("My manually reviewed résumé with café experience.");
  for (const format of ["TXT", "PDF", "DOCX"]) {
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: format, exact: true }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe(`tailorcv-resume.${format.toLowerCase()}`);
    const saved = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(saved);
    const bytes = await fs.readFile(saved);
    expect(bytes.length).toBeGreaterThan(100);
    if (format === "TXT") expect(bytes.toString("utf-8")).toContain("My manually reviewed résumé with café experience.");
    if (format === "PDF") expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    if (format === "DOCX") expect(bytes.subarray(0, 2).toString()).toBe("PK");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("reviewed.png"), fullPage: true });
  expect(browserErrors).toEqual([]);
});

test("failed replacement preserves the existing upload and JD", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try sample data" }).click();
  await expect(page.getByText("Ready to tailor", { exact: false })).toBeVisible();
  await page.getByLabel("Your resume", { exact: true }).setInputFiles({ name: "renamed.pdf", mimeType: "application/pdf", buffer: Buffer.from("This is not a PDF") });
  await expect(page.getByRole("alert").filter({ hasText: "We couldn’t complete that step" })).toContainText("do not match a PDF");
  await expect(page.getByText("alex-morgan.docx", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Job description", { exact: true })).not.toBeEmpty();
  await expect(page.getByRole("button", { name: "Customize Resume", exact: true })).toBeEnabled();
});
