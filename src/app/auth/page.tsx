import { AuthPanel } from "@/components/auth/auth-panel";
import { PageHeader } from "@/components/layout/page-header";
import { getSafeRedirectPath } from "@/lib/auth/access";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <>
      <PageHeader
        eyebrow="시작하기"
        title="내 카드로 Moniq를 시작하세요."
        description="로그인하면 내 카드와 거래를 안전하게 분리해서 저장합니다."
      />
      <AuthPanel
        nextPath={getSafeRedirectPath(next)}
        callbackFailed={error === "callback"}
      />
    </>
  );
}
