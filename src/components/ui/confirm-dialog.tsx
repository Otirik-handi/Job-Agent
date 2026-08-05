'use client';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Button } from '@/src/components/ui/button';
import { Separator } from '@/src/components/ui/separator';

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
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-card">
          <div className="px-5 pb-4 pt-5">
            <AlertDialog.Title className="text-base font-semibold text-foreground">
              {title}
            </AlertDialog.Title>
          </div>
          <Separator />
          <div className="px-5 py-4">
            <AlertDialog.Description className="text-sm text-muted-foreground">
              {description}
            </AlertDialog.Description>
          </div>
          <Separator />
          <div className="flex justify-end gap-2 px-5 pb-5 pt-4">
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
