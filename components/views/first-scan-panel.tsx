"use client";
import { useRef, useState } from "react";
import type { Action, AppState } from "@/lib/model";
import type { FirstScanAnalysis } from "@/lib/domain/first-scan/analyze";
import { buildScanApproveActions } from "@/lib/domain/first-scan/approve";
import { DurationWheel, durationToMinutes } from "@/components/duration-wheel";
import {
  activeDailyPlan,
  buildDailyPlanSession,
  replanDailyPlan,
} from "@/lib/engine";
import { VoiceRecorder } from "@/components/voice-recorder";
import { messageForCode } from "@/lib/errors";

const SCAN_ANALYSIS_FAIL_HE = messageForCode("scan_analysis_failed");

/** Server semantic scan only — fail closed when agent unavailable. */
async function analyzeScanPreferSemantic(
  text: string,
  opts?: { aiConsent?: boolean },
): Promise<FirstScanAnalysis> {
  const { supabase, authFetch } = await import("@/lib/supabase-browser");
  if (!supabase) {
    const err = new Error(messageForCode("ai_not_configured")) as Error & {
      code?: string;
    };
    err.code = "ai_not_configured";
    throw err;
  }
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) {
    const err = new Error(messageForCode("ai_not_configured")) as Error & {
      code?: string;
    };
    err.code = "ai_not_configured";
    throw err;
  }
  if (opts?.aiConsent === false) {
    const err = new Error(messageForCode("ai_consent_required")) as Error & {
      code?: string;
    };
    err.code = "ai_consent_required";
    throw err;
  }
  try {
    const res = await authFetch("/api/first-scan/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        analysis?: FirstScanAnalysis;
      };
      if (data.analysis) return data.analysis;
    }
    const data = (await res.json().catch(() => ({}))) as {
      code?: string;
      error?: string;
    };
    if (data.code === "ai_consent_required") {
      const err = new Error(
        data.error || messageForCode("ai_consent_required"),
      ) as Error & { code?: string };
      err.code = "ai_consent_required";
      throw err;
    }
    const err = new Error(SCAN_ANALYSIS_FAIL_HE) as Error & { code?: string };
    err.code = "scan_analysis_failed";
    throw err;
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      ((e as { code?: string }).code === "ai_consent_required" ||
        (e as { code?: string }).code === "scan_analysis_failed")
    )
      throw e;
    const err = new Error(SCAN_ANALYSIS_FAIL_HE) as Error & { code?: string };
    err.code = "scan_analysis_failed";
    throw err;
  }
}

