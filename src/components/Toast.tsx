import type { ToastMessage } from "../hooks/useToast";

export function ToastStack({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast-item">
          {toast.text}
        </div>
      ))}
    </div>
  );
}
