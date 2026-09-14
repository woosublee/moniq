import { expect, test } from "@playwright/test";
const cardFields = ["paymentMethod", "userCardId", "isFixedCost", "paymentChannel", "installmentMonths", "occurredTime", "merchantName"];

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: "moniq_demo", value: "1", domain: "localhost", path: "/" }]);
  await page.goto("/task7-harness");
  await page.getByRole("button", { name: "가계부 입력 사례", exact: true }).click();
});

test("Task16 fix1 hides saved expense calculation feedback on income switch and preserves it for expense", async ({ page }) => {
  const form = page.locator(".ledger-entry form");
  await form.getByLabel("금액", { exact: true }).fill("10000");
  await form.getByLabel("사용처", { exact: true }).fill("Synthetic card purchase");
  await form.getByRole("button", { name: "지출 저장", exact: true }).click();
  await expect(form.getByText("입력 확인", { exact: true })).toBeVisible();
  await form.getByRole("button", { name: "지출 저장", exact: true }).click();
  await expect(form.getByText("응답 미확인", { exact: true })).toBeVisible();
  await form.getByRole("button", { name: "같은 요청 재시도", exact: true }).click();
  await expect(form.getByLabel("금액", { exact: true })).toHaveValue("");
  const benefit = form.getByText("예상 혜택 500원 (자동)", { exact: true });
  const performance = form.getByText("실적 반영 10,000원", { exact: true });
  const notice = form.getByText("추가 확인 사항 거래 상세에서 약관·실적 자료·결제 조건을 확인하세요.", { exact: true });
  for (const feedback of [benefit, performance, notice]) await expect(feedback).toBeVisible();
  await form.getByRole("radio", { name: "수입", exact: true }).check();
  for (const feedback of [benefit, performance, notice]) await expect(feedback).toHaveCount(0);
  await form.getByRole("radio", { name: "지출", exact: true }).check();
  for (const feedback of [benefit, performance, notice]) await expect(feedback).toBeVisible();
});

test("Task16 native expense/income switching removes payment fields and preserves shared entries", async ({ page }) => {
  const form = page.locator(".ledger-entry form");
  const native = () => form.evaluate(form => Object.fromEntries(new FormData(form as HTMLFormElement)));
  await expect(form.getByRole("radio", { name: "지출", exact: true })).toBeChecked();
  await form.getByLabel("금액", { exact: true }).fill("42000");
  await form.getByLabel("사용처", { exact: true }).fill("Synthetic entry");
  await form.locator('details').last().locator('summary').click();
  await form.getByLabel("메모", { exact: true }).fill("keep memo");
  const before = await native();
  await form.getByRole("radio", { name: "수입", exact: true }).check();
  const income = await native();
  expect(income).toMatchObject({ entryKind: "income", sourceName: "Synthetic entry", amount: "42000", occurredAt: "2026-02-01", memo: "keep memo", month: "2026-02", requestId: before.requestId, entryId: before.entryId });
  for (const field of cardFields) { expect(income).not.toHaveProperty(field); await expect(form.locator(`[name="${field}"]`)).toHaveCount(0); }
  await form.getByRole("radio", { name: "지출", exact: true }).check();
  expect(await native()).toMatchObject({ merchantName: "Synthetic entry", amount: "42000", memo: "keep memo", paymentMethod: "credit_card", userCardId: "33333333-3333-4333-8333-333333333902" });
  expect(await native()).not.toHaveProperty("sourceName");
});

