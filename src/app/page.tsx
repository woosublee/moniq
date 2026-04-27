import Link from "next/link";

const highlights = [
  {
    title: "지출을 빠르게 기록",
    description:
      "금액, 사용처, 결제수단을 입력하고 카드 혜택이나 고정비 여부까지 함께 남길 수 있습니다.",
  },
  {
    title: "내 카드를 연결",
    description:
      "자주 쓰는 카드를 등록해두면 지출을 기록할 때 결제 카드를 바로 선택할 수 있습니다.",
  },
  {
    title: "혜택과 실적을 함께 정리",
    description:
      "할인·적립 금액과 실적 반영 여부를 기록해 카드 사용 내역을 더 정확히 관리합니다.",
  },
];

const guideItems = [
  "오늘 쓴 지출을 금액과 사용처 중심으로 빠르게 기록하세요.",
  "자주 쓰는 카드는 기본 카드로 설정해 입력 시간을 줄이세요.",
  "할인이나 적립이 있었다면 혜택 메모와 금액을 함께 남겨두세요.",
  "실적 제외 결제나 매달 반복되는 고정비도 따로 표시해 관리하세요.",
];

const sampleComparison = [
  {
    name: "생활비 카드",
    benefit: "2,400원 할인",
    status: "이번 달 주 사용 카드",
  },
  {
    name: "카페 할인 카드",
    benefit: "600원 적립",
    status: "카페 지출에 자주 사용",
  },
  {
    name: "현금 지출",
    benefit: "혜택 기록 없음",
    status: "일반 지출로 정리",
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
                카드 혜택까지 함께 보는 가계부
              </span>
              <span>지출 기록 · 내 카드 관리 · 혜택 메모</span>
            </div>
            <nav className="flex flex-wrap gap-2 text-sm font-medium">
              <Link href="/transactions/new" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
                지출 내역
              </Link>
              <Link href="/cards" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
                내 카드
              </Link>
              <Link href="/cards/search" className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-blue-50 transition hover:bg-white/10">
                카드 찾기
              </Link>
            </nav>
          </div>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)] lg:items-end">
            <div className="space-y-6">
              <div className="space-y-4">
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-blue-200/75">
                  Spending and card benefits
                </p>
                <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  내 지출과 카드를
                  <br />
                  한곳에서 정리하세요.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-blue-50/78 sm:text-lg">
                  현금, 카드, 포인트 지출을 기록하고 보유 카드를 연결해
                  혜택 금액과 실적 반영 여부까지 함께 관리할 수 있습니다.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 text-sm font-medium">
                <span className="rounded-full bg-white px-4 py-2 text-slate-950">
                  지출과 카드 사용 내역을 함께 정리
                </span>
                <span className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-blue-50">
                  할인·적립·실적 여부 기록
                </span>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/transactions/new"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-cyan-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  지출 기록하러 가기
                </Link>
                <Link
                  href="/cards/search"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/6 px-5 text-sm font-medium text-blue-50 transition hover:bg-white/10"
                >
                  내 카드 등록하기
                </Link>
              </div>
            </div>

            <section className="rounded-[28px] border border-white/12 bg-slate-950/55 p-6 shadow-lg shadow-black/20">
              <p className="text-sm font-medium text-blue-200/80">오늘의 지출 예시</p>
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-white/8 bg-white/6 px-4 py-3 text-sm text-blue-50/80">
                  카페 12,000원 결제
                </div>
                {sampleComparison.map((item) => (
                  <div
                    key={item.name}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-white">{item.name}</p>
                        <p className="mt-1 text-sm text-blue-100/75">{item.status}</p>
                      </div>
                      <p className="text-sm font-semibold text-cyan-300">{item.benefit}</p>
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
                <p className="text-lg font-semibold text-white">Moniq로 정리할 수 있는 것</p>
                <p className="mt-2 text-sm text-blue-100/70">
                  지출을 입력할 때 카드와 혜택 정보를 함께 남겨두세요.
                </p>
              </div>
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
                한눈에 보기
              </span>
            </div>

            <ol className="mt-6 space-y-3">
              {guideItems.map((item, index) => (
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
            <p className="text-lg font-semibold text-white">카드 혜택 관리 팁</p>
            <div className="mt-5 space-y-4 text-sm leading-7 text-blue-50/78">
              <p>
                카드 혜택을 받은 결제가 전월 실적에 포함되지 않는 경우가 있습니다.
                실적 제외 지출은 따로 표시해두면 월말에 카드 사용 현황을 더 쉽게 확인할 수 있어요.
              </p>
              <p>
                통신비, 구독료처럼 매달 반복되는 지출은 고정비로 표시해두면
                다음 달 소비 계획을 세울 때 도움이 됩니다.
              </p>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
