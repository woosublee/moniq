/** Compatibility form field only. Ledger boundaries are always Asia/Seoul;
 * hydration must never replace server-selected dates with the browser's month. */
export function TimezoneOffsetInput(props: { value?: string; syncCurrentMonth?: boolean }) {
  void props;
  return <input type="hidden" name="timezoneOffset" value="-540" />;
}
