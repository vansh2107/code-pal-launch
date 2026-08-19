export type DocumentStatus = 'expired' | 'expiring' | 'valid' | 'permanent';

export interface DocumentStatusInfo {
  status: DocumentStatus;
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  badgeVariant: 'default' | 'destructive' | 'secondary';
}

const PERMANENT_STATUS: DocumentStatusInfo = {
  status: 'permanent',
  label: 'No expiry',
  colorClass: 'text-muted-foreground',
  bgClass: '',
  borderClass: 'border-border',
  textClass: 'text-foreground',
  badgeVariant: 'secondary',
};

/**
 * Returns true when the stored value is a usable expiry date.
 * Guards against null/empty/invalid values being coerced into the Unix epoch
 * (1/1/1970), which previously made permanent documents look "expired".
 */
export const hasValidExpiryDate = (expiryDate?: string | null): boolean => {
  if (!expiryDate) return false;
  const t = new Date(expiryDate).getTime();
  if (Number.isNaN(t)) return false;
  // Anything at/near the epoch is a bad fallback value, not a real expiry.
  return new Date(expiryDate).getUTCFullYear() > 1971;
};

export const getDocumentStatus = (expiryDate?: string | null): DocumentStatusInfo => {
  if (!hasValidExpiryDate(expiryDate)) return PERMANENT_STATUS;

  const today = new Date();
  const expiry = new Date(expiryDate as string);
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
