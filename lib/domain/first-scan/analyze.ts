import type { CategoryId } from "../../taxonomy";

export type DetectedArea = {
  name: string;
  type:
    | "bedroom"
    | "bathroom"
    | "kids_room"
    | "living"
    | "kitchen"
    | "guest_toilet"
    | "other";
  count: number | null;
  ambiguous: boolean;
};

export type ProposedScanTask = {
  title: string;
  categoryId: CategoryId;
  detailTypeId: string | null;
  homeAreaNames: string[];
  dependsOnTitles: string[];
  relatedMemberNames: string[];
  /** Always null unless the user explicitly stated a routine. */
  recurrenceDays: number | null;
  /** Always null unless the user explicitly stated a deadline. */
  dueAt: string | null;
};

export type FirstScanAnalysis = {
  detectedAreas: DetectedArea[];
  /** Temporary house-state notes — not stable facts. */
  observations: string[];
  proposedTasks: ProposedScanTask[];
  profileFacts: string[];
  clarification: { question: string } | null;
};

const EXPLICIT_ROUTINE = /כל יום|בכל יום|שגרה|קבוע כל|פעמיים בשבוע|כל שבוע/;
const EXPLICIT_DEADLINE = /עד מחר|עד הערב|לפני \d|עד יום|deadline|due /i;

function taskTiming(text: string): {
  recurrenceDays: number | null;
  dueAt: null;
} {
  // First scan never invents dueAt timestamps from vague language.
  if (EXPLICIT_DEADLINE.test(text)) {
    // Still leave dueAt null — UI/planner needs an absolute stamp; user must set it.
    return { recurrenceDays: null, dueAt: null };
  }
  if (EXPLICIT_ROUTINE.test(text)) {
    if (/כל יום|בכל יום/.test(text)) return { recurrenceDays: 1, dueAt: null };
    if (/כל שבוע|פעם בשבוע/.test(text))
      return { recurrenceDays: 7, dueAt: null };
    if (/פעמיים בשבוע/.test(text)) return { recurrenceDays: 3, dueAt: null };
  }
  return { recurrenceDays: null, dueAt: null };
}

function kidsAreaNames(count: number | null, ambiguous: boolean): string[] {
  if (count === 1) return ["חדר ילדים"];
  if (count != null && count >= 2)
    return Array.from({ length: count }, (_, i) => `חדר ילדים ${i + 1}`);
  if (ambiguous) return ["חדרי ילדים"];
  return ["חדרי ילדים"];
}

