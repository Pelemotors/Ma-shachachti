import { listShopping } from "../../api/shopping";
import { listTasks } from "../../api/tasks";
import { getDayPlan, todayJerusalemDate } from "../../api/planning";
import { syncProductClock } from "../../product/productClock";

export function replyClaimsDomainAction(reply: string) {
  return /שמרתי|הוספתי|עדכנתי|מחקתי|סימנתי|דחיתי|קבעתי|הסרתי|אזכיר/.test(reply);
}

export async function loadDomainSnapshot() {
  await syncProductClock();
  const [tasks, shopping, plan] = await Promise.allSettled([
    listTasks(),
    listShopping(),
    getDayPlan(todayJerusalemDate()),
  ]);
  return {
    taskSig:
      tasks.status === "fulfilled"
        ? tasks.value.tasks
            .map((row) => `${row.id}:${row.status}:${row.title}:${row.due_on ?? ""}`)
            .sort()
        : [],
    shoppingSig:
      shopping.status === "fulfilled"
        ? shopping.value.shopping
            .map((row) => `${row.id}:${row.purchased_at ?? ""}:${row.title}`)
            .sort()
        : [],
    planSig:
      plan.status === "fulfilled" && plan.value
        ? plan.value.items
            .map((item) => `${item.task_id}:${item.start_at}:${item.end_at ?? ""}`)
            .sort()
        : [],
  };
}

export function domainChanged(
  before: Awaited<ReturnType<typeof loadDomainSnapshot>>,
  after: Awaited<ReturnType<typeof loadDomainSnapshot>>,
) {
  return (
    before.taskSig.join() !== after.taskSig.join() ||
    before.shoppingSig.join() !== after.shoppingSig.join() ||
    before.planSig.join() !== after.planSig.join()
  );
}
