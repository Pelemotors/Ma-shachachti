import { adminDb, authorize, ApiError, fail, activity } from "@/lib/server";

const MAX = 8 * 1024 * 1024;
const MAX_MULTIPART = MAX + 256 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "video/mp4"];
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  let userId: string | null = null;
  try {
    const auth = await authorize(req);
    userId = auth.userId;

    const rawLength = req.headers.get("content-length");
    if (!rawLength)
      throw new ApiError(
        411,
        "לא ניתן לבדוק את גודל הדיווח. נסי לשלוח שוב.",
        "support_length_required",
      );
    const contentLength = Number(rawLength);
    if (!Number.isFinite(contentLength) || contentLength <= 0)
      throw new ApiError(400, "הדיווח אינו תקין.", "support_invalid_length");
    if (contentLength > MAX_MULTIPART)
      throw new ApiError(
        413,
        "הקובץ גדול מדי. אפשר עד 8MB.",
        "support_payload_too_large",
      );

    const db = adminDb();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await db
      .from("activity_events")
      .select("id", { head: true, count: "exact" })
      .eq("owner_id", userId)
      .eq("event_type", "support.report.attempt")
      .gte("created_at", since);
    if (countError)
      throw new ApiError(
        503,
        "שירות הדיווחים אינו זמין כרגע.",
        "support_rate_check_failed",
      );
    if ((count ?? 0) >= 5)
      throw new ApiError(
        429,
        "נשלחו כמה דיווחים בזמן קצר. אפשר לנסות שוב בעוד שעה.",
        "support_rate_limited",
      );
    await activity(userId, "support.report.attempt", { requestId });

    const key = process.env.RESEND_API_KEY,
      to = process.env.SUPPORT_REPORT_TO,
      from = process.env.SUPPORT_REPORT_FROM;
    if (!key || !to || !from)
      throw new ApiError(
        503,
        "שליחת דיווחים עדיין לא הופעלה.",
        "support_not_configured",
      );

    const form = await req.formData();
    const description = String(form.get("description") ?? "")
      .trim()
      .slice(0, 4000);
    const page = String(form.get("page") ?? "").slice(0, 1000);
    const ua = String(form.get("userAgent") ?? "").slice(0, 1000);
    const file = form.get("media");
    if (!description)
      throw new ApiError(
        400,
        "צריך לכתוב בקצרה מה קרה.",
        "support_description_required",
      );

    const attachments: Array<{
      filename: string;
      content: string;
      content_type: string;
    }> = [];
    if (file instanceof File && file.size) {
      if (file.size > MAX)
        throw new ApiError(
          413,
          "הקובץ גדול מדי. אפשר עד 8MB.",
          "support_file_too_large",
        );
      if (!ACCEPTED.includes(file.type))
        throw new ApiError(415, "סוג הקובץ אינו נתמך.", "support_file_type");
      attachments.push({
        filename: file.name || "report-media",
        content: Buffer.from(await file.arrayBuffer()).toString("base64"),
        content_type: file.type,
      });
    }

    const html = `<div dir="rtl" style="font-family:Arial"><h2>דיווח תקלה חדש — מה שכחתי?</h2><p><b>מה קרה:</b><br>${esc(description).replace(/\n/g, "<br>")}</p><hr><p><b>משתמש:</b> ${esc(userId)}</p><p><b>עמוד:</b> ${esc(page)}</p><p><b>מכשיר:</b> ${esc(ua)}</p><p><b>זמן:</b> ${new Date().toISOString()}</p><p><b>מזהה:</b> ${requestId}</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "דיווח תקלה חדש — מה שכחתי?",
        html,
        attachments,
      }),
    });
    if (!r.ok)
      throw new ApiError(
        502,
        "הדיווח לא נשלח. נסי שוב.",
        "support_delivery_failed",
      );

    await activity(userId, "support.report.success", {
      requestId,
      hasAttachment: attachments.length > 0,
    });
    return Response.json({ ok: true, requestId });
  } catch (e) {
    if (userId)
      await activity(userId, "support.report.failure", {
        requestId,
        code: e instanceof ApiError ? e.code : "internal_error",
      });
    return fail(e, requestId);
  }
}
