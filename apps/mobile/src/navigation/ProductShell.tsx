import { useCallback, useEffect, useState } from "react";
import { BackHandler, Dimensions, View } from "react-native";
import { TabShell, type ProductTab } from "../components/ui";
import { markNotificationOpened } from "../api/notifications";
import { BankScreen } from "../screens/BankScreen";
import { CalendarScreen } from "../screens/CalendarScreen";
import { ChatV4Screen } from "../screens/chat-v4/ChatV4Screen";
import { CHAT } from "../screens/chat-v4/chatV4Theme";
import { ChecklistDetailScreen } from "../screens/ChecklistDetailScreen";
import { ChecklistsScreen } from "../screens/ChecklistsScreen";
import { ForgotV4Screen } from "../screens/forgot-v4/ForgotV4Screen";
import { FreeTimeResultsScreen } from "../screens/FreeTimeResultsScreen";
import { PlanComposerScreen } from "../screens/PlanComposerScreen";
import { PrivacySettingsScreen } from "../screens/PrivacySettingsScreen";
import { HomeNotificationsSheet } from "../screens/home-v4/HomeNotificationsSheet";
import { HomeV4Screen } from "../screens/home-v4/HomeV4Screen";
import { useHomeV4Data } from "../screens/home-v4/useHomeV4Data";
import { ScheduleScreen } from "../screens/ScheduleScreen";
import { ShoppingScreen } from "../screens/ShoppingScreen";
import { TasksScreen } from "../screens/TasksScreen";
import { HouseholdScreen } from "../screens/HouseholdScreen";
import { HelpSettingsScreen } from "../screens/settings/HelpSettingsScreen";
import { SettingsHubScreen } from "../screens/settings/SettingsHubScreen";
import { V4 } from "../screens/home-v4/homeV4Theme";
import { FREETIME_DEFAULT_MINUTES, resolveFreetimeMinutes } from "../product/surfaceCommit";

type Overlay =
  | "forgot"
  | "plan"
  | "freetime"
  | "freetimeResults"
  | "schedule"
  | "checklists"
  | "checklist"
  | "bank"
  | "privacy"
  | "calendar"
  | "notifications"
  | "settings"
  | "profile"
  | "notificationSettings"
  | "household"
  | "help"
  | null;

function NotificationsOverlay({ onBack }: { onBack: () => void }) {
  const data = useHomeV4Data();
  return (
    <HomeNotificationsSheet
      items={data.notifications}
      onClose={onBack}
      onOpen={(id) => {
        void markNotificationOpened(id).then(() => data.reload());
      }}
    />
  );
}

