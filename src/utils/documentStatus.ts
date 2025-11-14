export type DocumentStatus = 'expired' | 'expiring' | 'valid';

export interface DocumentStatusInfo {
  status: DocumentStatus;
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  badgeVariant: 'default' | 'destructive' | 'secondary';
}

export const getDocumentStatus = (expiryDate: string): DocumentStatusInfo => {
  const today = new Date();
  const expiry = new Date(expiryDate);
  const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry < 0) {
    return {
      status: 'expired',
      label: 'Expired',
      colorClass: 'text-expired dark:text-red-400',
      bgClass: 'bg-expired/20 dark:bg-red-950/30 border-expired/40 dark:border-red-900',
      borderClass: 'border-expired/40 dark:border-red-900',
      textClass: 'text-expired-foreground dark:text-red-300',
      badgeVariant: 'destructive',
    };
  } else if (daysUntilExpiry <= 30) {
    return {
      status: 'expiring',
      label: `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`,
      colorClass: 'text-expiring dark:text-yellow-400',
      bgClass: 'bg-expiring/20 dark:bg-yellow-950/30 border-expiring/40 dark:border-yellow-900',
      borderClass: 'border-expiring/40 dark:border-yellow-900',
      textClass: 'text-expiring-foreground dark:text-yellow-300',
      badgeVariant: 'secondary',
    };
  } else {
    return {
      status: 'valid',
      label: 'Valid',
      colorClass: 'text-success dark:text-green-400',
      bgClass: 'bg-success/20 dark:bg-green-950/30 border-success/40 dark:border-green-900',
      borderClass: 'border-success/40 dark:border-green-900',
      textClass: 'text-success-foreground dark:text-green-300',
      badgeVariant: 'default',
    };
  }
};
