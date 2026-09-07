/** OpenAI Responses client helpers used by orchestration. */
export type OpenAIResponse = {
  status?: string;
  output?: { content?: { type: string; text?: string }[] }[];
};

export function outputText(data: OpenAIResponse) {
  return (data.output ?? [])
    .flatMap((x) => x.content ?? [])
    .filter((x) => x.type === "output_text")
    .map((x) => x.text ?? "")
    .join("")
    .trim();
}