test("Task16 native income rejects without reset, locks kind on lost response, retries identically then resets with new IDs", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const form = page.locator(".ledger-entry form");
  const mounted = await form.elementHandle();
  const kind = form.getByRole("radio", { name: "수입", exact: true });
  const amount = form.getByLabel("금액", { exact: true });
  const requests = async () => JSON.parse(await page.getByTestId("requests").innerText()) as Record<string, string>[];
  await kind.check(); await amount.fill("3000000"); await form.getByLabel("수입 내용", { exact: true }).fill("Synthetic salary");
  await form.getByRole("button", { name: "수입 저장", exact: true }).click();
  await expect(form.getByText("입력 확인", { exact: true })).toBeVisible();
  await expect(amount).toHaveValue("3000000"); await expect(kind).toBeChecked();
  await form.getByRole("button", { name: "수입 저장", exact: true }).click();
  await expect(form.getByText("응답 미확인", { exact: true })).toBeVisible();
  await expect(form.getByRole("radio", { name: "지출", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "월 prop 변경", exact: true }).click();
  await page.getByRole("button", { name: "기본 카드 prop 체크 B", exact: true }).click();
  await page.getByRole("button", { name: "수입 지원 전환", exact: true }).click();
  await form.getByRole("button", { name: "같은 요청 재시도", exact: true }).click();
  await expect(amount).toHaveValue("");
  const saved = await requests(); expect(saved).toHaveLength(3); expect(saved[2]).toEqual(saved[1]);
  expect(saved[2]).toMatchObject({ handledAs: "income", sourceName: "Synthetic salary", amount: "3000000", month: "2026-02" });
  for (const field of cardFields) expect(saved[2]).not.toHaveProperty(field);
  await expect(form.getByRole("radio", { name: "지출", exact: true })).toBeChecked();
  await expect(form.locator('[name="userCardId"]')).toHaveValue("33333333-3333-4333-8333-333333333902");
  await expect(form.locator('[name="occurredAt"]')).toHaveValue("2026-02-01");
  await expect(form.locator('[name="requestId"]')).not.toHaveValue(saved[2].requestId);
  await expect(form.locator('[name="entryId"]')).not.toHaveValue(saved[2].entryId);
  await amount.fill("5000"); await form.getByLabel("사용처", { exact: true }).fill("Synthetic next expense");
  await form.getByRole("button", { name: "지출 저장", exact: true }).click();
  await expect(amount).toHaveValue("");
  const next = (await requests())[3]; expect(next).toMatchObject({ handledAs: "expense", amount: "5000", month: "2026-02", paymentMethod: "credit_card" });
  expect(next.requestId).not.toBe(saved[2].requestId); expect(next.entryId).not.toBe(saved[2].entryId);
  expect(await mounted!.evaluate(node => node === document.querySelector(".ledger-entry form"))).toBe(true);
  await page.getByRole("button", { name: "수입 지원 전환", exact: true }).click(); await kind.check();
  await form.screenshot({ path: testInfo.outputPath("income-390.png") });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const fields = await form.locator('.ledger-fields label').evaluateAll(labels => labels.map(label => ({ x: label.getBoundingClientRect().x, width: label.getBoundingClientRect().width })));
    expect(new Set(fields.map(field => field.x)).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("Task16 income editor preserves originals and version through rejection and lost response, then locks all writers after receipt", async ({ page }) => {
  await page.getByRole("button", { name: "수입 수정 수명주기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "수입 수정 검증", exact: true });
  const form = dialog.locator(".ledger-entry form");
  const amount = form.getByLabel("금액", { exact: true });
  const requests = async () => JSON.parse(await page.getByTestId("income-edit-requests").innerText()) as Record<string, string>[];
  await expect(amount).toHaveValue("123.456");
  await form.getByLabel("수입 날짜", { exact: true }).fill("2026-03-02");
  await form.getByLabel("메모", { exact: true }).fill("moved salary");
  await form.getByRole("button", { name: "수입 저장", exact: true }).click();
  await expect(form).toContainText("수입 수정 거절"); await expect(amount).toHaveValue("123.456");
  await expect(form.getByLabel("수입 날짜", { exact: true })).toHaveValue("2026-03-02");
  await form.getByRole("button", { name: "수입 저장", exact: true }).click();
  await expect(form.getByRole("button", { name: "같은 요청 재시도", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeDisabled();
  await dialog.locator("details summary").click();
  await expect(dialog.getByRole("button", { name: "수입 제외", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  // A parent requery must not replace the frozen edit source or retry version.
  await page.getByRole("button", { name: "수입 원본 prop 변경", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
  await form.getByRole("button", { name: "같은 요청 재시도", exact: true }).click();
  await expect(form).toContainText("저장됨 · 수입 확인 필요");
  await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeEnabled();
  await expect(amount).toHaveValue("123.456"); await expect(amount).toBeDisabled();
  const sent = await requests(); expect(sent).toHaveLength(3); expect(sent[2]).toEqual(sent[1]);
  expect(sent[2]).toMatchObject({ version: "9007199254740993", month: "2026-02", sourceName: "Synthetic salary", amount: "123.456", originalAmount: "123.456", occurredAt: "2026-03-02", originalLocalOccurredAt: "2026-02-25", memo: "moved salary" });
  for (const field of [...cardFields, "entryKind", "entryId"]) expect(sent[2]).not.toHaveProperty(field);
  await form.evaluate(form => (form as HTMLFormElement).requestSubmit());
  expect(await requests()).toHaveLength(3);
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByRole("button", { name: "수입 수정 수명주기", exact: true })).toBeFocused();
});

test("Task16 shared dialog emits income edit and explicit exclude/restore native fields without refund controls", async ({ page }, testInfo) => {
  const captures = async () => JSON.parse(await page.getByTestId("income-editor-captures").innerText()) as Record<string, string>[];
  for (const restoring of [false, true]) {
    await page.getByRole("button", { name: restoring ? "제외된 수입 열기" : "수입 원본 수정 열기", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "수입 상세·수정", exact: true });
    await expect(dialog.getByRole("radio")).toHaveCount(0);
    await expect(dialog).not.toContainText("환불"); await expect(dialog).not.toContainText("혜택");
    await dialog.getByLabel("메모", { exact: true }).fill("native income edit");
    await dialog.getByRole("button", { name: "수입 저장", exact: true }).click();
    const edited = (await captures()).at(-1)!;
    expect(edited).toMatchObject({ sourceName: "Synthetic salary", amount: "123.456", originalAmount: "123.456", occurredAt: "2026-02-25", originalLocalOccurredAt: "2026-02-25", version: "9007199254740993", month: "2026-02", memo: "native income edit" });
    for (const field of [...cardFields, "entryKind", "entryId"]) expect(edited).not.toHaveProperty(field);
    await dialog.locator("details summary").click();
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: restoring ? "수입 복원" : "수입 제외", exact: true }).click();
    expect((await captures()).at(-1)).toMatchObject({ excluded: String(!restoring), version: "9007199254740993", month: "2026-02" });
    expect((await captures()).at(-1)).not.toHaveProperty("transactionId");
    await dialog.screenshot({ path: testInfo.outputPath(restoring ? "income-restore.png" : "income-edit.png") });
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  }
  await page.getByRole("button", { name: "읽기 전용 수입 열기", exact: true }).click();
  const readOnly = page.getByRole("dialog", { name: "수입 상세·수정", exact: true });
  await expect(readOnly.locator("form")).toHaveCount(0); await expect(readOnly).toContainText("123.456");
  await readOnly.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "내역 추가", exact: true }).click();
  const create = page.getByRole("dialog", { name: "새 내역 기록", exact: true });
  await expect(create.getByRole("radio", { name: "지출", exact: true })).toBeChecked();
  await create.getByRole("radio", { name: "수입", exact: true }).check();
  await expect(create.getByLabel("수입 내용", { exact: true })).toBeVisible();
  await expect(create.locator('[name="userCardId"]')).toHaveCount(0);
});

test("Task16 unsupported UI blocks income submission without blocking the expense form", async ({ page }) => {
  const form = page.locator(".ledger-entry form");
  await form.getByRole("radio", { name: "수입", exact: true }).check();
  await form.getByLabel("금액", { exact: true }).fill("1000"); await form.getByLabel("수입 내용", { exact: true }).fill("Synthetic blocked income");
  await page.getByRole("button", { name: "수입 지원 전환", exact: true }).click();
  await expect(form).toContainText("수입 기능 적용 필요"); await expect(form.getByRole("button", { name: "수입 저장", exact: true })).toBeDisabled();
  await form.evaluate(form => (form as HTMLFormElement).requestSubmit());
  expect(JSON.parse(await page.getByTestId("requests").innerText())).toEqual([]);
  await form.getByRole("radio", { name: "지출", exact: true }).check();
  await form.getByRole("button", { name: "지출 저장", exact: true }).click();
  await expect(form.getByText("입력 확인", { exact: true })).toBeVisible();
  expect(JSON.parse(await page.getByTestId("requests").innerText())[0]).toMatchObject({ handledAs: "expense", amount: "1000" });
});
