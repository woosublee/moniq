import Link from "next/link";

const highlights = [
  {
    title: "혜택 계산",
    description:
      "카드별 할인, 적립, 청구할인을 규칙으로 계산해서 거래마다 예상 혜택을 보여줍니다.",
  },
  {
    title: "실적 추적",
    description:
      "혜택 계산과 분리된 eligible spend 기준으로 전월 실적 충족 여부를 판단합니다.",
  },
  {
    title: "카드 비교",
    description:
      "특정 사용처에서 어떤 카드가 가장 유리한지와 남은 한도를 한 번에 비교합니다.",
  },
];

const priorities = [
  "거래 입력 기능부터 구현",
  "사용처 정규화와 카테고리 매핑 추가",
  "카드 혜택 계산 로직 연결",
  "전월 실적 계산과 월 한도 상태 반영",
];

const sampleComparison = [
  {
    name: "Card A",
    benefit: "2,400원 할인",
    status: "카페 한도 1,600원 남음",
  },
  {
    name: "Card B",
    benefit: "600원 적립",
    status: "한도 없음",
  },
  {
    name: "Card C",
    benefit: "혜택 없음",
    status: "비교 대상 유지",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1d4ed8_0%,_#0f172a_38%,_#020617_100%)] text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 sm:px-10 lg:px-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-white/10 bg-white/6 p-8 shadow-2xl shadow-blue-950/30 backdrop-blur sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-blue-100/80">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-blue-300/30 bg-blue-400/10 px-3 py-1">
                Moniq MVP
              </span>
              <span>Vercel + Supabase + Next.js 16</span>
            </div>
            <nav className="flex flex-wrap gap-2 text-sm font-medium">
              <Link href="/transactions/new" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
                거래 입력
              </Link>
              <Link href="/cards" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
                내 카드
              </Link>
              <Link href="/cards/search" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
                카드 검색
              </Link>
            </nav>
          </div>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)] lg:items-end">
            <div className="space-y-6">
              <div className="space-y-4">
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-blue-200/75">
                  Smart wallet for Korean card benefits
                </p>
                <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  어떤 결제수단을 써야 가장 유리한지,
                  <br />
                  Moniq가 규칙으로 계산합니다.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-blue-50/78 sm:text-lg">
                  Moniq는 현금, 카드, 포인트를 함께 관리하면서 카드 혜택,
                  전월 실적, 남은 할인 한도를 설명 가능한 로직으로 계산하는
                  가계부 서비스입니다.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 text-sm font-medium">
                <span className="rounded-full bg-white px-4 py-2 text-slate-950">
                  혜택 계산과 실적 계산 분리
                </span>
                <span className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-blue-50">
                  LLM 없이 deterministic rule engine
                </span>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/transactions/new"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  거래 내역 보기
                </Link>
                <span className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/6 px-5 text-sm font-medium text-blue-50/82">
                  다음 단계: 카드 혜택 계산 연결
                </span>
              </div>
            </div>

            <section className="rounded-[28px] border border-white/12 bg-slate-950/55 p-6 shadow-lg shadow-black/20">
              <p className="text-sm font-medium text-blue-200/80">예시 비교</p>
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-white/8 bg-white/6 px-4 py-3 text-sm text-blue-50/80">
                  스타벅스 12,000원 결제
                </div>
                {sampleComparison.map((card) => (
                  <div
                    key={card.name}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-white">{card.name}</p>
                        <p className="mt-1 text-sm text-blue-100/75">{card.status}</p>
                      </div>
                      <p className="text-sm font-semibold text-cyan-300">{card.benefit}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {highlights.map((item) => (
            <article
              key={item.title}
              className="rounded-[28px] border border-white/10 bg-white/6 p-6 backdrop-blur"
            >
              <p className="text-lg font-semibold text-white">{item.title}</p>
              <p className="mt-3 text-sm leading-7 text-blue-50/72">
                {item.description}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <article className="rounded-[28px] border border-white/10 bg-slate-950/55 p-7 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-white">구현 우선순위</p>
                <p className="mt-2 text-sm text-blue-100/70">
                  설계 문서를 늘리기보다 핵심 흐름부터 작게 구현합니다.
                </p>
              </div>
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
                Build first
              </span>
            </div>

            <ol className="mt-6 space-y-3">
              {priorities.map((item, index) => (
                <li
                  key={item}
                  className="flex items-start gap-4 rounded-2xl border border-white/8 bg-white/4 px-4 py-4"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-950">
                    {index + 1}
                  </span>
                  <p className="pt-1 text-sm leading-7 text-blue-50/82">{item}</p>
                </li>
              ))}
            </ol>
          </article>

          <article className="rounded-[28px] border border-white/10 bg-white/6 p-7 backdrop-blur">
            <p className="text-lg font-semibold text-white">도메인 메모</p>
            <div className="mt-5 space-y-4 text-sm leading-7 text-blue-50/78">
              <p>
                한국 카드 도메인에서는 혜택을 받은 결제가 전월 실적에서 제외될 수
                있으므로, <strong className="text-white">amount</strong>,{" "}
                <strong className="text-white">benefit_amount</strong>,{" "}
                <strong className="text-white">eligible_spend_amount</strong>를
                분리해서 다뤄야 합니다.
              </p>
              <p>
                초기 MVP는 데이터 저장보다 계산 로직이 중요하므로 카드 추천과 한도
                계산은 모두 규칙 기반 함수로 구현합니다.
              </p>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
