import { I18nManager } from "react-native";
import { registerRootComponent } from "expo";
import { AppRoot } from "./src/app/AppRoot";

I18nManager.allowRTL(true);
if (!I18nManager.isRTL) {
  I18nManager.forceRTL(true);
}

registerRootComponent(AppRoot);
