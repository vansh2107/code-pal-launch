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
      colorClass: 'text-expired-foreground',
      bgClass: 'bg-expired-bg border-expired/30',
      borderClass: 'border-expired/30',
      textClass: 'text-expired-foreground',
      badgeVariant: 'destructive',
    };
  } else if (daysUntilExpiry <= 30) {
    return {
      status: 'expiring',
      label: `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`,
      colorClass: 'text-expiring-foreground',
      bgClass: 'bg-expiring-bg border-expiring/30',
      borderClass: 'border-expiring/30',
      textClass: 'text-expiring-foreground',
      badgeVariant: 'secondary',
    };
  } else {
    return {
      status: 'valid',
      label: 'Valid',
      colorClass: 'text-valid-foreground',
      bgClass: 'bg-valid-bg border-valid/30',
      borderClass: 'border-valid/30',
      textClass: 'text-valid-foreground',
      badgeVariant: 'default',
    };
  }
};
