import type { OwnerContext } from "@/lib/auth/owner";

export function DemoBanner({ owner }: { owner: OwnerContext }) {
  if (owner.mode !== "demo") {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-800">
      데모 모드입니다. 샘플 데이터는 읽기 전용이며, 내 데이터로 사용하려면 로그인해 주세요.
    </div>
  );
}
