export type ColorKey = "R" | "G" | "Y";

export type ColorChoice = {
  key: ColorKey;
  label: string;
  color: string;
  textColor: string;
};

export const colorChoices: Record<ColorKey, ColorChoice> = {
  R: { key: "R", label: "Red", color: "#d51f1f", textColor: "#ffffff" },
  G: { key: "G", label: "Green", color: "#087c36", textColor: "#ffffff" },
  Y: { key: "Y", label: "Yellow", color: "#f2ca16", textColor: "#111111" },
};

export const colorSequence: ColorKey[] = ["R", "G", "Y", "G", "R", "G", "Y", "R", "Y", "G"];

export function scoreSequence(response: ColorKey[]) {
  const correctCount = response.filter((value, index) => value === colorSequence[index]).length;
  return {
    correctCount,
    percentage: Math.round((correctCount / colorSequence.length) * 100),
  };
}
