export type StyleCategoryId = "power" | "focus" | "energy" | "safety";

export interface StyleCategoryPreference {
  selections: string[];
  customDescription: string;
  overrideStyle: string;
}

export type StylePreferences = Record<StyleCategoryId, StyleCategoryPreference>;

export const STYLE_CATEGORY_IDS: StyleCategoryId[] = ["power", "focus", "energy", "safety"];

export function emptyStylePreferences(): StylePreferences {
  return {
    power: { selections: [], customDescription: "", overrideStyle: "" },
    focus: { selections: [], customDescription: "", overrideStyle: "" },
    energy: { selections: [], customDescription: "", overrideStyle: "" },
    safety: { selections: [], customDescription: "", overrideStyle: "" },
  };
}

