import { expect, test, type Page } from "@playwright/test";
async function demo(page: Page) { await page.goto("/demo"); }
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
test("Task17 demo opens a general ledger and keeps 50-row totals through filters, paging, statistics and back", async ({ page }) => {
  await demo(page);
  await expect(page).toHaveURL(/\/ledger\?month=2026-02$/);
  await expect(page.getByRole("heading", { name: "가계부", exact: true })).toBeVisible();
  const total = page.getByRole("region", { name: "월 전체 합계" });
  await expect(total).toContainText("수입3,500,000원지출491,000원차액3,009,000원");
  await expect(page.locator("[data-entry-key]")).toHaveCount(50);
  await page.getByRole("link", { name: "다음 페이지", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator("[data-entry-key]")).toHaveCount(9);
  await expect(total).toContainText("3,009,000원");
  await page.getByRole("textbox", { name: "내역 검색" }).fill("한빛마트");
  await page.getByRole("button", { name: "필터 적용", exact: true }).click();
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page.locator("[data-entry-key]")).toHaveCount(21);
  await expect(page.getByRole("region", { name: "검색·필터 결과 합계" })).toContainText("수입0원지출285,000원차액-285,000원");
  await expect(page).toHaveURL(/\/ledger\?.*query=/);
  const menu = page.getByRole("navigation", { name: "주 메뉴", exact: true });
  await menu.getByRole("link", { name: "통계", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?.*query=/);
  await expect(page.getByRole("heading", { name: "통계", exact: true })).toBeVisible();
  await expect(total).toContainText("수입3,500,000원지출491,000원차액3,009,000원");
  await expect(page.getByRole("table", { name: "분류별 지출과 고정비" })).toContainText("식비285,000원0원");
  await page.goBack();
  await expect(page).toHaveURL(/\/ledger\?.*query=/);
  await expect(page.locator("[data-entry-key]")).toHaveCount(21);
  await expect(page.getByRole("textbox", { name: "내역 검색" })).toHaveValue("한빛마트");
  await page.goBack();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole("textbox", { name: "내역 검색" })).toHaveValue("");
});
for (const fragment of ["quick-entry", "new-transaction"]) {
  test(`Task17 legacy #${fragment} reaches one read-only dialog, close consumes fragment and back never reopens it`, async ({ page }) => {
    await demo(page);
    await page.goto(`/transactions/new?month=2026-02&userCardId=demo-everyday#${fragment}`);
    await expect(page).toHaveURL(/\/ledger\?month=2026-02&userCardId=demo-everyday/);
    const dialog = page.getByRole("dialog", { name: "새 내역 기록" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("읽기 전용");
    await expect(dialog.locator("form")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page).not.toHaveURL(/#/);
    const add = page.getByRole("button", { name: "내역 추가", exact: true });
    await expect(add).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(add).toBeFocused();
    await page.getByRole("link", { name: "다음 달", exact: true }).click();
    await expect(page).toHaveURL(/month=2026-03/);
    await page.goBack();
    await expect(page).toHaveURL(/month=2026-02&userCardId=demo-everyday$/);
    await expect(dialog).toHaveCount(0);
    await noOverflow(page);
  });
}
test("Task17 range/month/filter changes reset page, retain card, and round-trip to cards and browser back", async ({ page }) => {
  await demo(page);
  await page.goto("/ledger?month=2026-02&card=demo-everyday&page=2");
  await page.getByLabel("월·기간 선택", { exact: true }).click();
  await page.getByLabel("시작일", { exact: true }).fill("2026-01-01");
  await page.getByLabel("종료일", { exact: true }).fill("2026-03-02");
  await page.getByRole("button", { name: "기간 적용", exact: true }).click();
  await expect(page).toHaveURL(/startDate=2026-01-01&endDate=2026-03-02/);
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page.getByRole("region", { name: "기간 전체 합계" })).toContainText("수입3,500,000원지출521,000원차액2,979,000원");
  await expect(page.getByRole("region", { name: "검색·필터 결과 합계" })).toContainText("수입0원지출401,000원차액-401,000원");
  await page.getByRole("link", { name: "카드 사용내역", exact: true }).click();
  await expect(page).toHaveURL(/\/cards\?month=2026-03&tab=transactions&card=demo-everyday/);
  await page.getByRole("link", { name: "가계부 보기", exact: true }).click();
  await expect(page).toHaveURL(/\/ledger\?month=2026-03&card=demo-everyday/);
  await page.goBack();
  await expect(page).toHaveURL(/\/cards\?month=2026-03/);
  await page.goBack();
  await expect(page).toHaveURL(/\/ledger\?.*startDate=2026-01-01&endDate=2026-03-02/);
  await expect(page.getByRole("region", { name: "기간 전체 합계" })).toBeVisible();
  await page.getByLabel("월·기간 선택", { exact: true }).click();
  await expect(page.getByLabel("시작일", { exact: true })).toHaveValue("2026-01-01");
  await page.getByLabel("조회 월", { exact: true }).fill("2026-02");
  await page.getByRole("button", { name: "월 적용", exact: true }).click();
  await expect(page).toHaveURL(/month=2026-02/);
  await expect(page).not.toHaveURL(/startDate/);
  await expect(page.getByRole("combobox", { name: "결제 카드", exact: true })).toHaveValue("demo-everyday");
});

test("Task17 shared input native form keeps one controller through income switch, payload capture, ESC and fragment re-entry", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/task7-harness/ledger");
  const add = page.getByRole("button", { name: "내역 추가", exact: true });
  await expect(add).toHaveCount(1); await add.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "새 내역 기록" });
  await expect(dialog.locator("form")).toHaveCount(1);
  await dialog.getByRole("textbox", { name: "사용처", exact: true }).fill("가상 급여 입력");
  await dialog.getByRole("textbox", { name: "금액", exact: true }).fill("3200000");
  await dialog.getByRole("radio", { name: "수입", exact: true }).check();
  await expect(dialog.getByRole("textbox", { name: "수입 내용", exact: true })).toHaveValue("가상 급여 입력");
  await expect(dialog.locator('[name="userCardId"], [name="paymentMethod"]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("native-income-390.png") });
  await dialog.getByRole("button", { name: "수입 저장", exact: true }).click();
  await expect.poll(async () => JSON.parse(await page.getByTestId("native-captures").innerText()).length).toBe(1);
  const captured = JSON.parse(await page.getByTestId("native-captures").innerText());
  expect(captured).toHaveLength(1); expect(captured[0]).toMatchObject({ entryKind: "income", sourceName: "가상 급여 입력", amount: "3200000", month: "2026-02" });
  // Capture prevents dispatch: request/entry UUIDs are generated later by the existing controller.
  expect(captured[0]).not.toHaveProperty("userCardId"); expect(captured[0]).not.toHaveProperty("paymentMethod");
  await page.keyboard.press("Escape"); await expect(add).toBeFocused();
  await page.evaluate(() => { window.location.hash = "new-transaction"; });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(add).toBeFocused();
  await page.reload(); await expect(dialog).toHaveCount(0); await noOverflow(page);
  const income = page.locator('[data-entry-key^="income:"]');
  await expect(income).not.toContainText("혜택");
  await income.getByRole("button").click();
  const editor = page.getByRole("dialog", { name: "수입 상세·수정" });
  await expect(editor.locator('[name="version"]').first()).toHaveValue("7");
  await expect(editor.locator('[name="originalAmount"]')).toHaveValue("3000000");
  await expect(editor).not.toContainText("실적"); await expect(editor).not.toContainText("환불");
  await page.keyboard.press("Escape");
  await page.goto("/task7-harness/ledger?case=unsupported");
  await page.getByRole("button", { name: "내역 추가", exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "수입", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("radio", { name: "지출", exact: true })).toBeChecked();
  await expect(dialog).toContainText("수입 기능 적용 필요");
  await expect(dialog.getByRole("button", { name: "지출 저장", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
});

test("Task17 mixed-kind selection keeps equal IDs distinct and freezes versions and UUID on unknown retry", async ({ page }) => {
  await page.goto("/task7-harness/ledger?case=selection");
  for (const kind of ["expense", "income", "refund"]) await page.locator(`[data-entry-key="${kind}:10000000-0000-4000-8000-000000000017"]`).getByRole("checkbox").check();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "선택 내역 제외", exact: true }).click();
  const retry = page.getByRole("button", { name: "같은 제외 요청 확인 / 재시도", exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "현재 페이지 전체 선택" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "선택 해제", exact: true })).toBeDisabled();
  await retry.click();
  await expect.poll(async () => JSON.parse(await page.getByTestId("selection-captures").innerText()).length).toBe(2);
  const requests = JSON.parse(await page.getByTestId("selection-captures").innerText());
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  expect(requests[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(requests[0]).toMatchObject({ month: "2026-02", entries: [
    { kind: "refund", id: "10000000-0000-4000-8000-000000000017", version: "1" },
    { kind: "income", id: "10000000-0000-4000-8000-000000000017", version: "7" },
    { kind: "expense", id: "10000000-0000-4000-8000-000000000017", version: "1" },
  ] });
});

for (const width of [320, 390, 768, 1440]) {
  test(`Task17 ledger and statistics ${width}px have readable rows, one input and no overflow`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await demo(page);
    await page.goto("/ledger?month=2026-02");
    await expect(page.getByRole("heading", { name: "가계부", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "내역 추가", exact: true })).toHaveCount(1);
    await expect(page.locator("[data-entry-key]").first()).toBeVisible();
    expect((await page.locator("[data-entry-key]").first().boundingBox())!.y).toBeLessThan(450);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`ledger-${width}.png`), fullPage: false });
    const entry = page.locator("[data-entry-key]").first().getByRole("button").first();
    await entry.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`detail-${width}.png`) });
    await page.keyboard.press("Escape"); await expect(entry).toBeFocused();
    const navigation = page.getByRole("navigation", { name: width < 768 ? "모바일 주 메뉴" : "주 메뉴", exact: true });
    await expect(navigation.getByRole("link")).toHaveText(["가계부", "통계", "카드"]);
    await navigation.getByRole("link", { name: "통계", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\?month=2026-02$/);
    await expect(navigation.getByRole("link", { name: "통계", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "통계", exact: true })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`statistics-${width}.png`) });
    await page.goto("/task7-harness/ledger?case=large");
    await expect(page.locator('[data-entry-key^="income:"]')).toContainText("+9,007,199,254,740,991원");
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`large-values-${width}.png`) });
    await page.getByRole("button", { name: "내역 추가", exact: true }).click();
    const inputDialog = page.getByRole("dialog", { name: "새 내역 기록" });
    await expect(inputDialog).toBeVisible();
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, inside: Boolean(document.activeElement?.closest("dialog")), documentFocused: document.hasFocus() }));
      // Native dialogs may cycle through browser chrome, but never a background app control.
      expect(focus.inside || (!focus.documentFocused && focus.tag === "BODY"), JSON.stringify(focus)).toBe(true);
    }
    await noOverflow(page);
    expect(await inputDialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`entry-${width}.png`) });
    await page.keyboard.press("Escape");
    await page.goto("/task7-harness/ledger?case=empty");
    await expect(page.getByRole("region", { name: "월 전체 합계" })).toContainText("수입0원지출0원차액0원");
    await expect(page.getByRole("heading", { name: "표시할 내역이 없습니다" })).toBeVisible();
    await noOverflow(page);
    await page.goto("/task7-harness/ledger?case=unknown");
    await expect(page.getByRole("heading", { name: "날짜 확인 필요", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "가계부 내역" })).toContainText("원문 10.5원");
    await expect(page.getByRole("region", { name: "가계부 내역" })).toContainText("합계 제외 · 원문 20.5원");
    await noOverflow(page);
  });
}
