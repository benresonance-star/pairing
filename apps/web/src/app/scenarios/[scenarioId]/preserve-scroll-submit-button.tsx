"use client";

import { usePathname } from "next/navigation";

type PreserveScrollSubmitButtonProps = {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
};

export const scenarioEditorScrollKey = (pathname: string) => `scenario-editor-scroll:${pathname}`;

export default function PreserveScrollSubmitButton({
  children,
  className,
  disabled = false
}: PreserveScrollSubmitButtonProps) {
  const pathname = usePathname();

  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      onClick={() => {
        sessionStorage.setItem(scenarioEditorScrollKey(pathname), String(window.scrollY));
      }}
    >
      {children}
    </button>
  );
}