export function FirstScanPanel(props: {
  state: AppState;
  busy: boolean;
  revision: number;
  clock: Date;
  act: (a: Action) => Promise<void>;
  run: (actions: Action[], confirmed?: boolean) => Promise<void>;
  onOpenSettings?: () => void;
}) {
  const session = props.state.firstScan.session;
  const [draft, setDraft] = useState("");
  const [correction, setCorrection] = useState("");
  const [phase, setPhase] = useState<"capture" | "review" | "plan">(() => {
    if (session?.status === "review" || session?.status === "approved")
      return session.status === "approved" ? "plan" : "review";
    return "capture";
  });
  const [analysis, setAnalysis] = useState<FirstScanAnalysis | null>(
    (session?.draftAnalysis as FirstScanAnalysis | null) ?? null,
  );
  const defaultEffort =
    (props.state.planning.today?.effort as 1 | 2 | 3 | null) ?? 2;
  const [hours, setHours] = useState(1);
  const [minsPart, setMinsPart] = useState(0);
  const [effort, setEffort] = useState<1 | 2 | 3>(defaultEffort);
  const [analysisError, setAnalysisError] = useState("");
  const [localError, setLocalError] = useState("");
  const [planConfirm, setPlanConfirm] = useState(false);
  const [planSummary, setPlanSummary] = useState<{
    fitted: number;
    remaining: number;
  } | null>(null);
  const approveLock = useRef(false);
  const proposalIdRef = useRef<string | null>(session?.proposalId ?? null);

  if (props.state.firstScan.status !== "in_progress" || !session) return null;

  async function persistChunks(extra?: {
    text: string;
    source: "text" | "voice";
  }) {
    if (!session) return session;
    const stamp = new Date().toISOString();
    const chunks = extra?.text.trim()
      ? [
          ...session.chunks,
          {
            id: crypto.randomUUID(),
            text: extra.text.trim(),
            createdAt: stamp,
            source: extra.source,
          },
        ]
      : session.chunks;
    const next = {
      ...session,
      chunks,
      updatedAt: stamp,
      status: "in_progress" as const,
    };
    await props.act({
      type: "scan.set",
      firstScan: { status: "in_progress", session: next },
    });
    return next;
  }

  async function addChunk() {
    if (!draft.trim() || !session) return;
    setLocalError("");
    await persistChunks({ text: draft, source: "text" });
    setDraft("");
  }

  async function addVoiceChunk(text: string) {
    if (!text.trim() || !session) return;
    setLocalError("");
    if (props.state.profile.aiConsent === false) {
      setLocalError("כדי לשלוח תמלול סקירה לניתוח חכם צריך לאשר עזרה אישית.");
      props.onOpenSettings?.();
      return;
    }
    await persistChunks({ text, source: "voice" });
  }

  async function finishCapture() {
    if (!session) return;
    setAnalysisError("");
    setLocalError("");
    try {
      // P55: draft chunks saved before analysis — no real tasks yet (P17).
      let current = session;
      if (draft.trim()) {
        current =
          (await persistChunks({ text: draft, source: "text" })) ?? session;
        setDraft("");
      }
      const text = current.chunks.map((c) => c.text).join("\n");
      if (!text.trim()) {
        setLocalError("צריך לפחות חלק אחד לסקירה — אפשר להקליד או להקליט.");
        return;
      }

      let a: FirstScanAnalysis;
      try {
        a = await analyzeScanPreferSemantic(text, {
          aiConsent: props.state.profile.aiConsent,
        });
      } catch (e) {
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code?: string }).code ?? "")
            : "";
        setAnalysisError(
          code === "ai_consent_required"
            ? messageForCode("ai_consent_required")
            : SCAN_ANALYSIS_FAIL_HE,
        );
        return;
      }

      const stamp = new Date().toISOString();
      await props.act({
        type: "scan.set",
        firstScan: {
          status: "in_progress",
          session: {
            ...current,
            status: "review",
            draftAnalysis: a,
            updatedAt: stamp,
          },
        },
      });
      setAnalysis(a);
      setPhase("review");
    } catch {
      setAnalysisError(SCAN_ANALYSIS_FAIL_HE);
    }
  }

  async function retryAnalysis() {
    if (!session) return;
    setAnalysisError("");
    try {
      const text = session.chunks.map((c) => c.text).join("\n");
      if (!text.trim()) {
        setLocalError("אין חלקים שמורים לניתוח מחדש.");
        return;
      }
      const a = await analyzeScanPreferSemantic(text, {
        aiConsent: props.state.profile.aiConsent,
      });
      const stamp = new Date().toISOString();
      await props.act({
        type: "scan.set",
        firstScan: {
          status: "in_progress",
          session: {
            ...session,
            status: "review",
            draftAnalysis: a,
            updatedAt: stamp,
          },
        },
      });
      setAnalysis(a);
      setPhase("review");
    } catch (e) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code?: string }).code ?? "")
          : "";
      setAnalysisError(
        code === "ai_consent_required"
          ? messageForCode("ai_consent_required")
          : SCAN_ANALYSIS_FAIL_HE,
      );
    }
  }

  async function applyFix() {
    if (!session || !correction.trim()) return;
    setAnalysisError("");
    const base = session.chunks.map((c) => c.text).join("\n");
    const text = `${base}\n\nתיקון מהמשתמש: ${correction.trim()}`;
    try {
      const a = await analyzeScanPreferSemantic(text, {
        aiConsent: props.state.profile.aiConsent,
      });
      setAnalysis(a);
      setCorrection("");
    } catch (e) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code?: string }).code ?? "")
          : "";
      setAnalysisError(
        code === "ai_consent_required"
          ? messageForCode("ai_consent_required")
          : SCAN_ANALYSIS_FAIL_HE,
      );
    }
  }

  async function returnToCapture() {
    if (!session) return;
    const stamp = new Date().toISOString();
    await props.act({
      type: "scan.set",
      firstScan: {
        status: "in_progress",
        session: {
          ...session,
          status: "in_progress",
          updatedAt: stamp,
        },
      },
    });
    setPhase("capture");
    setLocalError("");
  }

  /** After approval: new UUID session for additional capture; existing tasks stay. */
  async function startAddMissingSession() {
    const stamp = new Date().toISOString();
    const sessionId = crypto.randomUUID();
    proposalIdRef.current = null;
    setAnalysis(null);
    setCorrection("");
    await props.act({
      type: "scan.set",
      firstScan: {
        status: "in_progress",
        completedAt: props.state.firstScan.completedAt ?? null,
        session: {
          id: sessionId,
          status: "in_progress",
          chunks: [],
          draftAnalysis: null,
          proposalId: null,
          createdAt: stamp,
          updatedAt: stamp,
        },
      },
    });
    setPhase("capture");
  }

  async function approve() {
    if (!analysis || !session || approveLock.current) return;
    approveLock.current = true;
    try {
      const proposalId =
        proposalIdRef.current ?? session.proposalId ?? crypto.randomUUID();
      proposalIdRef.current = proposalId;
      const turnId = crypto.randomUUID();
      const { actions, alreadyApplied } = buildScanApproveActions(
        props.state,
        analysis,
        {
          scanSessionId: session.id,
          proposalId,
          turnId,
        },
      );
      if (!alreadyApplied && actions.length) {
        await props.run(actions, true);
      }
      setPhase("plan");
    } finally {
      approveLock.current = false;
    }
  }

  async function markScanCompleted() {
    const current = props.state.firstScan.session ?? session;
    if (!current) return;
    const stamp = new Date().toISOString();
    await props.act({
      type: "scan.set",
      firstScan: {
        status: "completed",
        completedAt: stamp,
        session: {
          ...current,
          status: "completed",
          draftAnalysis: analysis ?? current.draftAnalysis,
          proposalId: proposalIdRef.current ?? current.proposalId ?? null,
          updatedAt: stamp,
        },
      },
    });
  }

  async function buildReset(force = false) {
    const available = durationToMinutes(hours, minsPart) || 60;
    const existing = activeDailyPlan(props.state, props.clock);
    if (existing && !force && !planConfirm) {
      const preview = replanDailyPlan(props.state, props.clock);
      if (preview.requiresProposal || preview.shiftedTaskIds.length > 0) {
        setPlanConfirm(true);
        setLocalError(
          "מצאתי עוד כמה דברים. כדי להכניס אותם אצטרך להזיז חלק מהתוכנית. לעדכן?",
        );
        return;
      }
    }

    if (existing && (force || planConfirm)) {
      const result = replanDailyPlan(props.state, props.clock);
      if (result.plan) {
        await props.run([{ type: "plan.set", plan: result.plan }], true);
        setPlanSummary({
          fitted: result.plan.items.length,
          remaining: Math.max(
            0,
            props.state.tasks.filter((t) => t.status === "open").length -
              result.plan.items.length,
          ),
        });
        setPlanConfirm(false);
        setLocalError("");
        await markScanCompleted();
        return;
      }
    }

    const sessionPlan = buildDailyPlanSession(
      props.state,
      available,
      effort,
      props.revision,
      props.clock,
    );
    await props.run([{ type: "plan.set", plan: sessionPlan }], true);
    const openCount = props.state.tasks.filter(
      (t) => t.status === "open",
    ).length;
    setPlanSummary({
      fitted: sessionPlan.items.length,
      remaining: Math.max(0, openCount - sessionPlan.items.length),
    });
    setPlanConfirm(false);
    setLocalError("");
    await markScanCompleted();
  }

  async function saveTasksOnly() {
    setLocalError("");
    await markScanCompleted();
  }

  return (
    <section className="panel stack">
      <h3>
        {props.state.firstScan.completedAt
          ? "סקירה מהירה של הבית"
          : "סקירה ראשונה של הבית"}
      </h3>
      {phase === "capture" && (
        <>
          <p className="muted">
            אפשר להוסיף כמה חלקים בקול או בכתיבה לפני סיום הסקירה.
          </p>
          {session.chunks.map((c) => (
            <p key={c.id} className="muted">
              {c.source === "voice" ? <span className="tag">קול</span> : null}{" "}
              {c.text}
            </p>
          ))}
          {props.state.profile.aiConsent === false && (
            <div className="consent-banner" role="status">
              <p>
                תמלול קולי לסקירה דורש אישור לעזרה אישית. בלי זה אפשר להקליד
                חלקים ידנית.
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => props.onOpenSettings?.()}
              >
                לפתיחת ההגדרות
              </button>
            </div>
          )}
          <VoiceRecorder
            variant="panel"
            enabled={true}
            aiConsent={props.state.profile.aiConsent}
            ariaLabel="הקלטת חלק לסקירה"
            onNeedConsent={() => props.onOpenSettings?.()}
            onText={(text) => void addVoiceChunk(text)}
            onError={setLocalError}
            disabledHint="אפשר להקליד כאן גם בלי מיקרופון."
          />
          <textarea
            aria-label="תיאור מה שרואים בבית"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="מה את רואה ומה צריך לעשות…"
          />
          {(localError || analysisError) && (
            <p className="error-inline" role="alert">
              {localError || analysisError}
            </p>
          )}
          {analysisError && (
            <button
              type="button"
              className="secondary"
              disabled={props.busy}
              onClick={() => void retryAnalysis()}
            >
              נסיון ניתוח מחדש
            </button>
          )}
          <div className="button-row">
            <button
              className="secondary"
              disabled={props.busy}
              onClick={() => void addChunk()}
            >
              הוספת חלק
            </button>
            <button
              className="primary"
              disabled={props.busy}
              onClick={() => void finishCapture()}
            >
              סיימתי את הסקירה
            </button>
          </div>
        </>
      )}
      {phase === "review" && analysis && (
        <>
          <h4>הבנתי שיש בבית</h4>
          <ul>
            {analysis.detectedAreas.map((a) => (
              <li key={a.name + a.type}>
                {a.name}
                {a.count != null
                  ? ` · ${a.count}`
                  : a.ambiguous
                    ? " · לא ברור כמה"
                    : ""}
              </li>
            ))}
          </ul>
          {analysis.observations.length > 0 && (
            <>
              <h4>מה קורה עכשיו</h4>
              <ul>
                {analysis.observations.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </>
          )}
          <h4>ומה שצריך כרגע</h4>
          <ul>
            {analysis.proposedTasks.map((t) => (
              <li key={t.title}>{t.title}</li>
            ))}
          </ul>
          {analysis.clarification && <p>{analysis.clarification.question}</p>}
          <label>
            צריך לתקן משהו?
            <input
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              aria-label="תיקון לטיוטת הסקירה"
            />
          </label>
          <div className="button-row">
            <button
              className="secondary"
              type="button"
              onClick={() => void returnToCapture()}
            >
              חזרה להוספת מידע
            </button>
            <button className="secondary" type="button" onClick={applyFix}>
              עדכון טיוטה
            </button>
            <button
              className="primary"
              type="button"
              disabled={props.busy}
              onClick={() => void approve()}
            >
              נכון, בוא נמשיך
            </button>
          </div>
        </>
      )}
      {phase === "plan" && (
        <>
          <p>כמה זמן וכוח יש לך עכשיו לאיפוס ראשוני?</p>
          <DurationWheel
            hours={hours}
            minutes={minsPart}
            label="זמן פנוי"
            onChange={({ hours: h, minutes: m }) => {
              setHours(h);
              setMinsPart(m);
            }}
          />
          <label>
            כוח
            <select
              value={effort}
              onChange={(e) => setEffort(+e.target.value as 1 | 2 | 3)}
              aria-label="רמת כוח לאיפוס"
            >
              <option value={1}>מעט</option>
              <option value={2}>בינוני</option>
              <option value={3}>הרבה</option>
            </select>
          </label>
          {localError && (
            <p className="error-inline" role="alert">
              {localError}
            </p>
          )}
          {planSummary && (
            <p className="muted" role="status">
              זה מה שנכנס לזמן שבחרת ({planSummary.fitted} משימות)
              {planSummary.remaining > 0
                ? ` · יישאר לאחר כך: ${planSummary.remaining}`
                : ""}
            </p>
          )}
          <div className="button-row">
            <button
              className="primary"
              type="button"
              disabled={props.busy}
              onClick={() => void buildReset(planConfirm)}
            >
              {planConfirm ? "כן, לעדכן את התוכנית" : "בנה תוכנית איפוס"}
            </button>
            {planConfirm && (
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setPlanConfirm(false);
                  setLocalError("");
                }}
              >
                לא עכשיו
              </button>
            )}
            <button
              className="text-button"
              type="button"
              disabled={props.busy}
              onClick={() => void saveTasksOnly()}
            >
              שמור לי את המשימות בלבד
            </button>
            <button
              className="secondary"
              type="button"
              disabled={props.busy}
              onClick={() => void startAddMissingSession()}
            >
              להוסיף משהו ששכחתי
            </button>
          </div>
        </>
      )}
    </section>
  );
}
