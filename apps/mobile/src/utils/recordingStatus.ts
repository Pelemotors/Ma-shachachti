export type RecordingStatus = "uploading" | "processing" | "ready" | "error";

export function recordingStatusLabel(status: RecordingStatus) {
  switch (status) {
    case "ready":
      return "Completed" as const;
    case "error":
      return "Needs Review" as const;
    case "uploading":
    case "processing":
      return "Processing" as const;
  }
}
