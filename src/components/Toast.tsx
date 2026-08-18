import type { ToastState } from "@/lib/types";

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return <div className="toast" role="status" />;
  return (
    <div className={`toast show ${toast.type}`} role="status">
      {toast.message}
    </div>
  );
}
