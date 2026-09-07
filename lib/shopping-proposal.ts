/** Apply partial shopping proposal approval from natural language. */
export function filterShoppingProposalItems(
  items: { title: string; quantity?: string }[],
  reply: string,
): { title: string; quantity?: string }[] {
  const text = reply.trim();
  if (/^לא(\s|$)|דחי/.test(text)) return [];
  if (/^(כן|בסדר|הוסיפ)/.test(text) && !/בלי|חוץ|רק/.test(text)) return items;
  const without = text.match(/בלי\s+(.+)$/);
  if (without) {
    const drop = without[1].split(/,| ו/).map((x) => x.trim());
    return items.filter(
      (i) => !drop.some((d) => i.title.includes(d) || d.includes(i.title)),
    );
  }
  const only = text.match(/רק\s+(.+)$/);
  if (only) {
    const keep = only[1].split(/,| ו/).map((x) => x.trim());
    return items.filter((i) =>
      keep.some((k) => i.title.includes(k) || k.includes(i.title)),
    );
  }
  return items;
}
