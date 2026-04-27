"use client";

import { useEffect, useRef } from "react";

export function TimezoneOffsetInput({ value }: { value?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = String(new Date().getTimezoneOffset());
    }
  }, []);

  return (
    <input
      ref={inputRef}
      type="hidden"
      name="timezoneOffset"
      defaultValue={value ?? "0"}
    />
  );
}
