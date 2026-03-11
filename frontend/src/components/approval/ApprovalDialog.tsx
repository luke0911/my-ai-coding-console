"use client";

import type { ClientMessage } from "@my-ai-console/shared";
import { useSessionStore } from "@/store/session-store";

interface ApprovalDialogProps {
  sessionId: string;
  approval: {
    requestId: string;
    action: "file_write" | "command_execute" | "file_delete";
    description: string;
    detail: string;
    timestamp: number;
  };
  send: (msg: ClientMessage) => void;
}

const ACTION_LABELS = {
  file_write: "파일 쓰기",
  command_execute: "명령어 실행",
  file_delete: "파일 삭제",
};

const ACTION_COLORS = {
  file_write: "border-accent-orange",
  command_execute: "border-accent-orange",
  file_delete: "border-accent-red",
};

export function ApprovalDialog({ sessionId, approval, send }: ApprovalDialogProps) {
  const updateSessionData = useSessionStore((s) => s.updateSessionData);

  const respond = (approved: boolean) => {
    send({
      type: "approval:respond",
      sessionId,
      requestId: approval.requestId,
      approved,
    });
    updateSessionData(sessionId, (data) => ({
      pendingApprovals: data.pendingApprovals.filter(
        (a) => a.requestId !== approval.requestId
      ),
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div
        className={`bg-panel-header border-2 ${ACTION_COLORS[approval.action]} rounded-lg p-5 max-w-md w-full mx-4 shadow-2xl`}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-accent-orange text-lg">?</span>
          <h2 className="text-sm font-semibold text-gray-200">
            승인 필요
          </h2>
        </div>

        <div className="mb-3">
          <span className="text-[10px] font-semibold text-accent-orange uppercase">
            {ACTION_LABELS[approval.action]}
          </span>
          <p className="text-sm text-gray-300 mt-1">{approval.description}</p>
        </div>

        <div className="bg-panel-bg rounded p-3 mb-4 border border-panel-border">
          <code className="text-xs text-gray-400 whitespace-pre-wrap">
            {approval.detail}
          </code>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={() => respond(false)}
            className="px-4 py-1.5 text-sm border border-accent-red/50 text-accent-red rounded hover:bg-accent-red/10 transition-colors"
          >
            거부
          </button>
          <button
            onClick={() => respond(true)}
            className="px-4 py-1.5 text-sm bg-accent-green text-white rounded hover:bg-accent-green/80 transition-colors"
          >
            승인
          </button>
        </div>
      </div>
    </div>
  );
}
