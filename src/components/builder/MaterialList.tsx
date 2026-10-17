import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, RefreshCw, Box, Info, Loader2 } from 'lucide-react';
import type { MaterialCounts } from '../../utils/export/materials';
import { SegmentedControl, type SegmentedOption } from '@/components/controls/SegmentedControl';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface MaterialListProps {
    isOpen: boolean;
    onClose: () => void;
    onCalculate: () => Promise<MaterialCounts | null>;
}

type ViewMode = 'total' | 'reusable';

const VIEW_OPTIONS: SegmentedOption<ViewMode>[] = [
    { value: 'total', label: 'Total Materials' },
    { value: 'reusable', label: 'Reusable Blocks', icon: <RefreshCw /> },
];

const formatBlockName = (id: string) => {
    return id.replace('minecraft:', '')
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

const getTextureUrl = (blockId: string) => {
    const cleanName = blockId.replace('minecraft:', '');
    return `/textures/${cleanName}.png`;
};

/** Block texture, or a generic box icon when the texture is missing. */
const BlockIcon = ({ id }: { id: string }) => {
    const [failed, setFailed] = useState(false);

    return (
        <div
            className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted"
            style={{ imageRendering: 'pixelated' }}
        >
            {failed ? (
                <Box className="size-3.5 text-muted-foreground" />
            ) : (
                <img
                    src={getTextureUrl(id)}
                    alt={formatBlockName(id)}
                    className="size-full object-cover"
                    onError={() => setFailed(true)}
                />
            )}
        </div>
    );
};

const headClass = 'px-3 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground';

export const MaterialList = ({ isOpen, onClose, onCalculate }: MaterialListProps) => {
    const [materials, setMaterials] = useState<MaterialCounts | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('total');

    const loadMaterials = useCallback(async () => {
        setIsLoading(true);
        const data = await onCalculate();
        setMaterials(data);
        setIsLoading(false);
    }, [onCalculate]);

    useEffect(() => {
        let active = true;
        if (isOpen) {
            void Promise.resolve().then(() => {
                if (active) loadMaterials();
            });
        } else {
            void Promise.resolve().then(() => {
                if (active) setMaterials(null);
            });
        }
        return () => { active = false; };
    }, [isOpen, loadMaterials]);

    const rows = materials
        ? Object.entries(materials[viewMode]).sort(([, a], [, b]) => b - a)
        : [];
    const totalBlocks = rows.reduce((sum, [, count]) => sum + count, 0);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
                {/* Header */}
                <DialogHeader className="gap-4 border-b p-4">
                    <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                        <ClipboardList className="size-5 text-muted-foreground" />
                        Material List
                    </DialogTitle>
                    <DialogDescription className="sr-only">Blocks needed to build the current map art.</DialogDescription>
                    <SegmentedControl
                        aria-label="Material view"
                        value={viewMode}
                        onValueChange={setViewMode}
                        options={VIEW_OPTIONS}
                        className="w-auto self-start"
                    />
                </DialogHeader>

                {/* Content */}
                <div className="relative min-h-[300px] flex-1 overflow-auto">
                    {isLoading ? (
                        <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                            <Loader2 className="size-8 animate-spin text-primary" />
                            <p className="animate-pulse text-sm font-medium">Calculating materials...</p>
                        </div>
                    ) : !materials ? (
                        <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                            <Box className="size-12 opacity-40" />
                            <p>No data available</p>
                        </div>
                    ) : (
                        <table className="w-full border-collapse text-left text-sm">
                            <thead className="sticky top-0 z-10 border-b bg-popover/95 shadow-sm backdrop-blur">
                                <tr>
                                    <th className={headClass}>Block Type</th>
                                    <th className={`${headClass} text-right`}>Shulkers</th>
                                    <th className={`${headClass} text-right`}>Stacks</th>
                                    <th className={`${headClass} text-right`}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(([id, count]) => {
                                    const stacks = Math.floor(count / 64);
                                    const remainder = count % 64;
                                    const shulkers = (count / (64 * 27)).toFixed(1);

                                    return (
                                        <tr key={id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                                            <td className="flex items-center gap-3 px-3 py-2">
                                                <BlockIcon id={id} />
                                                <span className="font-medium text-foreground">{formatBlockName(id)}</span>
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                                                {parseInt(shulkers) > 0 ? (
                                                    <Badge variant="secondary" className="font-mono text-xs">{shulkers} SB</Badge>
                                                ) : '-'}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                                                {stacks > 0 && <span className="text-foreground">{stacks}st</span>}
                                                {stacks > 0 && remainder > 0 && <span className="mx-1 opacity-50">+</span>}
                                                {remainder > 0 && <span>{remainder}</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono font-bold text-foreground">
                                                {count.toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="sticky bottom-0 border-t bg-popover/95 font-bold text-foreground">
                                <tr>
                                    <td className="px-3 py-3">
                                        TOTAL BLOCKS
                                        {viewMode === 'reusable' && <span className="ml-2 text-xs font-normal text-muted-foreground">(Max per section)</span>}
                                    </td>
                                    <td colSpan={3} className="px-3 py-3 text-right font-mono">
                                        {totalBlocks.toLocaleString()}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t p-4 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2">
                        {viewMode === 'reusable' ? (
                            <>
                                <Info className="size-3.5 text-success" />
                                <span>Shows maximum blocks needed for any single 128x128 map section.</span>
                            </>
                        ) : (
                            <span>Estimates based on current configuration.</span>
                        )}
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
};
