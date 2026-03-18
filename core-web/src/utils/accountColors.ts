// Account color palettes for calendar events and email UI
// Each palette has 4 colors: background, accent, title text, and time text

export interface AccountColorPalette {
  bg: string;      // Light background
  accent: string;  // Accent bar / primary indicator
  title: string;   // Dark title text
  time: string;    // Medium time/secondary text
}

export const ACCOUNT_COLOR_PALETTES: AccountColorPalette[] = [
  // Blue (default - first account)
  { bg: '#D6EFF8', accent: '#35A9DD', title: '#19556E', time: '#2680A5' },
  // Green (second account)
  { bg: '#D4EDDA', accent: '#34C759', title: '#1E5631', time: '#2D8A4E' },
  // Purple
  { bg: '#E8DEF8', accent: '#9C6ADE', title: '#4A2D6E', time: '#7C4DBA' },
  // Orange
  { bg: '#FFECD2', accent: '#FF9500', title: '#7D4E00', time: '#C77700' },
  // Red/Rose
  { bg: '#FFE4E6', accent: '#F43F5E', title: '#7F1D2C', time: '#BE123C' },
  // Teal
  { bg: '#CCFBF1', accent: '#14B8A6', title: '#115E59', time: '#0D9488' },
  // Indigo
  { bg: '#E0E7FF', accent: '#6366F1', title: '#312E81', time: '#4F46E5' },
  // Amber
  { bg: '#FEF3C7', accent: '#F59E0B', title: '#78350F', time: '#D97706' },
];

// Global account order registry - set by CalendarView/EmailView on load
// Maps email (lowercase) -> index in accounts list
let accountOrderRegistry: Map<string, number> = new Map();

// Register accounts in order (call this when accounts are loaded)
export function registerAccountOrder(accounts: { email: string }[]): void {
  accountOrderRegistry = new Map();
  accounts.forEach((account, index) => {
    accountOrderRegistry.set(account.email.toLowerCase(), index);
  });
}

// Get the registered index for an email, or use hash as fallback
function getAccountIndex(email: string): number {
  const normalizedEmail = email.toLowerCase();
  if (accountOrderRegistry.has(normalizedEmail)) {
    return accountOrderRegistry.get(normalizedEmail)!;
  }
  // Fallback to hash for unknown accounts
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    const char = email.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// Get palette for an account email
export function getAccountPalette(accountEmail: string | undefined): AccountColorPalette {
  if (!accountEmail) {
    return ACCOUNT_COLOR_PALETTES[0]; // Default to blue
  }
  const index = getAccountIndex(accountEmail) % ACCOUNT_COLOR_PALETTES.length;
  return ACCOUNT_COLOR_PALETTES[index];
}

// Get just the accent color (for sidebar indicators)
export function getAccountAccentColor(accountEmail: string | undefined): string {
  return getAccountPalette(accountEmail).accent;
}
