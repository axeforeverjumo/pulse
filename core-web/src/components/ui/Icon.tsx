import { type LucideIcon, type LucideProps } from "lucide-react";

type IconProps = LucideProps & {
  icon: LucideIcon;
  active?: boolean;
};

export function Icon({ icon: IconComponent, strokeWidth = 1.8, active, ...props }: IconProps) {
  return (
    <IconComponent
      strokeWidth={active ? 2.0 : strokeWidth}
      {...props}
    />
  );
}

export type { LucideIcon };
