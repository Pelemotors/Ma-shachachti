import { useState } from "react";
import { View } from "react-native";
import { AppScreen, BottomNavBar, SuccessState, type ProductTab } from "../components/ui";
import { HOME_COLOR } from "../product/homeGeometry";
import { useAuth } from "../auth/AuthContext";
import { BankScreen } from "../screens/BankScreen";
import { CalendarScreen } from "../screens/CalendarScreen";
import { ChatScreen } from "../screens/ChatScreen";
import { ChecklistDetailScreen } from "../screens/ChecklistDetailScreen";
import { ChecklistsScreen } from "../screens/ChecklistsScreen";
import { ForgotScreen } from "../screens/ForgotScreen";
import { FreeTimeResultsScreen } from "../screens/FreeTimeResultsScreen";
import { PlanComposerScreen } from "../screens/PlanComposerScreen";
import { PrivacySettingsScreen } from "../screens/PrivacySettingsScreen";
import { ProductHomeScreen } from "../screens/ProductHomeScreen";
import { ScheduleScreen } from "../screens/ScheduleScreen";
import { ShoppingScreen } from "../screens/ShoppingScreen";
import { TasksScreen } from "../screens/TasksScreen";

type Overlay =
  | "forgot"
  | "plan"
  | "freetime"
  | "freetimeResults"
  | "schedule"
  | "checklists"
  | "checklist"
  | "planSuccess"
  | "bank"
  | "privacy"
  | "calendar"
  | null;

export function ProductShell() {
  const auth = useAuth();
  const [tab, setTab] = useState<ProductTab>("home");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [checklistId, setChecklistId] = useState<string | null>(null);

  function open(screen: string) {
    if (screen === "chat" || screen === "tasks" || screen === "shopping" || screen === "home") {
      setOverlay(null);
      setTab(screen);
      return;
    }
    if (screen === "lists") {
      setOverlay(null);
      setTab("shopping");
      return;
    }
    setOverlay(screen as Overlay);
  }

  if (overlay === "privacy") {
    return (
      <PrivacySettingsScreen
        onBack={() => setOverlay(null)}
        onOpenCalendar={() => setOverlay("calendar")}
      />
    );
  }
  if (overlay === "calendar") {
    return <CalendarScreen onBack={() => setOverlay(null)} />;
  }
  if (overlay === "bank") {
    return <BankScreen onBack={() => setOverlay(null)} />;
  }
  if (overlay === "forgot") {
    return <ForgotScreen onBack={() => setOverlay(null)} />;
  }
  if (overlay === "plan") {
    return (
      <PlanComposerScreen
        mode="plan"
        onBack={() => setOverlay(null)}
        onDone={() => setOverlay("planSuccess")}
      />
    );
  }
  if (overlay === "freetime") {
    return (
      <PlanComposerScreen
        mode="freetime"
        onBack={() => setOverlay(null)}
        onDone={() => setOverlay("freetimeResults")}
      />
    );
  }
  if (overlay === "freetimeResults") {
    return <FreeTimeResultsScreen minutes={30} onBack={() => setOverlay(null)} />;
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
          setOverlay("checklist");
        }}
      />
    );
  }
  if (overlay === "checklist" && checklistId) {
    return (
      <ChecklistDetailScreen
        listId={checklistId}
        onBack={() => setOverlay("checklists")}
      />
    );
  }
  if (overlay === "planSuccess") {
    return (
      <AppScreen scroll={false}>
        <SuccessState
          title="הלו״ז מוכן!"
          onHome={() => {
            setOverlay(null);
            setTab("home");
          }}
        />
      </AppScreen>
    );
  }

  if (tab === "home" && !overlay) {
    return (
      <View style={{ flex: 1, backgroundColor: HOME_COLOR.page }}>
        <ProductHomeScreen
          onOpen={open}
          displayName={auth.user?.displayName}
          onTab={(next) => {
            setOverlay(null);
            setTab(next);
          }}
        />
      </View>
    );
  }

  const page =
    tab === "chat" ? (
      <ChatScreen />
    ) : tab === "tasks" ? (
      <TasksScreen />
    ) : (
      <ShoppingScreen />
    );

  return (
    <View style={{ flex: 1 }}>
      {page}
      <BottomNavBar active={tab} onChange={(next) => {
        setOverlay(null);
        setTab(next);
      }} />
    </View>
  );
}
