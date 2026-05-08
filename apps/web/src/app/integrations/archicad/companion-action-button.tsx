"use client";

import { useFormStatus } from "react-dom";

type CompanionActionButtonProps = {
  action: string;
  label: string;
  pendingLabel: string;
};

export function CompanionActionButton({ action, label, pendingLabel }: CompanionActionButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="action" value={action} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
