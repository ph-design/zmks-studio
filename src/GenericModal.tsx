import { forwardRef } from "react";
import type { ReactNode, Ref } from "react";

export interface GenericModalProps {
  onClose?: () => void;
  className?: string;
  backdropClassName?: string;
  children: ReactNode;
}

export const GenericModal = forwardRef(({ onClose, children, className, backdropClassName = "backdrop:bg-[rgba(0,0,0,0.5)]" }: GenericModalProps, ref: Ref<HTMLDialogElement>) => {
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={`modal-surface p-5 rounded-lg bg-base-100 text-base-content ${backdropClassName} ${className}`}
    >
      {children}
    </dialog>
  );
});