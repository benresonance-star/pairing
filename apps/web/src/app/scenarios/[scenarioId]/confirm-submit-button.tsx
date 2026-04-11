"use client";

type ConfirmSubmitButtonProps = {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  confirmMessage: string;
};

export default function ConfirmSubmitButton({
  children,
  className,
  disabled = false,
  confirmMessage
}: ConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
