"use client";

export function LocalDate({
  value,
  format = "date",
}: {
  value: string;
  format?: "date" | "datetime";
}) {
  const formatted = new Date(value).toISOString().slice(
    0,
    format === "datetime" ? 16 : 10,
  );

  return <time dateTime={value}>{formatted.replace("T", " ")}</time>;
}
