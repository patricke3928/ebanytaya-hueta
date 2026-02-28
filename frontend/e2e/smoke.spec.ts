import { expect, test } from "@playwright/test";

test("dashboard smoke flow: login, create project, create task, move task", async ({ page }) => {
  const projectName = `E2E Project ${Date.now()}`;
  const taskName = `E2E Task ${Date.now()}`;

  await page.goto("/dashboard");

  await page.locator(".auth-card input").nth(0).fill("teamlead_anna");
  await page.locator(".auth-card input").nth(1).fill("hashed_password_example");
  await page.getByTestId("login-submit").click();

  await expect(page.getByRole("heading", { name: /Nexus OS|Панель Nexus OS/ })).toBeVisible();

  await page.getByTestId("create-project-input").fill(projectName);
  await page.getByTestId("create-project-submit").click();
  await expect(page.getByRole("button", { name: projectName })).toBeVisible();

  await page.getByTestId("create-task-input").fill(taskName);
  await page.getByTestId("create-task-submit").click();
  await expect(page.locator(".task-item", { hasText: taskName }).first()).toBeVisible();

  const taskCard = page.locator(".task-item", { hasText: taskName }).first();
  await taskCard.getByRole("button", { name: /Перевести в|Move to/ }).click();
  await expect(taskCard).toContainText(/В работе|Doing|Done|Готово/);
});
