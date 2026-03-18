import { motion } from "motion/react";

const STEPS = ["workspace-name", "profile", "invite"] as const;

interface OnboardingProgressProps {
  currentStep: string;
}

export default function OnboardingProgress({ currentStep }: OnboardingProgressProps) {
  const activeIndex = STEPS.indexOf(currentStep as (typeof STEPS)[number]);
  if (activeIndex === -1) return null;

  return (
    <div className="flex items-center gap-2 mb-10">
      {STEPS.map((_, i) => (
        <motion.div
          key={i}
          className="h-1.5 rounded-full"
          initial={false}
          animate={{
            backgroundColor: i <= activeIndex ? "#000000" : "#E7E7E6",
            width: 32,
          }}
          transition={{ duration: 0.3 }}
        />
      ))}
    </div>
  );
}
