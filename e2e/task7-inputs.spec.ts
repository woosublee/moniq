import { expect, test } from "@playwright/test";

test("final fix 5: native same-day and month-end refund timestamps reach the submitted payload", async ({ page }, testInfo) => {
  await page.context().addCookies([{ name: "moniq_demo", value: "1", domain: "localhost", path: "/" }]);
  await page.goto("/task7-harness");
  for (const day of ["13", "30"]) {
    if (day === "30") await page.getByRole("button", { name: "월말 환불 사례 전환" }).click();
    await page.getByRole("button", { name: "실제 취소·부분취소 기록", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "실제 취소·부분취소", exact: true });
    await dialog.getByLabel("환불 금액 · 원", { exact: true }).fill("2000");
    await dialog.getByLabel("환불 날짜", { exact: true }).fill(`2026-09-${day}`);
    await expect(dialog.getByLabel("환불 시각 · 한국 시간", { exact: true })).toBeVisible();
    await dialog.getByLabel("환불 시각 · 한국 시간", { exact: true }).fill("16:00");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "환불 기록 저장" }).click();
    const captures = JSON.parse(await page.getByTestId("captured-inputs").innerText());
    expect(captures.at(-1)).toMatchObject({ amount: "2000", occurredAt: `2026-09-${day}`, occurredTime: "16:00", month: "2026-09" });
    await dialog.screenshot({ path: testInfo.outputPath(`refund-${day}.png`) });
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  }
});

test("final fix 6: existing product opens a fresh card instance form each time", async ({ page }, testInfo) => {
  await page.context().addCookies([{ name: "moniq_demo", value: "1", domain: "localhost", path: "/" }]);
  await page.goto("/task7-harness");
  await page.getByRole("button", { name: "카드 추가", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "카드 추가", exact: true });
  await dialog.getByRole("button", { name: /생활비 카드/ }).click();
  await expect(dialog.getByRole("button", { name: "내 카드로 등록", exact: true })).toBeVisible();
  await dialog.getByLabel("카드 별칭").fill("별도 실물 B");
  await dialog.screenshot({ path: testInfo.outputPath("second-card-instance.png") });
  const first = await dialog.locator('input[name="entryId"]').inputValue();
  const request = await dialog.locator('input[name="requestId"]').inputValue();
  expect(first).toMatch(/^[0-9a-f-]{36}$/);
  await dialog.getByRole("button", { name: "내 카드로 등록", exact: true }).click();
  expect(JSON.parse(await page.getByTestId("captured-inputs").innerText()).at(-1)).toMatchObject({ cardId: "demo-product-everyday", alias: "별도 실물 B", entryId: first, requestId: request });
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "카드 추가", exact: true }).click();
  await expect(dialog.locator('input[name="entryId"]')).not.toHaveValue(first);
  await expect(dialog.locator('input[name="requestId"]')).not.toHaveValue(request);
});

