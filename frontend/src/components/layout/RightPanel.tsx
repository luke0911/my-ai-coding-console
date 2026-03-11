"use client";

import { useSessionStore } from "@/store/session-store";
import { ReasoningSummary } from "@/components/reasoning/ReasoningSummary";
import { formatTime } from "@/lib/utils";

export function RightPanel({ sessionId }: { sessionId: string | null }) {
  const data = useSessionStore((s) =>
    sessionId ? s.sessionData[sessionId] : null
  );
  const currentPlan = data?.currentPlan ?? "";
  const nextAction = data?.nextAction ?? "";
  const reasoningSummaries = data?.reasoningSummaries ?? [];
  const stage = data?.stage ?? "idle";

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col overflow-hidden bg-panel-bg">
      {/* Plan / Next Action */}
      <div className="p-3 border-b border-panel-border">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          현재 계획
        </h3>
        {currentPlan ? (
          <div className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
            {currentPlan}
          </div>
        ) : (
          <div className="text-xs text-gray-600 italic">
            아직 계획 없음 — 프롬프트를 보내면 시작됩니다
          </div>
        )}
        {nextAction && (
          <div className="mt-2 p-2 rounded bg-accent-blue/10 border border-accent-blue/20">
            <div className="text-[10px] text-accent-blue font-semibold uppercase mb-0.5">
              다음 작업
            </div>
            <div className="text-xs text-gray-300">{nextAction}</div>
          </div>
        )}
      </div>

      {/* Reasoning summaries */}
      <div className="flex-1 overflow-y-auto p-3 border-b border-panel-border">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          추론 요약
        </h3>
        {reasoningSummaries.length === 0 ? (
          <div className="text-xs text-gray-600 italic">
            에이전트 추론 내용이 여기에 표시됩니다
          </div>
        ) : (
          <div className="space-y-2">
            {reasoningSummaries.map((r, i) => (
              <ReasoningSummary key={i} {...r} />
            ))}
          </div>
        )}
      </div>

      {/* Warnings / risk notes */}
      <div className="p-3 flex-shrink-0">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          경고
        </h3>
        {stage === "error" ? (
          <div className="text-xs p-2 rounded bg-accent-red/10 border border-accent-red/20 text-accent-red">
            세션에서 오류가 발생했습니다. 이벤트 스트림에서 상세 내용을 확인하세요.
          </div>
        ) : stage === "waiting_approval" ? (
          <div className="text-xs p-2 rounded bg-accent-orange/10 border border-accent-orange/20 text-accent-orange">
            승인이 필요한 작업이 있습니다. 승인 대화상자를 확인하세요.
          </div>
        ) : (
          <div className="text-xs text-gray-600 italic">경고 없음</div>
        )}
      </div>
    </aside>
  );
}
