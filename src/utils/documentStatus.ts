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
      colorClass: 'text-black dark:text-black',
      bgClass: 'bg-red-100 dark:bg-red-950/30 border-red-300 dark:border-red-900',
      borderClass: 'border-red-300 dark:border-red-900',
      textClass: 'text-black dark:text-black',
      badgeVariant: 'destructive',
    };
  } else if (daysUntilExpiry <= 30) {
    return {
      status: 'expiring',
      label: `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`,
      colorClass: 'text-black dark:text-black',
      bgClass: 'bg-yellow-100 dark:bg-yellow-950/30 border-yellow-300 dark:border-yellow-900',
      borderClass: 'border-yellow-300 dark:border-yellow-900',
      textClass: 'text-black dark:text-black',
      badgeVariant: 'secondary',
    };
  } else {
    return {
      status: 'valid',
      label: 'Valid',
      colorClass: 'text-black dark:text-black',
      bgClass: 'bg-green-100 dark:bg-green-950/30 border-green-300 dark:border-green-900',
      borderClass: 'border-green-300 dark:border-green-900',
      textClass: 'text-black dark:text-black',
      badgeVariant: 'default',
    };
  }
};
