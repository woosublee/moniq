"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const toLocalDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export function TimezoneOffsetInput({
  value,
  syncCurrentMonth = false,
}: {
  value?: string;
  syncCurrentMonth?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const timezoneOffset = String(new Date().getTimezoneOffset());

    if (inputRef.current) {
      inputRef.current.value = timezoneOffset;
    }

    if (!syncCurrentMonth) {
      return;
    }

    const url = new URL(window.location.href);
    const now = new Date();
    let changed = false;

    if (!url.searchParams.has("timezoneOffset")) {
      url.searchParams.set("timezoneOffset", timezoneOffset);
      changed = true;
    }

    if (!url.searchParams.has("startDate")) {
      url.searchParams.set("startDate", toLocalDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
      changed = true;
    }

    if (!url.searchParams.has("endDate")) {
      url.searchParams.set("endDate", toLocalDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
      changed = true;
    }

    if (changed) {
      router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
    }
  }, [router, syncCurrentMonth]);

  return (
    <input
      ref={inputRef}
      type="hidden"
      name="timezoneOffset"
      defaultValue={value ?? "0"}
    />
  );
}
