// Shared sidebar style constants used across all miniapp sidebars.
// Import these instead of hardcoding color values.

export const SIDEBAR = {
  /** Background color for the sidebar panel */
  bg: "bg-[#F9F9F9]",
  /** Background color for a selected/active item */
  selectedBg: "bg-[#EAEAEA]",
  /** Text color for a selected/active item */
  selectedText: "text-black font-medium",
  /** Text color for an unselected item */
  itemText: "text-[#323232]",
  /** Combined classes for an unselected sidebar item */
  item: "text-[#323232]",
  /** Combined classes for a selected sidebar item */
  selected: "bg-[#EAEAEA] text-black font-medium",
} as const;
