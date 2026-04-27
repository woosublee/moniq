"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

const getServerSnapshot = () => "";

const formatLocalDate = (value: string, format: "date" | "datetime") => {
  const date = new Date(value);

  return format === "datetime"
    ? date.toLocaleString("ko-KR")
    : date.toLocaleDateString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
      });
};

export function LocalDate({
  value,
  format = "date",
}: {
  value: string;
  format?: "date" | "datetime";
}) {
  const formatted = useSyncExternalStore(
    subscribe,
    () => formatLocalDate(value, format),
    getServerSnapshot,
  );

  return <time dateTime={value}>{formatted}</time>;
}
