import { useRef } from "react";
import AvatarEditor from "react-avatar-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AvatarEditorDialogProps = {
  open: boolean;
  image: string | null;
  scale: number;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onScaleChange: (value: number) => void;
  onSelectImage: (file: File) => void;
  onSave: (canvas: HTMLCanvasElement) => void;
};

export function AvatarEditorDialog({
  open,
  image,
  scale,
  isSaving,
  onOpenChange,
  onScaleChange,
  onSelectImage,
  onSave,
}: AvatarEditorDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<AvatarEditor | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit avatar</DialogTitle>
          <DialogDescription>
            Drag to reposition, then adjust zoom.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onSelectImage(file);
              event.currentTarget.value = "";
            }}
          />
          <div className="flex justify-center">
            {image ? (
              <AvatarEditor
                ref={editorRef}
                image={image}
                width={256}
                height={256}
                border={24}
                borderRadius={128}
                scale={scale}
                color={[0, 0, 0, 0.65]}
                className="rounded-md"
              />
            ) : (
              <div className="flex h-[304px] w-[304px] items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-muted-foreground">
                Choose an image to start editing.
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => inputRef.current?.click()}
            disabled={isSaving}
          >
            {image ? "Choose Different Image" : "Choose Image"}
          </Button>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="avatar-zoom">
              Zoom ({scale.toFixed(2)}x)
            </label>
            <input
              id="avatar-zoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={scale}
              onChange={(event) => onScaleChange(Number(event.currentTarget.value))}
              className="w-full accent-primary"
              disabled={isSaving || !image}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              const canvas = editorRef.current?.getImageScaledToCanvas() ?? null;
              if (!canvas) return;
              onSave(canvas);
            }}
            disabled={isSaving || !image}
          >
            {isSaving ? "Saving…" : "Save Avatar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
