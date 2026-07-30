import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
page.on("console", (msg) => console.log("[console]", msg.text()));
await page.goto("http://localhost:8888/booking");
await page.waitForSelector('button[aria-label="Next month"]');

for (let i = 0; i < 12; i++) {
	const heading = await page.textContent("span.font-medium");
	if (heading && heading.includes("August 2026")) break;
	await page.click('button[aria-label="Next month"]');
	await page.waitForTimeout(100);
}

await page.screenshot({ path: "C:/Users/brndn/AppData/Local/Temp/claude/c--Users-brndn-Documents-GitHub-Cabin-Between-Rivers-Webpage/9cf590d1-f988-49ad-8e28-a1b729216077/scratchpad/booking-calendar-aug.png", fullPage: true });

const day13 = page.locator("button span", { hasText: /^13$/ }).locator("..");
const count = await day13.count();
console.log("matches:", count);
const disabled = await day13.first().isDisabled();
console.log("Aug 13 button disabled?", disabled);
const classes = await day13.first().getAttribute("class");
console.log("Aug 13 classes:", classes);

if (!disabled) {
	await day13.first().click();
	await page.waitForTimeout(200);
	await page.screenshot({ path: "C:/Users/brndn/AppData/Local/Temp/claude/c--Users-brndn-Documents-GitHub-Cabin-Between-Rivers-Webpage/9cf590d1-f988-49ad-8e28-a1b729216077/scratchpad/booking-calendar-aug-clicked.png", fullPage: true });
}

await browser.close();
