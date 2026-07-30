import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 500, height: 700 } });
await page.goto("http://localhost:8888/admin");
await page.fill('input[name="password"]', "Insufferablyinsouciant907?");
await page.click('button[type="submit"]');
await page.waitForSelector("text=Calendar");
for (let i = 0; i < 12; i++) {
	const heading = await page.textContent("span.font-medium");
	if (heading && heading.includes("August 2026")) break;
	await page.click('button[aria-label="Next month"]');
	await page.waitForTimeout(100);
}
await page.waitForTimeout(300);

const byNumber = (n) =>
	page.locator("span.relative.leading-none", { hasText: new RegExp(`^${n}$`) }).locator("..").first();
await byNumber(13).screenshot({ path: "C:/Users/brndn/AppData/Local/Temp/claude/c--Users-brndn-Documents-GitHub-Cabin-Between-Rivers-Webpage/9cf590d1-f988-49ad-8e28-a1b729216077/scratchpad/gap-check-day13.png" });

await browser.close();
