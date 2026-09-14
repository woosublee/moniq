import { expect, test, type Page } from "@playwright/test";
const id = "10000000-0000-4000-8000-000000000017";
const start = (page: Page) => page.goto("/task7-harness/ledger?case=review-selection&month=2026-02");
async function selectOriginals(page: Page) {
  for (const kind of ["expense", "income", "refund"]) await page.locator(`[data-entry-key="${kind}:${id}"]`).getByRole("checkbox").check();
}
async function exclude(page: Page) {
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "선택 내역 제외", exact: true }).click();
}
async function requests(page: Page, count: number) {
  await expect.poll(async () => JSON.parse(await page.getByTestId("review-requests").innerText()).length).toBe(count);
  return JSON.parse(await page.getByTestId("review-requests").innerText());
}
test("Task17 fix1 invalid expense opens without RangeError and preserves or explicitly corrects its native date", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/task7-harness/ledger?case=unknown");
  await page.locator(`[data-entry-key="expense:${id}"]`).getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: "거래 상세·수정", exact: true });
  await expect(dialog).toBeVisible(); await expect(dialog).toContainText("원문-확인필요");
  const date = dialog.getByLabel("사용 일시 · 한국 시간", { exact: true });
  await expect(date).toHaveValue("");
  await expect(dialog.locator('[name="originalLocalOccurredAt"]')).toHaveValue("");
  await expect(dialog.locator('[name="originalAmount"]')).toHaveValue("10.5");
  await dialog.getByRole("button", { name: "지출 저장", exact: true }).click();
  await expect.poll(async () => JSON.parse(await page.getByTestId("native-captures").innerText()).length).toBe(1);
  await date.fill("2026-02-19T14:25");
  await page.screenshot({ path: info.outputPath("correct-invalid-expense-390.png") });
  await dialog.getByRole("button", { name: "지출 저장", exact: true }).click();
  await expect.poll(async () => JSON.parse(await page.getByTestId("native-captures").innerText()).length).toBe(2);
  const captured = JSON.parse(await page.getByTestId("native-captures").innerText());
  expect(captured[0]).toMatchObject({ occurredAt: "", originalLocalOccurredAt: "", amount: "10.5", originalAmount: "10.5", version: "1", month: "2026-02" });
  expect(captured[1]).toMatchObject({ occurredAt: "2026-02-19T14:25", originalLocalOccurredAt: "", amount: "10.5", originalAmount: "10.5", timezoneOffset: "-540", version: "1" });
  expect(errors).toEqual([]); await page.keyboard.press("Escape");
});
test("Task17 fix1 valid expense keeps the Seoul minute sentinel in a non-Seoul browser", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, timezoneId: "America/Los_Angeles" });
  const page = await context.newPage(); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto("/task7-harness/ledger?case=normal");
    await page.locator(`[data-entry-key="expense:${id}"]`).getByRole("button").click();
    const dialog = page.getByRole("dialog", { name: "거래 상세·수정", exact: true });
    await expect(dialog.getByLabel("사용 일시 · 한국 시간", { exact: true })).toHaveValue("2026-02-18T10:00");
    await dialog.getByLabel("메모", { exact: true }).first().fill("날짜 이외 항목 수정");
    await dialog.getByRole("button", { name: "지출 저장", exact: true }).click();
    await expect.poll(async () => JSON.parse(await page.getByTestId("native-captures").innerText()).length).toBe(1);
    const capture = JSON.parse(await page.getByTestId("native-captures").innerText())[0];
    expect(capture).toMatchObject({ occurredAt: "2026-02-18T10:00", originalLocalOccurredAt: "2026-02-18T10:00", timezoneOffset: "-540", amount: "100000", originalAmount: "100000", version: "1", month: "2026-02" });
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
for (const transition of ["filter", "page", "month"] as const) {
  test(`Task17 fix1 unknown exclusion survives ${transition} even when every original row disappears`, async ({ page }, info) => {
    await page.setViewportSize({ width: transition === "filter" ? 320 : transition === "month" ? 390 : 768, height: 844 });
    await start(page); await selectOriginals(page); await exclude(page);
    const retry = page.getByRole("button", { name: "같은 제외 요청 확인 / 재시도", exact: true });
    await expect(retry).toBeVisible(); const first = (await requests(page, 1))[0];
    if (transition === "filter") {
      await page.getByRole("textbox", { name: "내역 검색" }).fill("없는검색결과");
      await page.getByRole("button", { name: "필터 적용", exact: true }).click();
      await expect(page.locator("[data-entry-key]")).toHaveCount(0);
    } else if (transition === "page") {
      await page.getByRole("link", { name: "다음 페이지", exact: true }).click();
      await expect(page).toHaveURL(/page=2/); await expect(page.locator(`[data-entry-key="expense:${id}"]`)).toHaveCount(0);
    } else {
      await page.getByRole("link", { name: "다음 달", exact: true }).click();
      await expect(page).toHaveURL(/month=2026-03/); await expect(page.locator("[data-entry-key]")).toHaveCount(0);
    }
    await expect(retry).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "현재 페이지 전체 선택" })).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`frozen-after-${transition}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByLabel("테스트 응답", { exact: true }).selectOption("success");
    await retry.click(); const sent = await requests(page, 2);
    expect(sent[1]).toEqual(first); expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first).toMatchObject({ month: "2026-02", entries: [
      { kind: "refund", id, version: "1" }, { kind: "income", id, version: "7" }, { kind: "expense", id, version: "1" },
    ] });
    await expect(retry).toHaveCount(0); await expect(page.getByRole("button", { name: "선택 해제", exact: true })).toHaveCount(0);
  });
}
test("Task17 fix1 in-flight exclusion remains locked across query and becomes the same unknown retry", async ({ page }) => {
  await start(page); await page.getByLabel("테스트 응답", { exact: true }).selectOption("pending");
  await selectOriginals(page); await exclude(page); const first = (await requests(page, 1))[0];
  await expect(page.getByRole("button", { name: "제외 중", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "다음 달", exact: true }).click();
  // React may defer the route commit until the pending action settles. The
  // initiated query must not unlock selection before or lose the result after it.
  await expect(page.getByRole("button", { name: "제외 중", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "선택 해제", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "미확인 응답 전달", exact: true }).click();
  await expect(page).toHaveURL(/month=2026-03/);
  const retry = page.getByRole("button", { name: "같은 제외 요청 확인 / 재시도", exact: true });
  await expect(retry).toBeVisible();
  await page.getByLabel("테스트 응답", { exact: true }).selectOption("saved_needs_review");
  await retry.click(); expect((await requests(page, 2))[1]).toEqual(first);
  await expect(retry).toHaveCount(0); await expect(page.getByRole("status")).toContainText("saved_needs_review");
});
test("Task17 fix1 rejection after a query releases the frozen request without selecting replacement rows", async ({ page }) => {
  await start(page); await selectOriginals(page); await exclude(page);
  const first = (await requests(page, 1))[0];
  await page.getByRole("link", { name: "다음 페이지", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  const retry = page.getByRole("button", { name: "같은 제외 요청 확인 / 재시도", exact: true });
  await expect(retry).toBeVisible();
  const replacement = page.locator("[data-entry-key]").first();
  await expect(replacement.getByRole("checkbox")).toBeDisabled();
  await expect(replacement.getByRole("button").first()).toBeDisabled();
  await page.getByLabel("테스트 응답", { exact: true }).selectOption("error"); await retry.click();
  expect((await requests(page, 2))[1]).toEqual(first);
  await expect(retry).toHaveCount(0); await expect(page.getByRole("button", { name: "선택 해제", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("error");
  await expect(replacement.getByRole("checkbox")).toBeEnabled(); await expect(replacement.getByRole("checkbox")).not.toBeChecked();
  await replacement.getByRole("checkbox").check(); await page.getByLabel("테스트 응답", { exact: true }).selectOption("success"); await exclude(page);
  const next = (await requests(page, 3))[2];
  expect(next.requestId).not.toBe(first.requestId); expect(next.entries).toHaveLength(1); expect(next.entries[0].id).not.toBe(id);
});
test("Task17 fix1 normal query clears selection, definite error retains it, and a new confirmed attempt rotates UUID", async ({ page }) => {
  await start(page); await selectOriginals(page);
  await page.getByRole("textbox", { name: "내역 검색" }).fill("가상");
  await page.getByRole("button", { name: "필터 적용", exact: true }).click();
  await expect(page).toHaveURL(/query=/);
  await expect(page.getByRole("button", { name: "선택 해제", exact: true })).toHaveCount(0);
  const row = page.locator('[data-entry-key="expense:other-50"]').getByRole("checkbox");
  await row.check(); await page.getByLabel("테스트 응답", { exact: true }).selectOption("error");
  await exclude(page); const first = (await requests(page, 1))[0];
  await expect(row).toBeChecked(); await expect(page.getByRole("status")).toContainText("error");
  await page.getByLabel("테스트 응답", { exact: true }).selectOption("success");
  await exclude(page); const second = (await requests(page, 2))[1];
  expect(second.entries).toEqual(first.entries); expect(second.requestId).not.toBe(first.requestId);
  await expect(row).not.toBeChecked();
  await page.getByText("기존 거래표 소비부", { exact: true }).click();
  const legacy = page.getByRole("table"); await expect(legacy).toBeVisible();
  await legacy.getByRole("checkbox").first().check();
  await expect(page.getByRole("button", { name: "선택 해제", exact: true })).toBeVisible();
});