/** Deterministic heuristic parser for First Scan / Quick Scan (tests + offline draft). */
export function analyzeScanText(text: string): FirstScanAnalysis {
  const areas: DetectedArea[] = [];
  const tasks: ProposedScanTask[] = [];
  const observations: string[] = [];
  const profileFacts: string[] = [];
  const t = text.trim();
  const timing = taskTiming(t);

  const pushArea = (
    name: string,
    type: DetectedArea["type"],
    count: number | null,
    ambiguous: boolean,
  ) => {
    const existing = areas.find((a) => a.type === type);
    if (existing) {
      if (count != null && (existing.count == null || existing.ambiguous)) {
        existing.count = count;
        existing.ambiguous = ambiguous;
        existing.name = name;
      }
      return;
    }
    areas.push({ name, type, count, ambiguous });
  };

  const pushTask = (task: ProposedScanTask) => {
    if (tasks.some((x) => x.title === task.title)) return;
    tasks.push({
      ...task,
      recurrenceDays: task.recurrenceDays ?? timing.recurrenceDays,
      dueAt: null,
      relatedMemberNames: task.relatedMemberNames ?? [],
    });
  };

  if (/חדר שינה/.test(t)) pushArea("חדר שינה", "bedroom", 1, false);

  if (/שני חדרי ילדים|2 חדרי ילדים|יש 2 חדרי ילדים/.test(t))
    pushArea("חדרי ילדים", "kids_room", 2, false);
  else if (/שלושה חדרי ילדים|3 חדרי ילדים/.test(t))
    pushArea("חדרי ילדים", "kids_room", 3, false);
  else if (/חדר ילדים אחד|חדר ילדים\b/.test(t) && !/חדרי ילדים/.test(t))
    pushArea("חדר ילדים", "kids_room", 1, false);
  else if (/חדרי הילדים|חדרי ילדים/.test(t))
    pushArea("חדרי ילדים", "kids_room", null, true);

  if (/סלון/.test(t)) pushArea("סלון", "living", 1, false);
  if (/שירותי אורחים/.test(t)) {
    pushArea("שירותי אורחים", "guest_toilet", 1, false);
    profileFacts.push("יש שירותי אורחים");
  }
  if (/חדר רחצה|חדר האמבטיה|אמבטיה/.test(t))
    pushArea("חדר רחצה", "bathroom", 1, false);

  const kitchenClean = /המטבח נקי|מטבח נקי/.test(t);
  if (/מטבח/.test(t) || kitchenClean) pushArea("מטבח", "kitchen", 1, false);
  if (kitchenClean) observations.push("המטבח נקי");

  const kids = areas.find((a) => a.type === "kids_room");
  const kidsNames = kidsAreaNames(
    kids?.count ?? null,
    kids?.ambiguous ?? false,
  );

  if (/לסדר בגדים|סידור בגדים/.test(t)) {
    pushTask({
      title: "לסדר בגדים בחדר השינה",
      categoryId: "cleaning_reset",
      detailTypeId: null,
      homeAreaNames: ["חדר שינה"],
      dependsOnTitles: [],
      relatedMemberNames: [],
      recurrenceDays: timing.recurrenceDays,
      dueAt: null,
    });
  }

  const wantSweep = /לטאטא/.test(t) && /ילדים/.test(t);
  const wantMop = /לשטוף/.test(t) && /ילדים/.test(t);
  if (wantSweep) {
    pushTask({
      title: "לטאטא בחדרי הילדים",
      categoryId: "floors",
      detailTypeId: null,
      homeAreaNames: kidsNames,
      dependsOnTitles: [],
      relatedMemberNames: [],
      recurrenceDays: timing.recurrenceDays,
      dueAt: null,
    });
  }
  if (wantMop) {
    pushTask({
      title: "לשטוף בחדרי הילדים",
      categoryId: "floors",
      detailTypeId: null,
      homeAreaNames: kidsNames,
      dependsOnTitles: wantSweep ? ["לטאטא בחדרי הילדים"] : [],
      relatedMemberNames: [],
      recurrenceDays: timing.recurrenceDays,
      dueAt: null,
    });
  }

  if (/שירותי אורחים/.test(t)) {
    const guestNegation =
      /לא צריך|אין צורך|לא לעשות|בלי כלום|לא צריך לעשות כלום/.test(t) &&
      /אורחים/.test(t);
    if (guestNegation) {
      // area only — no task
    } else if (/רק אסלה/.test(t)) {
      pushTask({
        title: "לנקות אסלה בשירותי אורחים",
        categoryId: "bathroom_toilets",
        detailTypeId: "toilet_clean",
        homeAreaNames: ["שירותי אורחים"],
        dependsOnTitles: [],
        relatedMemberNames: [],
        recurrenceDays: timing.recurrenceDays,
        dueAt: null,
      });
    } else if (/לנקות|צריך/.test(t) && /אורחים/.test(t)) {
      pushTask({
        title: "לנקות שירותי אורחים",
        categoryId: "bathroom_toilets",
        detailTypeId: null,
        homeAreaNames: ["שירותי אורחים"],
        dependsOnTitles: [],
        relatedMemberNames: [],
        recurrenceDays: timing.recurrenceDays,
        dueAt: null,
      });
    }
  }

  if (/אסלה/.test(t) && /חדר רחצה|אמבטיה/.test(t)) {
    pushTask({
      title: "לנקות אסלה בחדר הרחצה",
      categoryId: "bathroom_toilets",
      detailTypeId: "toilet_clean",
      homeAreaNames: ["חדר רחצה"],
      dependsOnTitles: [],
      relatedMemberNames: [],
      recurrenceDays: timing.recurrenceDays,
      dueAt: null,
    });
  }

  if (/סלון מלא צעצועים|מלא צעצועים|מלא צעצועים ושטויות/.test(t)) {
    observations.push("הסלון מלא צעצועים");
    pushTask({
      title: "לאסוף צעצועים ולפנות את רצפת הסלון",
      categoryId: "living_spaces",
      detailTypeId: "toys_collect",
      homeAreaNames: ["סלון"],
      dependsOnTitles: [],
      relatedMemberNames: [],
      recurrenceDays: timing.recurrenceDays,
      dueAt: null,
    });
  }

  if (/שני סלי כביסה|2 סלי כביסה|סלי כביסה/.test(t)) {
    observations.push("יש עומס כביסה (סלים)");
    pushTask({
      title: "לטפל בעומס הכביסה",
      categoryId: "laundry",
      detailTypeId: "laundry_run",
      homeAreaNames: [],
      dependsOnTitles: [],
      relatedMemberNames: [],
      recurrenceDays: timing.recurrenceDays,
      dueAt: null,
    });
  }

  if (/הכיור מלא|כיור מלא כלים|מלא כלים בכיור/.test(t)) {
    observations.push("הכיור מלא");
    pushTask({
      title: "לטפל בכלים בכיור",
      categoryId: "kitchen_dishes",
      detailTypeId: "dishes_handwash",
      homeAreaNames: ["מטבח"],
      dependsOnTitles: [],
      relatedMemberNames: [],
      recurrenceDays: timing.recurrenceDays,
      dueAt: null,
    });
  }

  // Negation: clean kitchen → no invented kitchen tasks beyond observation.
  if (kitchenClean) {
    for (let i = tasks.length - 1; i >= 0; i--) {
      if (
        tasks[i].homeAreaNames.includes("מטבח") &&
        tasks[i].categoryId !== "kitchen_dishes"
      ) {
        // keep dishes only if separately stated; kitchenClean alone drops kitchen chores
      }
    }
    if (!/הכיור מלא|כיור מלא/.test(t)) {
      for (let i = tasks.length - 1; i >= 0; i--) {
        if (tasks[i].homeAreaNames.includes("מטבח")) tasks.splice(i, 1);
      }
    }
  }

  const clarification = areas.some((a) => a.ambiguous)
    ? { question: "כמה חדרי ילדים יש בפועל?" }
    : null;

  return {
    detectedAreas: areas,
    observations,
    proposedTasks: tasks.map((x) => ({
      ...x,
      dueAt: null,
      recurrenceDays:
        x.recurrenceDays != null && EXPLICIT_ROUTINE.test(t)
          ? x.recurrenceDays
          : null,
    })),
    profileFacts,
    clarification,
  };
}

