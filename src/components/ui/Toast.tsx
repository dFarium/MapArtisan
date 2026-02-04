import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface Toast {
    id: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    duration?: number;
}

interface ToastContextValue {
    showToast: (message: string, type?: Toast['type'], duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within ToastProvider');
    return context;
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: Toast['type'] = 'info', duration = 5000) => {
        const id = Math.random().toString(36).slice(2);
        setToasts(prev => [...prev, { id, message, type, duration }]);

        if (duration > 0) {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, duration);
        }
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const getIcon = (type: Toast['type']) => {
        switch (type) {
            case 'success': return <CheckCircle size={18} className="text-green-400" />;
            case 'warning': return <AlertTriangle size={18} className="text-amber-400" />;
            case 'error': return <AlertTriangle size={18} className="text-red-400" />;
            default: return <Info size={18} className="text-blue-400" />;
        }
    };

    const getBgColor = (type: Toast['type']) => {
        switch (type) {
            case 'success': return 'border-green-500/30 bg-green-950/80';
            case 'warning': return 'border-amber-500/30 bg-amber-950/80';
            case 'error': return 'border-red-500/30 bg-red-950/80';
            default: return 'border-blue-500/30 bg-blue-950/80';
        }
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}

            {/* Toast Container */}
            <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-sm">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`flex items-start gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm shadow-xl animate-in slide-in-from-right-5 fade-in duration-200 ${getBgColor(toast.type)}`}
                    >
                        {getIcon(toast.type)}
                        <p className="text-sm text-zinc-200 flex-1">{toast.message}</p>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