export function ProductShell() {
  const [tab, setTab] = useState<ProductTab>("home");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [fromSettings, setFromSettings] = useState(false);
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [checklistOccurrence, setChecklistOccurrence] = useState<string | undefined>(undefined);
  const [checklistReturnTo, setChecklistReturnTo] = useState<"tasks" | "checklists">("checklists");
  const [freetimeMinutes, setFreetimeMinutes] = useState(FREETIME_DEFAULT_MINUTES);
  const width = Dimensions.get("window").width;

  const backFromSettingsChild = useCallback(() => {
    if (fromSettings) {
      setFromSettings(false);
      setOverlay("settings");
      return;
    }
    setOverlay(null);
    setTab("home");
  }, [fromSettings]);

  const closeSettingsToHome = useCallback(() => {
    setFromSettings(false);
    setOverlay(null);
    setTab("home");
  }, []);

  useEffect(() => {
    if (!overlay) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (overlay === "checklist") {
        setOverlay("checklists");
        return true;
      }
      if (fromSettings && overlay !== "settings") {
        setFromSettings(false);
        setOverlay("settings");
        return true;
      }
      setOverlay(null);
      return true;
    });
    return () => sub.remove();
  }, [overlay, fromSettings]);

  function openFromSettings(screen: string) {
    const map: Record<string, Overlay> = {
      profile: "profile",
      notifications: "notificationSettings",
      calendar: "calendar",
      household: "household",
      privacy: "privacy",
      help: "help",
    };
    const next = map[screen];
    if (!next) return;
    setFromSettings(true);
    setOverlay(next);
  }

  function open(screen: string) {
    if (screen === "chat" || screen === "tasks" || screen === "shopping" || screen === "home") {
      setOverlay(null);
      setFromSettings(false);
      setTab(screen);
      return;
    }
    if (screen === "lists") {
      setOverlay(null);
      setFromSettings(false);
      setTab("shopping");
      return;
    }
    if (screen === "freetime") {
      setFreetimeMinutes(FREETIME_DEFAULT_MINUTES);
    }
    // Chat legacy onAvatar("privacy") → Settings hub entry.
    if (screen === "privacy") {
      setFromSettings(false);
      setOverlay("settings");
      return;
    }
    if (screen === "settings") {
      setFromSettings(false);
    }
    setOverlay(screen as Overlay);
  }

  if (overlay === "settings") {
    return (
      <SettingsHubScreen
        onBack={closeSettingsToHome}
        onOpen={openFromSettings}
      />
    );
  }
  if (overlay === "profile") {
    const { ProfileSettingsScreen } =
      require("../screens/settings/ProfileSettingsScreen") as typeof import("../screens/settings/ProfileSettingsScreen");
    return <ProfileSettingsScreen onBack={backFromSettingsChild} />;
  }
  if (overlay === "notificationSettings") {
    const { NotificationSettingsScreen } =
      require("../screens/NotificationSettingsScreen") as typeof import("../screens/NotificationSettingsScreen");
    return <NotificationSettingsScreen onBack={backFromSettingsChild} />;
  }
  if (overlay === "household") {
    return <HouseholdScreen onBack={backFromSettingsChild} />;
  }
  if (overlay === "help") {
    return <HelpSettingsScreen onBack={backFromSettingsChild} />;
  }
  if (overlay === "privacy") {
    return (
      <PrivacySettingsScreen
        onBack={() => {
          // Never trap on Privacy: hub if opened from Settings, else Home.
          if (fromSettings) {
            setFromSettings(false);
            setOverlay("settings");
            return;
          }
          setOverlay(null);
          setTab("home");
        }}
      />
    );
  }
  if (overlay === "calendar") {
    return <CalendarScreen onBack={backFromSettingsChild} />;
  }
  if (overlay === "bank") {
    return <BankScreen onBack={() => setOverlay(null)} />;
  }
  if (overlay === "forgot") {
    return (
      <View style={{ flex: 1, backgroundColor: V4.page }}>
        <ForgotV4Screen
          width={width}
          onOpen={open}
          onTab={(next) => {
            setOverlay(null);
            setTab(next);
          }}
        />
      </View>
    );
  }
  if (overlay === "notifications") {
    return <NotificationsOverlay onBack={() => setOverlay(null)} />;
  }
  if (overlay === "plan") {
    return (
      <PlanComposerScreen
        mode="plan"
        onBack={() => setOverlay(null)}
        // M5: stay on Create/Change Schedule after commit — no success overlay / Home jump.
        onDone={() => {}}
      />
    );
  }
  if (overlay === "freetime") {
    return (
      <PlanComposerScreen
        mode="freetime"
        onBack={() => setOverlay(null)}
        onDone={(payload) => {
          setFreetimeMinutes(resolveFreetimeMinutes(payload.minutes));
          setOverlay("freetimeResults");
        }}
      />
    );
  }
  if (overlay === "freetimeResults") {
    return (
      <FreeTimeResultsScreen
        minutes={freetimeMinutes}
        onBack={() => {
          // Close Free Time fully so Chat/tabs/Home are reachable (RF-08).
          setFreetimeMinutes(FREETIME_DEFAULT_MINUTES);
          setOverlay(null);
          setTab("home");
        }}
        onAdjust={() => {
          setOverlay("freetime");
        }}
      />
    );
  }
  if (overlay === "schedule") {
    return (
      <ScheduleScreen
        onBack={() => setOverlay(null)}
        onOpenCalendar={() => setOverlay("calendar")}
      />
    );
  }
  if (overlay === "checklists") {
    return (
      <ChecklistsScreen
        onBack={() => setOverlay(null)}
        onOpen={(id) => {
          setChecklistId(id);
          setChecklistOccurrence(undefined);
          setChecklistReturnTo("checklists");
          setOverlay("checklist");
        }}
      />
    );
  }
  if (overlay === "checklist" && checklistId) {
    return (
      <ChecklistDetailScreen
        listId={checklistId}
        occurrenceKey={checklistOccurrence}
        onBack={() => {
          if (checklistReturnTo === "tasks") {
            setOverlay(null);
            setTab("tasks");
            return;
          }
          setOverlay("checklists");
        }}
      />
    );
  }
  if (tab === "home" && !overlay) {
    return (
      <View style={{ flex: 1, backgroundColor: V4.page }}>
        <HomeV4Screen
          width={width}
          onOpen={open}
          onTab={(next) => {
            setOverlay(null);
            setTab(next);
          }}
        />
      </View>
    );
  }

  if (tab === "chat" && !overlay) {
    return (
      <View style={{ flex: 1, backgroundColor: CHAT.page }}>
        <ChatV4Screen
          width={width}
          onOpen={open}
          onTab={(next) => {
            setOverlay(null);
            setTab(next);
          }}
        />
      </View>
    );
  }

  const page = tab === "tasks" ? (
    <TasksScreen
      onOpenChecklist={(id, occurrenceKey) => {
        setChecklistId(id);
        setChecklistOccurrence(occurrenceKey);
        setChecklistReturnTo("tasks");
        setOverlay("checklist");
      }}
    />
  ) : <ShoppingScreen />;

  return (
    <TabShell
      active={tab}
      onChange={(next) => {
        setOverlay(null);
        setTab(next);
      }}
    >
      {page}
    </TabShell>
  );
}
