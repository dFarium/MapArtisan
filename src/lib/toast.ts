import { toast } from 'sonner';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

/** Shows a notification through the app's sonner Toaster (mounted in App.tsx). */
export const showToast = (message: string, type: ToastType = 'info', duration = 5000) => {
    toast[type](message, { duration: duration > 0 ? duration : Infinity });
};
