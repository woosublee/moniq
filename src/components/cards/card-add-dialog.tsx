"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { RegisterCardForm } from "@/components/cards/register-card-form";
import type { CardRecord, UserCardRecord } from "@/features/cards/types";

export function CardAddDialog({
  cards,
  userCards,
}: {
  cards: CardRecord[];
  userCards: UserCardRecord[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<CardRecord | null>(null);
  const router = useRouter();
  const canUsePortal = typeof document !== "undefined";
  const registeredCardIds = useMemo(
    () => new Set(userCards.map((userCard) => userCard.card.id)),
    [userCards],
  );
  const filteredCards = cards.filter((card) => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return true;
    }

    return `${card.issuer} ${card.name} ${card.searchable_text}`
      .toLowerCase()
      .includes(normalizedQuery);
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-medium text-white transition hover:bg-slate-800"
      >
        카드 추가
      </button>

      {open && canUsePortal
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 px-4 py-8 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            >
              <div
                className="grid max-h-[calc(100vh-4rem)] w-full max-w-4xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="border-b border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-slate-950">카드 추가</p>
                      <p className="mt-2 text-sm text-slate-500">
                        보유한 카드를 찾아 내 카드로 등록하세요.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                      aria-label="닫기"
                    >
                      ×
                    </button>
                  </div>
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setSelectedCard(null);
                    }}
                    placeholder="카드사 또는 카드명"
                    className="mt-4 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 transition focus:border-emerald-500"
                  />
                </div>

                <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="min-h-0 overflow-y-auto border-b border-slate-200 lg:border-b-0 lg:border-r">
                    {filteredCards.length === 0 ? (
                      <div className="px-5 py-8 text-sm text-slate-500">
                        검색 결과가 없습니다.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {filteredCards.map((card) => {
                          const registered = registeredCardIds.has(card.id);
                          const selected = selectedCard?.id === card.id;

                          return (
                            <button
                              key={card.id}
                              type="button"
                              onClick={() => setSelectedCard(card)}
                              className={
                                selected
                                  ? "block w-full bg-emerald-50 px-5 py-3 text-left"
                                  : "block w-full px-5 py-3 text-left hover:bg-slate-50"
                              }
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-950">
                                    {card.issuer} {card.name}
                                  </p>
                                  <p className="mt-1 text-sm text-slate-500">
                                    {card.card_type === "credit_card" ? "신용카드" : "체크카드"}
                                    {card.network ? ` · ${card.network}` : ""}
                                  </p>
                                </div>
                                {registered ? (
                                  <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                    추가됨
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="min-h-0 overflow-y-auto p-5">
                    {selectedCard ? (
                      registeredCardIds.has(selectedCard.id) ? (
                        <CardPreview card={selectedCard} registered />
                      ) : (
                        <>
                          <CardPreview card={selectedCard} />
                          <div className="mt-5">
                            <RegisterCardForm
                              card={selectedCard}
                              onSuccess={() => {
                                setSelectedCard(null);
                                setOpen(false);
                                router.refresh();
                              }}
                            />
                          </div>
                        </>
                      )
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                        왼쪽 목록에서 등록할 카드를 선택하세요.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function CardPreview({
  card,
  registered = false,
}: {
  card: CardRecord;
  registered?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-950">
            {card.issuer} {card.name}
          </p>
          <p className="mt-1">
            {card.card_type === "credit_card" ? "신용카드" : "체크카드"}
            {card.network ? ` · ${card.network}` : ""}
            {typeof card.annual_fee === "number" ? ` · 연회비 ${card.annual_fee.toLocaleString("ko-KR")}원` : ""}
          </p>
        </div>
        {registered ? (
          <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            추가됨
          </span>
        ) : null}
      </div>
    </div>
  );
}
