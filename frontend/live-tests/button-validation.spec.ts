import { expect, test } from "@playwright/test";

test("public Customize button validates inputs without using AI quota", async ({
  page,
}, testInfo) => {
  const aiRequests: string[] = [];
  const browserErrors: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/resume\/(parse|customize)$/.test(request.url())
    )
      aiRequests.push(request.url());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const connected = page.waitForResponse((response) =>
    response.url().endsWith("/health"),
  );
  await page.goto("/");
  await connected;
  const button = page.getByRole("button", {
    name: "Customize Resume",
    exact: true,
  });
  await expect(button).toBeEnabled();
  await button.click();
  const alert = page.getByRole("alert", {
    name: "We couldn’t complete that step",
  });
  await expect(alert).toContainText(
    "Upload a PDF or DOCX resume before customizing.",
  );
  await expect(alert).toBeFocused();
  expect(aiRequests).toEqual([]);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: testInfo.outputPath("public-button-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Dismiss error", exact: true })
    .click();
  await button.click();
  await expect(alert).toContainText(
    "Upload a PDF or DOCX resume before customizing.",
  );
  await expect(alert).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(aiRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: testInfo.outputPath("public-button-mobile.png"),
    fullPage: true,
  });
});
