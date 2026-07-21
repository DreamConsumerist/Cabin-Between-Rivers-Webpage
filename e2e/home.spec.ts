import { test, expect } from "@playwright/test";

test("home page renders the cabin name", async ({ page }) => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "Cabin Between Rivers" })
	).toBeVisible();
});
