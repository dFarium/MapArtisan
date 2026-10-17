import { ChevronDown, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { usePalettePresets } from '../../../utils/usePalettePresets';
import { showToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface PresetsToolbarProps {
    presetsHook: ReturnType<typeof usePalettePresets>; // Re-use the hook's return type or pass individual props
    onReset: () => void;
}

const SaveDialog = ({ open, onOpenChange, onSave }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (name: string) => void;
}) => {
    const [name, setName] = useState('');
    const inputId = useId();

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave(name);
        onOpenChange(false);
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) setName('');
                onOpenChange(next);
            }}
        >
            <DialogContent>
                <form onSubmit={submit} className="grid gap-4">
                    <DialogHeader>
                        <DialogTitle>Save preset</DialogTitle>
                        <DialogDescription>Saves the current block selection so you can apply it later.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2">
                        <Label htmlFor={inputId}>Name</Label>
                        <Input id={inputId} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={!name.trim()}>Save</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export const PresetsToolbar = ({ presetsHook, onReset }: PresetsToolbarProps) => {
    const { customPresets, applyPreset, saveCurrentAsPreset, deletePreset } = presetsHook;
    const [isPresetsOpen, setIsPresetsOpen] = useState(false);
    const [isSaveOpen, setIsSaveOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<number | null>(null);

    const handleApplyPreset = (type: 'all' | 'basic' | 'easy' | 'custom', customData?: Record<number, string | null>) => {
        const result = applyPreset(type, customData);

        if (result.replacements.length > 0) {
            const count = result.replacements.length;
            const blockNames = result.replacements
                .slice(0, 3)
                .map(r => r.original.replace('minecraft:', ''))
                .join(', ');
            const suffix = count > 3 ? ` and ${count - 3} more` : '';
            showToast(
                `${count} block(s) replaced for version compatibility: ${blockNames}${suffix}`,
                'warning',
                6000
            );
        }
    };

    return (
        <Collapsible open={isPresetsOpen} onOpenChange={setIsPresetsOpen} className="flex flex-col gap-2">
            <CollapsibleTrigger className="group flex items-center justify-between rounded-md text-xs font-semibold uppercase tracking-wider text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30">
                <span>Presets</span>
                <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>

            <CollapsibleContent className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2">
                <div className="grid grid-cols-3 gap-1.5">
                    <Button variant="secondary" onClick={() => handleApplyPreset('all')}>All Colors</Button>
                    <Button variant="secondary" onClick={() => handleApplyPreset('basic')}>Basic (16)</Button>
                    <Button variant="secondary" onClick={() => handleApplyPreset('easy')}>Easy</Button>
                </div>

                {/* Custom Presets */}
                {customPresets.length > 0 && (
                    <div className="flex flex-col gap-1 border-t pt-2">
                        <span className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">My Presets</span>
                        {customPresets.map((p, i) => (
                            <div key={i} className="group/p flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    onClick={() => handleApplyPreset('custom', p.selection)}
                                    className="flex-1 justify-start truncate"
                                >
                                    {p.name}
                                </Button>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Delete preset ${p.name}`}
                                            onClick={() => setPendingDelete(i)}
                                            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/p:opacity-100"
                                        >
                                            <Trash2 />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete preset</TooltipContent>
                                </Tooltip>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex gap-1.5 border-t pt-2">
                    <Button variant="destructive" onClick={onReset} className="flex-1">
                        <RotateCcw /> Reset
                    </Button>
                    <Button onClick={() => setIsSaveOpen(true)} className="flex-2">
                        <Save /> Save Current
                    </Button>
                </div>
            </CollapsibleContent>

            <SaveDialog open={isSaveOpen} onOpenChange={setIsSaveOpen} onSave={saveCurrentAsPreset} />

            <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this preset?</AlertDialogTitle>
                        <AlertDialogDescription>
                            "{pendingDelete !== null ? customPresets[pendingDelete]?.name : ''}" will be removed. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => {
                                if (pendingDelete !== null) deletePreset(pendingDelete);
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Collapsible>
    );
};
