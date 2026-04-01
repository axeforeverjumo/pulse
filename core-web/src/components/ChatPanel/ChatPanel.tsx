import { Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useUIStore } from '../../stores/uiStore';

const SidebarChat = lazy(() => import('../SidebarChat'));

export default function ChatPanel() {
  const isSidebarChatOpen = useUIStore((s) => s.isSidebarChatOpen);

  return (
    <AnimatePresence initial={false}>
      {isSidebarChatOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 356, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="h-full shrink-0 flex flex-col overflow-hidden rounded-[22px] app-surface"
        >
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center">
                <div className="text-text-secondary text-sm">Loading...</div>
              </div>
            }
          >
            <SidebarChat />
          </Suspense>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
