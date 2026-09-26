import { Image, type ImageStyle, type StyleProp } from "react-native";

const ACTIONS = {
  add: require("../../../assets/checklists-v1/icons/actions/add.png"),
  archive: require("../../../assets/checklists-v1/icons/actions/archive.png"),
  calendar: require("../../../assets/checklists-v1/icons/actions/calendar.png"),
  "chevron-right": require("../../../assets/checklists-v1/icons/actions/chevron-right.png"),
  duplicate: require("../../../assets/checklists-v1/icons/actions/duplicate.png"),
  edit: require("../../../assets/checklists-v1/icons/actions/edit.png"),
  "link-task": require("../../../assets/checklists-v1/icons/actions/link-task.png"),
  more: require("../../../assets/checklists-v1/icons/actions/more.png"),
  repeat: require("../../../assets/checklists-v1/icons/actions/repeat.png"),
  reset: require("../../../assets/checklists-v1/icons/actions/reset.png"),
  search: require("../../../assets/checklists-v1/icons/actions/search.png"),
  trash: require("../../../assets/checklists-v1/icons/actions/trash.png"),
} as const;

const STATES = {
  done: require("../../../assets/checklists-v1/icons/states/checkbox-done.png"),
  empty: require("../../../assets/checklists-v1/icons/states/checkbox-empty.png"),
} as const;

const CATEGORIES = {
  bag: require("../../../assets/checklists-v1/icons/categories/bag.png"),
  car: require("../../../assets/checklists-v1/icons/categories/car.png"),
  cleaning: require("../../../assets/checklists-v1/icons/categories/cleaning.png"),
  food: require("../../../assets/checklists-v1/icons/categories/food.png"),
  gift: require("../../../assets/checklists-v1/icons/categories/gift.png"),
  home: require("../../../assets/checklists-v1/icons/categories/home.png"),
  kids: require("../../../assets/checklists-v1/icons/categories/kids.png"),
  pet: require("../../../assets/checklists-v1/icons/categories/pet.png"),
  shopping: require("../../../assets/checklists-v1/icons/categories/shopping.png"),
  travel: require("../../../assets/checklists-v1/icons/categories/travel.png"),
} as const;

export type PackAction = keyof typeof ACTIONS;
export type PackCategory = keyof typeof CATEGORIES;

export function categoryForTitle(title: string): PackCategory {
  const value = title.toLowerCase();
  if (/גן|ילד|תיק|חיתול|בקבוק/.test(value)) return "kids";
  if (/קני|סופר|שוק/.test(value)) return "shopping";
  if (/ניקוי|כביסה|בית/.test(value)) return "cleaning";
  if (/אוכל|ארוחה|מטבח/.test(value)) return "food";
  if (/רכב|נסיעה/.test(value)) return "car";
  if (/טיול|מזוודה/.test(value)) return "travel";
  if (/כלב|חתול|פלא/.test(value)) return "pet";
  return "bag";
}

export function PackActionIcon({
  name,
  size = 22,
  style,
}: {
  name: PackAction;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return <Image source={ACTIONS[name]} style={[{ width: size, height: size }, style]} resizeMode="contain" />;
}

export function PackStateIcon({ checked, size = 24 }: { checked: boolean; size?: number }) {
  return <Image source={checked ? STATES.done : STATES.empty} style={{ width: size, height: size }} resizeMode="contain" />;
}

export function PackCategoryIcon({ name, size = 28 }: { name: PackCategory; size?: number }) {
  return <Image source={CATEGORIES[name]} style={{ width: size, height: size }} resizeMode="contain" />;
}
