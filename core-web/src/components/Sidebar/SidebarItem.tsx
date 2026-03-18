import { forwardRef, type ReactNode, type KeyboardEvent, type MouseEvent } from 'react';

/**
 * Standardized sidebar item component for consistent styling across all mini-apps.
 *
 * Styling standards:
 * - Base: w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors
 * - Unselected: text-text-secondary hover:text-text-body hover:bg-white/50
 * - Selected: bg-white text-text-body font-medium
 * - Icon size: w-4 h-4 (use w-3.5 h-3.5 for chevrons/indicators)
 * - Indentation: ml-2 per level (half of standard icon width)
 */

export interface SidebarItemProps {
  /** Left icon element (should use w-4 h-4 for main icons, w-3.5 h-3.5 for chevrons) */
  icon?: ReactNode;
  /** Main label text */
  label: string;
  /** Whether this item is currently selected/active */
  isSelected?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Nesting level for indentation (0 = root, 1 = first indent, etc.) */
  level?: number;
  /** Right-side content (badges, counts, action buttons) */
  rightContent?: ReactNode;
  /** Additional class names */
  className?: string;
  /** Whether to show hover actions container */
  showHoverActions?: boolean;
  /** Hover action buttons (shown on hover) */
  hoverActions?: ReactNode;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Tab index for keyboard navigation */
  tabIndex?: number;
}

const SidebarItem = forwardRef<HTMLDivElement, SidebarItemProps>(
  (
    {
      icon,
      label,
      isSelected = false,
      onClick,
      level = 0,
      rightContent,
      className = '',
      showHoverActions = false,
      hoverActions,
      disabled = false,
      tabIndex = 0,
    },
    ref
  ) => {
    const handleClick = () => {
      if (!disabled && onClick) {
        onClick();
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
        e.preventDefault();
        onClick?.();
      }
    };

    // Calculate indentation: ml-2 per level (half of w-4 icon width = 8px = 0.5rem = ml-2)
    const indentStyle = level > 0 ? { marginLeft: `${level * 0.5}rem` } : undefined;

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={disabled ? -1 : tabIndex}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        style={indentStyle}
        className={`
          w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors group cursor-pointer
          ${isSelected
            ? 'bg-white text-text-body font-medium'
            : 'text-text-secondary hover:text-text-body hover:bg-white/50'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${className}
        `.trim().replace(/\s+/g, ' ')}
      >
        {/* Icon */}
        {icon && <span className="flex-shrink-0">{icon}</span>}

        {/* Label */}
        <span className="flex-1 text-left truncate">{label}</span>

        {/* Right content (always visible) */}
        {rightContent && <span className="flex-shrink-0">{rightContent}</span>}

        {/* Hover actions (visible on hover) */}
        {showHoverActions && hoverActions && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0">
            {hoverActions}
          </div>
        )}
      </div>
    );
  }
);

SidebarItem.displayName = 'SidebarItem';

export default SidebarItem;

/**
 * Standardized menu button for sidebar items (three-dots menu)
 */
export interface SidebarMenuButtonProps {
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
}

export function SidebarMenuButton({ onClick, title = 'More options' }: SidebarMenuButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className="p-1 rounded text-text-tertiary hover:text-text-body hover:bg-bg-gray-light transition-colors"
      title={title}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
      </svg>
    </button>
  );
}

/**
 * Standard icon sizes for sidebar items
 */
export const SIDEBAR_ICON_SIZES = {
  /** Main item icons (folder, file, channel, etc.) */
  main: 'w-4 h-4',
  /** Indicator icons (chevrons, arrows) */
  indicator: 'w-3.5 h-3.5',
  /** Small icons (badges, status) */
  small: 'w-3 h-3',
} as const;

/**
 * Standard indentation multiplier
 * Each level indents by 0.5rem (8px), which is half the standard icon width
 */
export const SIDEBAR_INDENT_PER_LEVEL = 0.5; // rem
