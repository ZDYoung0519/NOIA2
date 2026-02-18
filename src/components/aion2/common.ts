export type GradeType =
  | "Common"
  | "Rare"
  | "Legend"
  | "Unique"
  | "Epic"
  | "Special";

export const gradeConfig = {
  Common: {
    bg: `url("/images/aion2/SlotCommon.webp")`,
    border: "border-white-400",
    text: "text-white-400",
    bgDark: "bg-white-800",
    lightBg: "bg-white-50",
  },
  Rare: {
    bg: `url("/images/aion2/Rare.webp")`,
    border: "border-green-300",
    text: "text-green-300",
    bgDark: "bg-green-900",
    lightBg: "bg-green-50",
  },
  Legend: {
    bg: `url("/images/aion2/SlotLegend.webp")`,
    border: "border-blue-400",
    text: "text-blue-400",
    bgDark: "bg-blue-900",
    lightBg: "bg-blue-50",
  },
  Unique: {
    bg: `url("/images/aion2/SlotUnique.webp")`,
    border: "border-yellow-400",
    text: "text-yellow-400",
    bgDark: "bg-yellow-900",
    lightBg: "bg-yellow-50",
  },
  Epic: {
    bg: `url("/images/aion2/SlotEpic.webp")`,
    border: "border-orange-500",
    text: "text-orange-500",
    bgDark: "bg-transparent",
    lightBg: "bg-orange-50",
  },
  Special: {
    bg: `url("/images/aion2/SlotSpecial.webp")`,
    border: "border-teal-500",
    text: "text-teal-500",
    bgDark: "bg-transparent",
    lightBg: "bg-teal-50",
  },
};
