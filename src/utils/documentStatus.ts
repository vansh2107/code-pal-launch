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
      colorClass: 'text-red-600 dark:text-red-400',
      bgClass: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900',
      borderClass: 'border-red-200 dark:border-red-900',
      textClass: 'text-red-700 dark:text-red-300',
      badgeVariant: 'destructive',
    };
  } else if (daysUntilExpiry <= 30) {
    return {
      status: 'expiring',
      label: `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`,
      colorClass: 'text-yellow-600 dark:text-yellow-400',
      bgClass: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900',
      borderClass: 'border-yellow-200 dark:border-yellow-900',
      textClass: 'text-yellow-700 dark:text-yellow-300',
      badgeVariant: 'secondary',
    };
  } else {
    return {
      status: 'valid',
      label: 'Valid',
      colorClass: 'text-green-600 dark:text-green-400',
      bgClass: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900',
      borderClass: 'border-green-200 dark:border-green-900',
      textClass: 'text-green-700 dark:text-green-300',
      badgeVariant: 'default',
    };
  }
};
