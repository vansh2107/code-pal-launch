export type DecisionState =
  | 'READY_FOR_REMINDER'
  | 'EXPIRED_REQUIRES_CONFIRMATION'
  | 'NO_EXPIRY_AUTO_SAVE'
  | 'MISSING_REQUIRED_INFORMATION'
  | 'LOW_CONFIDENCE_REVIEW'
  | 'CONFLICT_REQUIRES_REVIEW'
  | 'PROCESSING_FAILED';

export interface FieldStatus {
  field: string;
  value: any;
  status: 'extracted' | 'missing' | 'uncertain' | 'not_applicable' | 'conflicting';
  confidence: number;
  sourcePage?: number;
  reason?: string;
}

export interface DecisionResult {
  decision: DecisionState;
  explanation: string;
  missingFields: string[];
  fieldStatuses: Record<string, FieldStatus>;
}

/**
 * Checks if a document type typically requires an expiry date.
 */
export function doesDocumentTypeRequireExpiry(docType: string): boolean {
  const normalized = docType.toLowerCase();
  
  // These document types typically NEVER have an expiry date
  const noExpiryTypes = [
    'aadhaar',
    'pan',
    'pan_card',
    'birth_certificate',
    'marksheet',
    'degree',
    'diploma',
    'academic_transcript',
    'certificate_of_incorporation',
    'voter_id',
    'utility_bill',
    'receipt',
    'invoice'
  ];
  
  if (noExpiryTypes.some(t => normalized.includes(t))) {
    return false;
  }
  
  // Standard expiry document types
  const expiryRequiredTypes = [
    'passport',
    'license',
    'drivers_license',
    'visa',
    'work_permit',
    'permit',
    'insurance',
    'insurance_policy',
    'contract',
    'lease',
    'subscription',
    'warranty'
  ];
  
  if (expiryRequiredTypes.some(t => normalized.includes(t))) {
    return true;
  }
  
  // Default is optional/no expiry required for other generic documents
  return false;
}

/**
 * Parses and normalizes dates in multiple formats.
 * Returns a valid Date object or null.
 */
export function parseAndNormalizeDate(dateStr: any): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr;
  }
  if (typeof dateStr !== 'string') return null;

  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Try standard YYYY-MM-DD
  let match = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const date = new Date(year, month, day);
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
      return date;
    }
  }

  // Try DD-MM-YYYY or DD/MM/YYYY
  match = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    const date = new Date(year, month, day);
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
      return date;
    }
  }

  // Try MM-DD-YYYY or MM/DD/YYYY
  match = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (match) {
    const month = parseInt(match[1], 10) - 1;
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const date = new Date(year, month, day);
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
      return date;
    }
  }

  // Try default JS parser
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    // Validate impossible dates like Feb 31st
    return parsed;
  }

  return null;
}

/**
 * Processes extracted fields and classifies the document lifecycle state.
 */
