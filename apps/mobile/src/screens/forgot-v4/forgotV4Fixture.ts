/**
 * Dev-only Forgot V4 visual fixture. Never persisted, never sent to an API.
 * Matches forgot-390x844.png copy for Pixel QA only.
 */
export const FORGOT_V4_VISUAL_QA = false;

export const forgotV4Fixture = {
  subtitle: "דברים שקל לשכוח מול העיניים",
  sections: [
    {
      id: "today" as const,
      title: "היום",
      items: [
        {
          id: "qa-today-1",
          title: "להוריד לפסטיגל",
          subtitle: "לא לשכוח לפני היציאה",
          bucket: "today" as const,
          icon: "document" as const,
        },
        {
          id: "qa-today-2",
          title: "לקנות מצרכים",
          subtitle: "רק חלב וגבינה",
          bucket: "today" as const,
          icon: "cart" as const,
        },
      ],
    },
    {
      id: "week" as const,
      title: "השבוע",
      items: [
        {
          id: "qa-week-1",
          title: "לקבוע תור לרופא ילדים",
          subtitle: null,
          bucket: "week" as const,
          icon: "doctor" as const,
        },
        {
          id: "qa-week-2",
          title: "להתקשר לסבתא",
          subtitle: "המנורה בסלון לא עובדת",
          bucket: "week" as const,
          icon: "phone" as const,
        },
      ],
    },
    {
      id: "later" as const,
      title: "בהמשך",
      items: [
        {
          id: "qa-later-1",
          title: "לתאם מסיבת יום הולדת למשפחת זלמנוביץ",
          subtitle: null,
          bucket: "later" as const,
          icon: "cake" as const,
        },
        {
          id: "qa-later-2",
          title: "טיסה לאילת",
          subtitle: null,
          bucket: "later" as const,
          icon: "airplane" as const,
        },
        {
          id: "qa-later-3",
          title: "לקנות בגדים לחורף",
          subtitle: null,
          bucket: "later" as const,
          icon: "shirt" as const,
        },
      ],
    },
  ],
};
