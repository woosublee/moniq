import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth
      && document.body.scrollWidth <= window.innerWidth,
  )).toBe(true);
}

async function resetFilters(page: Page) {
  const reset = page.getByRole("link", { name: "필터 초기화", exact: true });
  if (await reset.count()) {
    await reset.click();
    await expect(page).toHaveURL(/\/ledger\?month=2026-02$/);
  }
}

async function openDetailedFilters(page: Page) {
  const details = page.locator("details.household-filter-details");
  if (!(await details.getAttribute("open"))) await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
  return details;
}

test("Task18 public household ledger keeps literal full-range totals through paging, search, statistics and read-only entry", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  await page.goto("/demo");
  await expect(page).toHaveURL(/\/ledger\?month=2026-02$/);
  await expect(page.getByRole("heading", { name: "가계부", exact: true })).toBeVisible();

  const monthly = page.getByRole("region", { name: "월 전체 합계" });
  await expect(monthly).toContainText("수입3,500,000원지출491,000원차액3,009,000원");
  await expect(page.getByText("전체 내역 59건 · 1 / 2 페이지 (최대 50건)", { exact: true })).toBeVisible();
  await expect(page.locator("[data-entry-key]")).toHaveCount(50);

  await page.getByRole("link", { name: "다음 페이지", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator("[data-entry-key]")).toHaveCount(9);
  await expect(monthly).toContainText("3,009,000원");

  await page.getByRole("textbox", { name: "내역 검색" }).fill("한빛마트");
  await page.getByRole("button", { name: "필터 적용", exact: true }).click();
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page.locator("[data-entry-key]")).toHaveCount(21);
  await expect(page.getByRole("region", { name: "검색·필터 결과 합계" })).toContainText("수입0원지출285,000원차액-285,000원");

  await page.getByRole("navigation", { name: "주 메뉴", exact: true }).getByRole("link", { name: "통계", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?.*query=/);
  await expect(page.getByRole("table", { name: "분류별 지출과 고정비" })).toContainText("식비285,000원0원");
  await page.goBack();
  await expect(page.getByRole("textbox", { name: "내역 검색" })).toHaveValue("한빛마트");

  await resetFilters(page);
  const add = page.getByRole("button", { name: "내역 추가", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "새 내역 기록" });
  await expect(dialog).toContainText("읽기 전용");
  await expect(dialog.locator("form")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(add).toBeFocused();
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("Task18 household filters and card detail round-trip preserve February and the shared source", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/demo");

  const categoryFilters = await openDetailedFilters(page);
  await categoryFilters.getByLabel("분류", { exact: true }).fill("문화");
  await page.getByRole("button", { name: "필터 적용", exact: true }).click();
  await expect(page.getByText("검색·필터 결과 6건", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "검색·필터 결과 합계" })).toContainText("지출72,000원");

  await resetFilters(page);
  const paymentFilters = await openDetailedFilters(page);
  await paymentFilters.getByRole("combobox", { name: "결제수단", exact: true }).selectOption("cash");
  await page.getByRole("button", { name: "필터 적용", exact: true }).click();
  await expect(page.getByText("검색·필터 결과 4건", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "검색·필터 결과 합계" })).toContainText("지출32,000원");

  await resetFilters(page);
  const cardFilters = await openDetailedFilters(page);
  await cardFilters.getByRole("combobox", { name: "결제 카드", exact: true }).selectOption("demo-everyday");
  await page.getByRole("button", { name: "필터 적용", exact: true }).click();
  await expect(page.getByText("검색·필터 결과 38건", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "검색·필터 결과 합계" })).toContainText("지출371,000원");

  await page.getByRole("link", { name: "카드 사용내역", exact: true }).click();
  await expect(page).toHaveURL(/\/cards\?month=2026-02&tab=transactions&card=demo-everyday$/);
  await expect(page.locator(".activity-totals")).toContainText("월 전체 승인 원금396,000원이번 달 환불 입금25,000원순 현금흐름 승인 − 환불371,000원");
  await page.getByRole("navigation", { name: "내 카드 보기" }).getByRole("link", { name: "실적 관리", exact: true }).click();
  await page.locator('[data-card-id="demo-everyday"] h2 a').click();
  await expect(page).toHaveURL(/\/cards\/demo-everyday\?month=2026-02&tab=performance&card=demo-everyday$/);
  await expect(page.locator("h1")).toHaveText("생활비 카드");
  await page.goBack();
  await expect(page.locator('[data-card-id="demo-everyday"]')).toBeVisible();
  await page.getByRole("link", { name: "가계부 보기", exact: true }).click();
  await expect(page).toHaveURL(/\/ledger\?month=2026-02&card=demo-everyday$/);

  await resetFilters(page);
  await page.getByRole("combobox", { name: "내역 종류", exact: true }).selectOption("income");
  await page.getByRole("button", { name: "필터 적용", exact: true }).click();
  await expect(page.getByText("검색·필터 결과 3건", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "검색·필터 결과 합계" })).toContainText("수입3,500,000원지출0원차액3,500,000원");
  await expect(page.locator('[data-entry-key^="income:"]')).toHaveCount(3);
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});
