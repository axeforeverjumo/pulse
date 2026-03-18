import { useRef, useEffect } from 'react';
import { XMarkIcon, PlusIcon } from '@heroicons/react/20/solid';
import { useSidebarChatStore, type TabId, createNewTabId, isNewTab } from '../../stores/sidebarChatStore';
import { useConversationStore } from '../../stores/conversationStore';

interface ChatTabBarProps {
  onTabChange?: (tabId: TabId) => void;
}

export default function ChatTabBar({ onTabChange }: ChatTabBarProps) {
  const { openTabs, activeTabId, addTab, removeTab, setActiveTab, showTabBar } = useSidebarChatStore();
  const conversations = useConversationStore((state) => state.conversations);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Get conversation title by ID
  const getTabTitle = (tabId: TabId): string => {
    if (isNewTab(tabId)) return 'New';
    const conversation = conversations.find((c) => c.id === tabId);
    return conversation?.title || 'New';
  };

  // Handle tab click
  const handleTabClick = (tabId: TabId) => {
    if (tabId !== activeTabId) {
      setActiveTab(tabId);
      onTabChange?.(tabId);
    }
  };

  // Can close tabs only if there's more than one
  const canCloseTabs = openTabs.length > 1;

  // Handle tab close
  const handleTabClose = (e: React.MouseEvent, tabId: TabId) => {
    e.stopPropagation();
    if (canCloseTabs) {
      removeTab(tabId);
    }
  };

  // Handle new tab - always creates a new tab with unique ID
  const handleNewTab = () => {
    const newTabId = createNewTabId();
    addTab(newTabId);
    onTabChange?.(newTabId);
  };

  // Scroll active tab into view
  useEffect(() => {
    if (scrollContainerRef.current) {
      const activeTab = scrollContainerRef.current.querySelector('[data-active="true"]');
      activeTab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeTabId]);

  // Show tab bar if user has ever had multiple tabs (sticky behavior from store)
  const isVisible = showTabBar;

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
        isVisible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="overflow-hidden">
        <div className="flex items-center h-9 pl-2 pr-2 gap-2 border-b border-black/5">
          {/* Scrollable tabs container */}
          <div
            ref={scrollContainerRef}
            className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-hide"
          >
            {openTabs.map((tabId, index) => {
              const isActive = tabId === activeTabId;
              const title = getTabTitle(tabId);

              return (
                <button
                  key={tabId ?? `new-${index}`}
                  data-active={isActive}
                  onClick={() => handleTabClick(tabId)}
                  className={`group relative flex items-center gap-1.5 h-9 px-2 text-[13px] shrink-0 max-w-[140px] transition-colors ${
                    isActive
                      ? 'text-text-body font-medium'
                      : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  <span className="truncate">{title}</span>
                  {/* Close button */}
                  {canCloseTabs && (
                    <span
                      onClick={(e) => handleTabClose(e, tabId)}
                      className={`shrink-0 w-4 h-4 flex items-center justify-center rounded transition-all ${
                        isActive
                          ? 'opacity-40 hover:opacity-100 hover:bg-black/10'
                          : 'opacity-0 group-hover:opacity-40 hover:!opacity-100 hover:bg-black/10'
                      }`}
                    >
                      <XMarkIcon className="w-3 h-3" />
                    </span>
                  )}
                  {/* Active underline */}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-black rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* New tab button */}
          <button
            onClick={handleNewTab}
            className="shrink-0 p-1.5 text-text-tertiary hover:text-text-body hover:bg-bg-gray rounded-lg transition-colors"
            title="New chat"
            aria-label="New chat"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
