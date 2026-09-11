import { authorize, HttpError } from "@/lib/server-auth";
import {
  RECORDINGS_BUCKET,
  recordingId,
} from "@/lib/recordings";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: RouteContext<"/api/recordings/[id]/audio">,
) {
  try {
    const { db, userId } = await authorize(req);
    const { id: rawId } = await context.params;
    const id = recordingId(rawId);
    const { data: row, error } = await db
      .from("recordings")
      .select("storage_path")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new HttpError(503, "לא הצלחנו לטעון את ההקלטה.");
    if (!row) throw new HttpError(404, "ההקלטה לא נמצאה.");
    if (!row.storage_path) {
      throw new HttpError(410, "קובץ האודיו כבר נמחק.");
    }
    const { data, error: signedError } = await db.storage
      .from(RECORDINGS_BUCKET)
      .createSignedUrl(row.storage_path, 60);
    if (signedError || !data?.signedUrl) {
      throw new HttpError(503, "לא הצלחנו לפתוח את קובץ האודיו.");
    }
    return Response.json({ url: data.signedUrl, expires_in: 60 });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Recording signed URL failed");
    return Response.json(
      { error: "לא הצלחנו לפתוח את קובץ האודיו." },
      { status: 500 },
    );
  }
}
