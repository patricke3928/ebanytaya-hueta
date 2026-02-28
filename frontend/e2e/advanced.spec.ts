import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: string, password: string) {
  await page.goto("/dashboard");
  await page.locator(".auth-card input").nth(0).fill(username);
  await page.locator(".auth-card input").nth(1).fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page.getByRole("heading", { name: /Nexus OS|Панель Nexus OS/ })).toBeVisible();
}

test("DEV cannot move task not assigned to them", async ({ page }) => {
  await login(page, "dev_e2e", "dev_password");

  await page.getByRole("button", { name: "E2E Access Project" }).click();

  const kanbanPanel = page.locator("section.panel", { has: page.getByRole("heading", { name: /Канбан|Kanban/i }) }).first();
  const otherTask = kanbanPanel.locator(".task-item", { hasText: "E2E task assigned to LEAD" }).first();
  const ownTask = kanbanPanel.locator(".task-item", { hasText: "E2E task assigned to DEV" }).first();

  await expect(otherTask).toBeVisible();
  await expect(ownTask).toBeVisible();

  await expect(otherTask.getByRole("button", { name: /Перевести в|Move to/ })).toBeDisabled();
  await expect(ownTask.getByRole("button", { name: /Перевести в|Move to/ })).toBeEnabled();
});

test("Core sync + presence + follow between LEAD and DEV", async ({ browser }) => {
  test.setTimeout(90_000);

  const leadContext = await browser.newContext();
  const devContext = await browser.newContext();
  const leadPage = await leadContext.newPage();
  const devPage = await devContext.newPage();

  await login(leadPage, "teamlead_anna", "hashed_password_example");
  await login(devPage, "dev_e2e", "dev_password");

  const token = await leadPage.evaluate(() => window.localStorage.getItem("nexus_token"));
  expect(token).toBeTruthy();
  const projectsRes = await leadPage.request.get("http://localhost:8000/api/projects", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(projectsRes.ok()).toBeTruthy();
  const projects = (await projectsRes.json()) as Array<{ id: number; name: string }>;
  const project = projects.find((item) => item.name === "E2E Access Project");
  expect(project).toBeTruthy();

  const sessionName = `E2E Core ${Date.now()}`;

  await leadPage.goto("/core");
  await leadPage.getByTestId("core-project-input").fill(String(project!.id));
  await leadPage.getByTestId("core-name-input").fill(sessionName);
  await leadPage.getByTestId("core-create-submit").click();

  await devPage.goto("/core");
  const sessionCard = devPage.locator(".task-item", { hasText: sessionName }).first();
  await expect(sessionCard).toBeVisible();
  await sessionCard.getByRole("button", { name: /Connect|Connected/ }).click();

  const leadEditor = leadPage.getByTestId("core-editor");
  const devEditor = devPage.getByTestId("core-editor");

  await expect(leadEditor).toBeVisible();
  await leadEditor.click();
  await leadPage.keyboard.press(`${process.platform === "darwin" ? "Meta" : "Control"}+A`);
  await leadPage.keyboard.type("CRDT sync works");
  await expect(devEditor).toContainText("CRDT sync works");

  await devPage.getByTestId("core-follow-teamlead_anna").click();
  const leadPresenceRow = leadPage.locator(".task-item", { hasText: "teamlead_anna" }).first();
  await expect(leadPresenceRow).toContainText("dev_e2e");

  await leadContext.close();
  await devContext.close();
});