test("final fix 7: LA browser cannot rewrite Seoul ledger month, display date or explicit filters", async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: "America/Los_Angeles", baseURL: "http://localhost:3106" });
  const page = await context.newPage(); const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await context.addCookies([{ name: "moniq_demo", value: "1", domain: "localhost", path: "/" }]);
    await page.clock.setFixedTime(new Date("2026-08-31T15:30:00Z"));
    await page.goto("/transactions/new");
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/ledger");
    expect(new URL(page.url()).searchParams.get("startDate")).toBeNull();
    await expect(page.getByLabel("조회 월", { exact: true })).toHaveValue("2026-02");
    await page.goto("/transactions/new?startDate=2026-07-04&endDate=2026-07-23&timezoneOffset=420#quick-entry");
    await expect(page.getByLabel("시작일", { exact: true })).toHaveValue("2026-07-04");
    await expect(page.getByLabel("종료일", { exact: true })).toHaveValue("2026-07-23");
    expect(new URL(page.url()).searchParams.get("timezoneOffset")).toBe("420");
    expect(new URL(page.url()).hash).toBe("");
    await expect(page.locator('input[name="timezoneOffset"]')).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "새 내역 기록" })).toContainText("읽기 전용");
    await page.goto("/task7-harness");
    await expect(page.getByTestId("seoul-date")).toContainText("09. 01.");
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("final fix 4: quota form submits exact opening zero and never substitutes current remaining", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: "moniq_demo", value: "1", domain: "localhost", path: "/" }]);
  await page.goto("/task7-harness");
  const form = page.locator('form').filter({ has: page.locator('input[name="scopeKind"][value="quota"]') });
  await form.getByLabel("한도 자료 상태").selectOption("remaining");
  await form.getByLabel("시작 잔여량 · 혜택 · 원", { exact: true }).fill("0");
  await form.locator("..").screenshot({ path: testInfo.outputPath("quota-opening-zero.png") });
  await form.getByRole("button", { name: "한도 자료 저장" }).click();
  expect(JSON.parse(await page.getByTestId("captured-inputs").innerText()).at(-1)).toMatchObject({ scopeKind: "quota", scopeInstanceKey: "card:a:quota:pool", inputMonth: "2026-02", dataStatus: "remaining", amount: "0" });
  await form.getByLabel("한도 자료 상태").selectOption("unknown");
  await expect(form.locator('input[name="amount"]')).toHaveCount(0);
  await form.getByRole("button", { name: "한도 자료 저장" }).click();
  const unknown = JSON.parse(await page.getByTestId("captured-inputs").innerText()).at(-1);
  expect(unknown.dataStatus).toBe("unknown"); expect(unknown).not.toHaveProperty("amount");
  await form.screenshot({ path: testInfo.outputPath("quota-input.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("final fix 4 daily completion: one month source, explicit legacy review and no opening payload", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.context().addCookies([{ name: "moniq_demo", value: "1", domain: "localhost", path: "/" }]);
  await page.goto("/task7-harness");
  const harness = page.getByTestId("final-fix");
  const form = harness.locator("form").filter({ has: page.locator('input[name="scopeKind"][value="quota"]') });
  const captures = async () => JSON.parse(await page.getByTestId("captured-inputs").innerText()) as Record<string, string>[];
  for (const original of [false, true]) {
    await harness.getByRole("button", { name: original ? "일별 한도 기존 소수 원문 사례" : "일별 한도 미입력 사례", exact: true }).click();
    await expect(form).toHaveCount(1);
    const section = form.locator(".."); const status = form.getByLabel("한도 자료 상태");
    await expect(section).toContainText("월 자료 원본 하나");
    await expect(section).toContainText("2026-02-02"); await expect(section).toContainText("2026-02-20");
    await expect(section).toContainText("500"); await expect(section).toContainText("300");
    await expect(form.locator('option[value="remaining"], input[name="amount"]')).toHaveCount(0);
    await expect(status).toHaveValue(original ? "" : "unknown");
    if (original) {
      await expect(section).toContainText("원본 0.125");
      await expect(section).toContainText("일별 시작 잔여량은 미지원");
      await form.getByRole("button", { name: "한도 자료 저장" }).click();
      expect(await status.evaluate(select => (select as HTMLSelectElement).validity.valueMissing)).toBe(true);
      expect(await captures()).toEqual([]);
      await section.screenshot({ path: testInfo.outputPath("daily-legacy-unselected.png") });
    }
    for (const selection of ["complete", "unknown"]) {
      await status.selectOption(selection);
      await form.getByRole("button", { name: "한도 자료 저장" }).click();
      const payload = (await captures()).at(-1)!;
      expect(payload).toMatchObject({ month: "2026-02", inputMonth: "2026-02", scopeKind: "quota", scopeKey: "pool", scopeInstanceKey: "card:a:quota:pool", dataStatus: selection, version: original ? "7" : "" });
      expect(payload).not.toHaveProperty("amount");
      // Capture stops before the shared dispatch boundary assigns/fixes UUIDs.
      // The Action roundtrip test covers that boundary and identical unknown retry.
      expect(payload).toHaveProperty("requestId");
      if (original) expect(payload).not.toHaveProperty("entryId");
      else expect(payload).toHaveProperty("entryId");
    }
    if (original) await expect(section).toContainText("원본 0.125"); // capture never writes the source
    await section.screenshot({ path: testInfo.outputPath(original ? "daily-legacy-review.png" : "daily-completion.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("Task7 fix2 mounted default stays the reset source when props change without remount", async ({ page }) => {
  const credit = "33333333-3333-4333-8333-333333333902";
  const check = "33333333-3333-4333-8333-333333333903";
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.context().addCookies([{ name: "moniq_demo", value: "1", domain: "localhost", path: "/" }]);
  await page.goto("/task7-harness");
  const selection = page.getByRole("combobox", { name: "카드", exact: true });
  const amount = page.getByLabel("금액", { exact: true });
  const merchant = page.getByLabel("사용처", { exact: true });
  const method = page.locator('.ledger-entry input[name="paymentMethod"]');
  const mountedForm = await page.locator(".ledger-entry form").elementHandle();
  const readRequests = async () => JSON.parse(await page.getByTestId("requests").innerText()) as Record<string, string>[];
  await selection.selectOption(check);
  await page.getByRole("button", { name: "기본 카드 prop 체크 B", exact: true }).click();
  await expect(page.getByTestId("default-card-prop")).toHaveText(check);
  expect(await mountedForm!.evaluate(form => form === document.querySelector(".ledger-entry form"))).toBe(true);
  await amount.fill("1234");
  await merchant.fill("Synthetic updated default");
  await page.getByRole("button", { name: "지출 저장", exact: true }).click();
  await expect(page.getByText("입력 확인", { exact: true })).toBeVisible();
  await expect(amount).toHaveValue("1234");
  await expect(selection).toHaveValue(check);
  await expect(method).toHaveValue("check_card");
  await page.getByRole("button", { name: "지출 저장", exact: true }).click();
  await expect(page.getByText("응답 미확인", { exact: true })).toBeVisible();
  // Simulate fresh parent data while this exact form has an unknown request.
  for (const name of ["기본 카드 prop 신용 A", "기본 카드 prop 체크 B"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(selection).toBeDisabled();
    await expect(selection).toHaveValue(check);
    await expect(amount).toHaveValue("1234");
    await expect(method).toHaveValue("check_card");
  }
  await page.getByRole("button", { name: "같은 요청 재시도", exact: true }).click();
  await expect(amount).toHaveValue("");
  const first = await readRequests();
  expect(first).toHaveLength(3);
  expect(first[2]).toEqual(first[1]);
  expect(first[2]).toMatchObject({ paymentMethod: "check_card", userCardId: check, amount: "1234", month: "2026-02" });
  await expect(selection).toHaveValue(credit);
  await expect(method).toHaveValue("credit_card");
  expect(await selection.evaluate(select => [...(select as HTMLSelectElement).options].filter(option => option.defaultSelected).map(option => option.value))).toEqual([credit]);
  // The selected state already equals the mounted reset source on this submission.
  // A skipped same-value setState must not disagree with the native DOM reset.
  await amount.fill("5000");
  await merchant.fill("Synthetic unchanged reset choice");
  await page.getByRole("button", { name: "지출 저장", exact: true }).click();
  await expect(amount).toHaveValue("");
  const next = await readRequests();
  expect(next).toHaveLength(4);
  expect(next[3]).toMatchObject({ paymentMethod: "credit_card", userCardId: credit, amount: "5000" });
  expect(next[3].requestId).not.toBe(next[2].requestId);
  expect(next[3].entryId).not.toBe(next[2].entryId);
  await expect(selection).toHaveValue(credit);
  await expect(method).toHaveValue("credit_card");
  await expect(page.getByTestId("default-card-prop")).toHaveText(check);
  expect(await mountedForm!.evaluate(form => form === document.querySelector(".ledger-entry form"))).toBe(true);
  expect(errors).toEqual([]);
});

test("Task7 fix1 consecutive payment choices reset DOM and submitted method together", async ({ page }) => {
  const credit = "33333333-3333-4333-8333-333333333902";
  const debit = "33333333-3333-4333-8333-333333333903";
  await page.context().addCookies([{ name: "moniq_demo", value: "1", domain: "localhost", path: "/" }]);
  await page.goto("/task7-harness");
  const amount = page.getByLabel("금액", { exact: true });
  const merchant = page.getByLabel("사용처", { exact: true });
  const selection = page.getByRole("combobox", { name: "카드", exact: true });
  const method = page.locator('.ledger-entry input[name="paymentMethod"]');
  const readRequests = async () => JSON.parse(await page.getByTestId("requests").innerText()) as Record<string, string>[];
  await selection.selectOption("cash");
  await amount.fill("1234");
  await merchant.fill("Synthetic cash retry");
  await page.getByRole("button", { name: "지출 저장", exact: true }).click();
  await expect(page.getByText("입력 확인", { exact: true })).toBeVisible();
  await expect(selection).toHaveValue("cash");
  await expect(method).toHaveValue("cash");
  await expect(amount).toHaveValue("1234");
  await page.getByRole("button", { name: "지출 저장", exact: true }).click();
  await expect(page.getByText("응답 미확인", { exact: true })).toBeVisible();
  await expect(selection).toBeDisabled();
  await expect(selection).toHaveValue("cash");
  await expect(method).toHaveValue("cash");
  await expect(amount).toHaveValue("1234");
  await page.getByRole("button", { name: "같은 요청 재시도", exact: true }).click();
  await expect(amount).toHaveValue("");
  const initial = await readRequests();
  expect(initial).toHaveLength(3);
  expect(initial[2]).toEqual(initial[1]);
  expect(initial[2]).toMatchObject({ paymentMethod: "cash", userCardId: "cash", amount: "1234", month: "2026-02" });

  // After every acknowledged creation, leave the reset card untouched for the next
  // creation too: a visually correct select must never hide a stale cash/debit method.
  for (const [choice, paymentMethod] of [[credit, "credit_card"], ["points", "points"], [credit, "credit_card"], [debit, "check_card"], [credit, "credit_card"], ["cash", "cash"], [credit, "credit_card"]]) {
    await expect(selection).toHaveValue(credit);
    await expect(method).toHaveValue("credit_card");
    if (choice !== credit) await selection.selectOption(choice);
    await expect(method).toHaveValue(paymentMethod);
    await amount.fill("5000");
    await merchant.fill(`Synthetic ${choice}`);
    const before = await readRequests();
    await page.getByRole("button", { name: "지출 저장", exact: true }).click();
    await expect(amount).toHaveValue("");
    const after = await readRequests();
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toMatchObject({ paymentMethod, userCardId: choice, amount: "5000", month: "2026-02" });
    expect(after.at(-1)?.requestId).not.toBe(before.at(-1)?.requestId);
    expect(after.at(-1)?.entryId).not.toBe(before.at(-1)?.entryId);
  }
  await expect(selection).toHaveValue(credit);
  await expect(method).toHaveValue("credit_card");
});

test("a pre-hydration submission gets stable IDs at the shared dispatch boundary", async ({ page }) => {
  await page.context().addCookies([{ name: "moniq_demo", value: "1", domain: "localhost", path: "/" }]);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async route => { await gate; await route.continue(); });
  try {
    await page.goto("/task7-harness", { waitUntil: "commit" });
    await page.getByLabel("금액", { exact: true }).fill("1234");
    await page.getByLabel("사용처", { exact: true }).fill("Synthetic hydration");
    await expect(page.locator('.ledger-entry input[name="requestId"]')).toHaveValue("");
    await page.getByRole("button", { name: "지출 저장", exact: true }).click();
    await page.getByRole("button", { name: "지출 저장", exact: true }).click();
    release();
    await expect(page.getByText("입력 확인", { exact: true })).toBeVisible();
    await expect(page.getByLabel("금액", { exact: true })).toHaveValue("1234");
    const requests = JSON.parse(await page.getByTestId("requests").innerText());
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ month: "2026-02", amount: "1234" });
    expect(requests[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(requests[0].entryId).toMatch(/^[0-9a-f-]{36}$/);
  } finally { release(); }
});

test("one unknown mutation locks sibling forms and close until identical retry resolves", async ({ page }) => {
  await page.context().addCookies([{ name: "moniq_demo", value: "1", domain: "localhost", path: "/" }]);
  await page.goto("/task7-harness");
  await page.getByRole("button", { name: "경계 폼 열기" }).click();
  await page.getByRole("button", { name: "첫 수정", exact: true }).click();
  await expect(page.getByRole("button", { name: "같은 요청 재시도", exact: true })).toBeEnabled();
  await expect(page.getByLabel("다른 입력")).toBeDisabled();
  await expect(page.getByRole("button", { name: "다른 수정", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "닫기", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "같은 요청 재시도", exact: true }).click();
  await expect(page.getByRole("button", { name: "닫기", exact: true })).toBeEnabled();
  await expect(page.getByLabel("다른 입력")).toBeDisabled();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByRole("button", { name: "경계 폼 열기" })).toBeFocused();
});

test("isolated native form preserves rejected and unknown input, retries identically, then resets", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: "moniq_demo", value: "1", domain: "localhost", path: "/" }]);
  await page.goto("/task7-harness");
  await page.getByLabel("금액", { exact: true }).fill("1234");
  await page.getByLabel("사용처", { exact: true }).fill("Synthetic retry shop");
  await page.getByRole("button", { name: "지출 저장", exact: true }).click();
  await page.locator(".ledger-entry form").evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
  await expect(page.getByText("입력 확인", { exact: true })).toBeVisible();
  expect(JSON.parse(await page.getByTestId("requests").innerText())).toHaveLength(1);
  await expect(page.getByLabel("금액", { exact: true })).toHaveValue("1234");
  await page.getByRole("button", { name: "지출 저장", exact: true }).click();
  await expect(page.getByLabel("금액", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /같은 요청/ }).click();
  await expect(page.getByText("저장되었습니다.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("금액", { exact: true })).toHaveValue("");
  const requests = JSON.parse(await page.getByTestId("requests").innerText());
  expect(requests[2]).toEqual(requests[1]);
  expect(requests[1].month).toBe("2026-02");
  await page.getByLabel("금액", { exact: true }).fill("5000");
  await page.getByLabel("사용처", { exact: true }).fill("Synthetic next shop");
  await page.getByRole("button", { name: "지출 저장", exact: true }).click();
  await expect(page.getByTestId("requests")).toContainText("Synthetic next shop");
  const next = JSON.parse(await page.getByTestId("requests").innerText());
  expect(next[3].requestId).not.toBe(next[2].requestId); expect(next[3].entryId).not.toBe(next[2].entryId);
  await expect(page.getByRole("button", { name: "지출 저장", exact: true })).toBeEnabled();
  await page.locator(".ledger-entry").screenshot({ path: testInfo.outputPath("form-lifecycle.png") });
  await page.locator(".ledger-entry details summary").first().click();
  await page.locator(".ledger-entry").screenshot({ path: testInfo.outputPath("form-auxiliary.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
