"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useSessionStore } from "@/store/session-store";

type AuthState = "checking" | "authenticated" | "unauthenticated" | "logging_in";

/**
 * UsagePanel: embeds claude.ai/settings/usage in an Electron webview.
 * Detects authentication state and provides a login flow via popup.
 */
export function UsagePanel() {
  const webviewRef = useRef<HTMLElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const setAccountUsage = useSessionStore((s) => s.setAccountUsage);
  const usageRefreshRequest = useSessionStore((s) => s.usageRefreshRequest);

  const reloadWebview = useCallback(() => {
    const wv = webviewRef.current as any;
    if (wv?.loadURL) {
      setError(null);
      setLoading(true);
      setAuthState("checking");
      wv.loadURL("https://claude.ai/settings/usage");
    } else if (wv?.reload) {
      setError(null);
      setLoading(true);
      setAuthState("checking");
      wv.reload();
    }
  }, []);

  const handleLogin = useCallback(async () => {
    if (!window.electronAPI?.openClaudeLogin) return;

    setAuthState("logging_in");
    try {
      const result = await window.electronAPI.openClaudeLogin();
      if (result.success) {
        setAuthState("checking");
        setLoading(true);
        setError(null);
        setTimeout(() => {
          const wv = webviewRef.current as any;
          if (wv?.loadURL) {
            wv.loadURL("https://claude.ai/settings/usage");
          } else if (wv?.reload) {
            wv.reload();
          }
        }, 500);
      } else if (result.reason === "already_open") {
        setAuthState("unauthenticated");
      } else {
        setAuthState("unauthenticated");
      }
    } catch (err) {
      console.error("[UsagePanel] Login error:", err);
      setAuthState("unauthenticated");
      setError("로그인 중 오류가 발생했습니다.");
    }
  }, []);

  const scrapeUsage = useCallback(async () => {
    const wv = webviewRef.current as any;
    if (!wv?.executeJavaScript) return;

    try {
      // Wait a bit for the page to fully render
      await new Promise((r) => setTimeout(r, 2000));

      const text: string = await wv.executeJavaScript(`
        (() => {
          // Get all visible text from the main content area
          const main = document.querySelector('main') || document.body;
          const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
          const texts = [];
          let node;
          while (node = walker.nextNode()) {
            const t = node.textContent.trim();
            if (t && t.length > 0 && t.length < 200) {
              texts.push(t);
            }
          }
          return texts.join('\\n');
        })()
      `);

      if (text) {
        const lines = text
          .split("\n")
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0);
        setAccountUsage({ lines, scrapedAt: Date.now() });
        console.log("[UsagePanel] Scraped", lines.length, "lines");
      }
    } catch (err) {
      console.warn("[UsagePanel] Scrape failed:", err);
    }
  }, [setAccountUsage]);

  const handleLogout = useCallback(async () => {
    if (!window.electronAPI?.clearClaudeSession) return;
    await window.electronAPI.clearClaudeSession();
    setAuthState("unauthenticated");
  }, []);

  useEffect(() => {
    const webview = webviewRef.current as any;
    if (!webview) return;

    const onLoad = () => {
      setLoading(false);
    };

    const onFail = (e: any) => {
      // Error code -3 is "aborted" which happens during redirects
      if (e.errorCode === -3) return;
      setLoading(false);
      setError(`페이지 로드 실패: ${e.errorDescription || "알 수 없는 오류"}`);
    };

    const onNavigate = () => {
      const currentUrl: string = webview.getURL?.() || "";
      console.log("[UsagePanel] navigated to:", currentUrl);

      if (currentUrl.includes("/settings/usage")) {
        setAuthState("authenticated");
        scrapeUsage();
      } else if (
        currentUrl.includes("/login") ||
        currentUrl.includes("/signup") ||
        currentUrl === "https://claude.ai/" ||
        currentUrl === "https://claude.ai"
      ) {
        setLoading(false);
        setAuthState("unauthenticated");
      }
    };

    webview.addEventListener("did-finish-load", onLoad);
    webview.addEventListener("did-fail-load", onFail);
    webview.addEventListener("did-navigate", onNavigate);
    webview.addEventListener("did-navigate-in-page", onNavigate);

    return () => {
      webview.removeEventListener("did-finish-load", onLoad);
      webview.removeEventListener("did-fail-load", onFail);
      webview.removeEventListener("did-navigate", onNavigate);
      webview.removeEventListener("did-navigate-in-page", onNavigate);
    };
  }, []);

  // Re-scrape when refresh is requested from TokenDashboard
  useEffect(() => {
    if (usageRefreshRequest === 0) return;
    const wv = webviewRef.current as any;
    if (!wv) return;
    if (authState === "authenticated") {
      // Already on usage page, just reload and re-scrape
      if (wv.reload) wv.reload();
    } else if (wv.loadURL) {
      wv.loadURL("https://claude.ai/settings/usage");
    }
  }, [usageRefreshRequest, authState]);

  const isElectron = typeof window !== "undefined" && !!window.electronAPI;

  if (!isElectron) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        사용량 확인은 데스크톱 앱에서만 가능합니다.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Loading spinner */}
      {loading && authState !== "unauthenticated" && (
        <div className="absolute inset-0 flex items-center justify-center bg-panel-bg z-10">
          <div className="text-center">
            <div className="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <div className="text-xs text-gray-400">사용량 페이지 로딩 중...</div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && authState !== "unauthenticated" && (
        <div className="absolute inset-0 flex items-center justify-center bg-panel-bg z-10">
          <div className="text-center p-4">
            <div className="text-xs text-accent-red mb-2">{error}</div>
            <button
              onClick={reloadWebview}
              className="text-xs text-accent-blue hover:text-accent-blue/80 underline"
            >
              다시 시도
            </button>
          </div>
        </div>
      )}

      {/* Unauthenticated overlay */}
      {authState === "unauthenticated" && (
        <div className="absolute inset-0 flex items-center justify-center bg-panel-bg z-20">
          <div className="text-center p-6 max-w-sm">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-accent-blue/10 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-accent-blue"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-gray-200 mb-2">
              Claude 로그인 필요
            </h3>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              사용량 정보를 확인하려면 claude.ai에 로그인해야 합니다.
              <br />
              아래 버튼을 클릭하면 로그인 창이 열립니다.
            </p>
            <button
              onClick={handleLogin}
              className="px-4 py-2 text-xs font-medium bg-accent-blue text-white rounded-md hover:bg-accent-blue/80 transition-colors"
            >
              claude.ai 로그인
            </button>
            {error && (
              <div className="mt-3 text-xs text-accent-red">{error}</div>
            )}
          </div>
        </div>
      )}

      {/* Logging in overlay */}
      {authState === "logging_in" && (
        <div className="absolute inset-0 flex items-center justify-center bg-panel-bg z-20">
          <div className="text-center p-6">
            <div className="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-gray-400 mb-1">
              로그인 창에서 로그인을 완료해주세요...
            </p>
            <p className="text-[10px] text-gray-600">
              로그인이 완료되면 자동으로 닫힙니다
            </p>
          </div>
        </div>
      )}

      {/* Authenticated toolbar */}
      {authState === "authenticated" && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-panel-header border-b border-panel-border flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent-green flex-shrink-0" />
            <span className="text-[10px] text-gray-500">claude.ai 연결됨</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reloadWebview}
              className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              새로고침
            </button>
            <button
              onClick={handleLogout}
              className="text-[10px] text-gray-500 hover:text-accent-red transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      )}

      {/* Electron webview */}
      <webview
        ref={webviewRef}
        src="https://claude.ai/settings/usage"
        style={{ flex: 1, width: "100%", height: "100%" }}
        partition="persist:claude-auth"
      />
    </div>
  );
}
