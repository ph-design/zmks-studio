import { MutableRefObject, useEffect, useRef } from "react";

const MODAL_CLOSE_ANIMATION_MS = 160;

export function useModalRef(
  open: boolean,
  closeOnOutsideClick?: boolean,
  allowCancel?: boolean
): MutableRefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const closeWithAnimation = (target?: HTMLDialogElement | null) => {
    const dialog = target || ref.current;
    if (!dialog?.open) {
      return;
    }

    window.clearTimeout(closeTimer.current);
    dialog.classList.add("modal-closing");
    closeTimer.current = window.setTimeout(() => {
      dialog.close();
      dialog.classList.remove("modal-closing");
    }, MODAL_CLOSE_ANIMATION_MS);
  };

  let reopen = async () => {
    // We do this in a timeout so it runs after the modal has actually closed.
    setTimeout(() => ref.current?.showModal());
  };

  useEffect(() => {
    if (open) {
      if (ref.current && !ref.current?.open) {
        window.clearTimeout(closeTimer.current);
        ref.current.classList.remove("modal-closing");
        ref.current?.showModal();
        if (allowCancel !== undefined && !allowCancel) {
          ref.current?.addEventListener("cancel", reopen);
        }
      }
      if (closeOnOutsideClick) {
        const handleClickOutside = (e: MouseEvent) => {
          const target = e.target as HTMLDialogElement | null;
          if (!target) return;

          const { top, left, width, height } = target.getBoundingClientRect();
          const clickedInDialog =
            top <= e.clientY &&
            e.clientY <= top + height &&
            left <= e.clientX &&
            e.clientX <= left + width;

          if (!clickedInDialog) {
            closeWithAnimation(target);
          }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
          document.removeEventListener("mousedown", handleClickOutside);
        };
      }
    } else {
      closeWithAnimation();
      ref.current?.removeEventListener("cancel", reopen);
    }

    return () => window.clearTimeout(closeTimer.current);
  }, [open, closeOnOutsideClick]);

  return ref;
}
