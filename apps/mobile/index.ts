import { I18nManager } from "react-native";
import { registerRootComponent } from "expo";
import { AppRoot } from "./src/app/AppRoot";

I18nManager.allowRTL(true);
I18nManager.forceRTL(false);

registerRootComponent(AppRoot);