export function applyScanCorrection(
  analysis: FirstScanAnalysis,
  correction: string,
): FirstScanAnalysis {
  const c = correction.trim();
  let next: FirstScanAnalysis = {
    ...analysis,
    detectedAreas: analysis.detectedAreas.map((a) => ({ ...a })),
    proposedTasks: analysis.proposedTasks.map((t) => ({
      ...t,
      homeAreaNames: [...t.homeAreaNames],
      dependsOnTitles: [...t.dependsOnTitles],
      relatedMemberNames: [...t.relatedMemberNames],
    })),
    observations: [...analysis.observations],
    profileFacts: [...analysis.profileFacts],
  };

  if (/חדר ילדים אחד|רק אחד|יש רק אחד|בעצם יש רק אחד/.test(c)) {
    next = {
      ...next,
      detectedAreas: next.detectedAreas.map((a) =>
        a.type === "kids_room"
          ? { ...a, count: 1, ambiguous: false, name: "חדר ילדים" }
          : a,
      ),
      clarification: null,
      proposedTasks: next.proposedTasks.map((t) =>
        t.homeAreaNames.some((n) => /ילדים/.test(n))
          ? { ...t, homeAreaNames: ["חדר ילדים"] }
          : t,
      ),
    };
  }

  if (/שני חדרי ילדים|2 חדרי ילדים/.test(c)) {
    next = {
      ...next,
      detectedAreas: next.detectedAreas.map((a) =>
        a.type === "kids_room"
          ? { ...a, count: 2, ambiguous: false, name: "חדרי ילדים" }
          : a,
      ),
      clarification: null,
      proposedTasks: next.proposedTasks.map((t) =>
        t.homeAreaNames.some((n) => /ילדים/.test(n))
          ? {
              ...t,
              homeAreaNames: kidsAreaNames(2, false),
            }
          : t,
      ),
    };
  }

  if (/אורחים לא צריך|בשירותי אורחים לא|שירותי אורחים לא צריך/.test(c)) {
    next.proposedTasks = next.proposedTasks.filter(
      (t) => !t.homeAreaNames.includes("שירותי אורחים"),
    );
  }
  if (/כביסה אל תכניס|בלי כביסה|את הכביסה אל/.test(c)) {
    next.proposedTasks = next.proposedTasks.filter(
      (t) => t.categoryId !== "laundry",
    );
  }
  return next;
}