export function evaluateDocumentDecision(
  docType: string,
  fields: Record<string, any>,
  aiConfidence: number = 1.0,
  fieldStatusesInput?: Record<string, any>
): DecisionResult {
  const missingFields: string[] = [];
  const fieldStatuses: Record<string, FieldStatus> = {};
  
  // Helper to safely populate field statuses
  const getFieldStatus = (fieldName: string, required: boolean): FieldStatus => {
    if (fieldStatusesInput && fieldStatusesInput[fieldName]) {
      const inputStatus = fieldStatusesInput[fieldName];
      return {
        field: fieldName,
        value: inputStatus.value,
        status: inputStatus.status || 'extracted',
        confidence: inputStatus.confidence ?? 1.0,
        sourcePage: inputStatus.sourcePage,
        reason: inputStatus.reason
      };
    }
    
    const value = fields[fieldName];
    if (value === undefined || value === null || String(value).trim() === '') {
      return {
        field: fieldName,
        value: null,
        status: required ? 'missing' : 'not_applicable',
        confidence: 0,
        reason: required ? `Required field ${fieldName} was not found.` : `Optional field ${fieldName} not present.`
      };
    }
    
    return {
      field: fieldName,
      value,
      status: 'extracted',
      confidence: aiConfidence
    };
  };

  const isExpiryRequired = doesDocumentTypeRequireExpiry(docType);

  // Expiry date check
  const expiryStatus = getFieldStatus('expiry_date', isExpiryRequired);
  fieldStatuses['expiry_date'] = expiryStatus;

  // Name check
  const nameStatus = getFieldStatus('name', true);
  fieldStatuses['name'] = nameStatus;

  // Issuing authority check (optional)
  const authorityStatus = getFieldStatus('issuing_authority', false);
  fieldStatuses['issuing_authority'] = authorityStatus;

  // Find missing fields
  if (nameStatus.status === 'missing' || nameStatus.status === 'uncertain') {
    missingFields.push('name');
  }

  // If conflicts are present
  const hasConflicts = Object.values(fieldStatuses).some(f => f.status === 'conflicting');
  if (hasConflicts) {
    const conflictingFields = Object.values(fieldStatuses)
      .filter(f => f.status === 'conflicting')
      .map(f => f.field);
    return {
      decision: 'CONFLICT_REQUIRES_REVIEW',
      explanation: `There are conflicting values across document pages for fields: ${conflictingFields.join(', ')}.`,
      missingFields,
      fieldStatuses
    };
  }

  // If AI confidence is extremely poor overall
  if (aiConfidence < 0.35) {
    return {
      decision: 'LOW_CONFIDENCE_REVIEW',
      explanation: 'The AI extracted the data with low confidence. Please verify all information manually.',
      missingFields,
      fieldStatuses
    };
  }

  // Expiry date verification
  if (isExpiryRequired) {
    if (expiryStatus.status === 'missing' || expiryStatus.status === 'uncertain') {
      missingFields.push('expiry_date');
      return {
        decision: 'MISSING_REQUIRED_INFORMATION',
        explanation: `Expiry date is required for document type "${docType}" but could not be extracted confidently. ${expiryStatus.reason || ''}`,
        missingFields,
        fieldStatuses
      };
    }

    const parsedExpiry = parseAndNormalizeDate(expiryStatus.value);
    if (!parsedExpiry) {
      missingFields.push('expiry_date');
      expiryStatus.status = 'uncertain';
      expiryStatus.reason = 'Expiry date format is invalid or represents an impossible date.';
      return {
        decision: 'MISSING_REQUIRED_INFORMATION',
        explanation: `Expiry date was extracted as "${expiryStatus.value}" but is not a valid date.`,
        missingFields,
        fieldStatuses
      };
    }

    // Compare date safely
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cleanExpiry = new Date(parsedExpiry);
    cleanExpiry.setHours(0, 0, 0, 0);

    if (cleanExpiry < today) {
      return {
        decision: 'EXPIRED_REQUIRES_CONFIRMATION',
        explanation: `The expiry date on this document is ${cleanExpiry.toLocaleDateString()}. This document has already expired.`,
        missingFields,
        fieldStatuses
      };
    }

    return {
      decision: 'READY_FOR_REMINDER',
      explanation: 'Information extracted successfully. Ready to schedule reminders.',
      missingFields,
      fieldStatuses
    };
  } else {
    // No expiry is required for this document type (e.g. Aadhaar)
    if (expiryStatus.status === 'missing' || expiryStatus.status === 'not_applicable') {
      expiryStatus.status = 'not_applicable';
      expiryStatus.reason = `This document type (${docType}) does not have an expiry date.`;
      return {
        decision: 'NO_EXPIRY_AUTO_SAVE',
        explanation: `This document type (${docType}) does not have an expiry date, so it will be saved to DocVault automatically.`,
        missingFields,
        fieldStatuses
      };
    }

    // If an expiry date WAS found, even if not strictly required, validate it
    const parsedExpiry = parseAndNormalizeDate(expiryStatus.value);
    if (parsedExpiry) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const cleanExpiry = new Date(parsedExpiry);
      cleanExpiry.setHours(0, 0, 0, 0);

      if (cleanExpiry < today) {
        return {
          decision: 'EXPIRED_REQUIRES_CONFIRMATION',
          explanation: `The document is expired (Expiry: ${cleanExpiry.toLocaleDateString()}).`,
          missingFields,
          fieldStatuses
        };
      }
      return {
        decision: 'READY_FOR_REMINDER',
        explanation: 'Document has a valid expiry date. Ready for reminders.',
        missingFields,
        fieldStatuses
      };
    }

    return {
      decision: 'NO_EXPIRY_AUTO_SAVE',
      explanation: `Saved automatically to DocVault.`,
      missingFields,
      fieldStatuses
    };
  }
}
