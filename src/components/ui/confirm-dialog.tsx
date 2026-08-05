'use client';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Button } from '@/src/components/ui/button';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '删除',
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-sm" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-card">
          <AlertDialog.Title className="text-base font-semibold text-foreground">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
            {description}
          </AlertDialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Close
              render={<Button variant="outline" size="sm">取消</Button>}
            />
            <Button variant="destructive" size="sm" onClick={onConfirm}>
              {confirmText}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
