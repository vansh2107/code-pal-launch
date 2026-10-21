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
  
  // These document types NEVER have an expiry date or renewal deadline
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
    'voter_id'
  ];
  
  if (noExpiryTypes.some(t => normalized.includes(t))) {
    return false;
  }
  
  // Standard expiry / deadline document types
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
    'warranty',
    'vehicle_registration',
    'registration'
  ];
  
  if (expiryRequiredTypes.some(t => normalized.includes(t))) {
    return true;
  }
  
  // Default is optional/no expiry required for other generic documents (like utility_bill, invoice, receipt, other)
  return false;
}

export function isValidCalendarDate(date: any): boolean {
  if (!date) return false;
  let parsed: Date;
  if (date instanceof Date) {
    parsed = date;
  } else {
    // If it's a number, or string of a number, reject it to avoid epoch parsing
    if (typeof date === 'number' || !isNaN(Number(date))) return false;
    const trimmed = String(date).trim();
    if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') return false;
    parsed = new Date(trimmed);
  }
  
  if (isNaN(parsed.getTime())) return false;
  
  // Reject epoch-derived dates (like 1969-12-31 or 1970-01-01)
  const year = parsed.getFullYear();
  if (year === 1969 || year === 1970) {
    return false;
  }
  
  return true;
}

/**
 * Parses and normalizes dates in multiple formats.
 * Returns a valid Date object or null.
 */
export function parseAndNormalizeDate(dateStr: any, country?: string): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return null;
    const year = dateStr.getFullYear();
    if (year === 1969 || year === 1970) return null;
    return dateStr;
  }
  
  // Reject numeric timestamps or epoch-related strings
  if (typeof dateStr === 'number' || !isNaN(Number(dateStr))) return null;
  if (typeof dateStr !== 'string') return null;

  let trimmed = dateStr.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined' || trimmed === '0') {
    return null;
  }

  // Pre-clean common OCR character confusions in date substrings
  // e.g., '28-NOV-2O24' (letter O for 0) or 'I5-08-2025' (letter I for 1)
  // Only replace if surrounding characters are digits or date separators
  const sanitizeOcrDate = (str: string): string => {
    return str
      // Replace capital O or lowercase o surrounded by digits or separators with 0
      .replace(/(?<=[0-9/\-.])([oO])(?=[0-9/\-.]|$)/g, '0')
      .replace(/(^|(?<=[/\-.]))([oO])(?=[0-9/\-.])/g, '0')
      // Replace capital I or lowercase l surrounded by digits with 1
      .replace(/(?<=[0-9/\-.])([Il])(?=[0-9/\-.]|$)/g, '1')
      .replace(/(^|(?<=[/\-.]))([Il])(?=[0-9/\-.])/g, '1')
      // Replace multiple spaces or tabs
      .replace(/\s+/g, ' ')
      .trim();
  };

  trimmed = sanitizeOcrDate(trimmed);

  let parsedDate: Date | null = null;

  // Month lookup table for textual months
  const MONTHS: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };

  // 1. Try standard YYYY-MM-DD or YYYY/MM/DD
  let match = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const date = new Date(year, month, day);
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
      parsedDate = date;
    }
  }

  // 2. Try textual month formats:
  // e.g. "20-JUL-2046", "20 July 2046", "20/Jul/2046", "20.Jul.2046"
  if (!parsedDate) {
    match = trimmed.match(/^(\d{1,2})[-/\s.]([A-Za-z]{3,9})[-/\s.](\d{2,4})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const mStr = match[2].toLowerCase();
      let year = parseInt(match[3], 10);
      if (year < 100) year += year > 70 ? 1900 : 2000;
      if (mStr in MONTHS) {
        const month = MONTHS[mStr];
        const date = new Date(year, month, day);
        if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
          parsedDate = date;
        }
      }
    }
  }

  // e.g. "Jul 20, 2046", "July 20 2046", "November 28, 2024"
  if (!parsedDate) {
    match = trimmed.match(/^([A-Za-z]{3,9})[-/\s.](\d{1,2}),?[-/\s.](\d{2,4})$/);
    if (match) {
      const mStr = match[1].toLowerCase();
      const day = parseInt(match[2], 10);
      let year = parseInt(match[3], 10);
      if (year < 100) year += year > 70 ? 1900 : 2000;
      if (mStr in MONTHS) {
        const month = MONTHS[mStr];
        const date = new Date(year, month, day);
        if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
          parsedDate = date;
        }
      }
    }
  }

  // 3. Try numeric 2-part format with 4-digit or 2-digit year: MM/YY or MM/YYYY (common on credit/debit cards or warranties)
  // Normalized to the last day of that month
  if (!parsedDate) {
    match = trimmed.match(/^(\d{1,2})[-/](\d{2}|\d{4})$/);
    if (match) {
      const monthNum = parseInt(match[1], 10);
      let yearNum = parseInt(match[2], 10);
      if (yearNum < 100) yearNum += 2000;
      if (monthNum >= 1 && monthNum <= 12 && yearNum >= 1990 && yearNum <= 2100) {
        // Last day of month
        const lastDay = new Date(yearNum, monthNum, 0).getDate();
        parsedDate = new Date(yearNum, monthNum - 1, lastDay);
      }
    }
  }

  // 4. Try DD-MM-YYYY vs MM-DD-YYYY with unambiguous day check and country context
  if (!parsedDate) {
    match = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (match) {
      const p1 = parseInt(match[1], 10);
      const p2 = parseInt(match[2], 10);
      let year = parseInt(match[3], 10);
      if (year < 100) year += year > 70 ? 1900 : 2000;

      // Unambiguous cases:
      if (p1 > 12 && p2 <= 12) {
        // Must be DD/MM/YYYY
        const date = new Date(year, p2 - 1, p1);
        if (date.getFullYear() === year && date.getMonth() === p2 - 1 && date.getDate() === p1) {
          parsedDate = date;
        }
      } else if (p2 > 12 && p1 <= 12) {
        // Must be MM/DD/YYYY
        const date = new Date(year, p1 - 1, p2);
        if (date.getFullYear() === year && date.getMonth() === p1 - 1 && date.getDate() === p2) {
          parsedDate = date;
        }
      } else if (p1 <= 12 && p2 <= 12) {
        // Ambiguous: use country format preference
        // US defaults to MM/DD/YYYY; India, UK, EU, Canada, Australia, etc. default to DD/MM/YYYY
        const isUS = country && /^(united states|usa|us)$/i.test(country.trim());
        const day = isUS ? p2 : p1;
        const month = isUS ? p1 - 1 : p2 - 1;
        const date = new Date(year, month, day);
        if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
          parsedDate = date;
        }
      }
    }
  }

  // 5. Try default JS parser as last resort
  if (!parsedDate) {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      parsedDate = parsed;
    }
  }

  if (parsedDate) {
    const year = parsedDate.getFullYear();
    if (year === 1969 || year === 1970) {
      return null;
    }
    return parsedDate;
  }

  return null;
}

/**
 * Normalizes any recognized date into YYYY-MM-DD string. Returns null if invalid.
 */
export function formatToIsoDate(dateStr: any, country?: string): string | null {
  const d = parseAndNormalizeDate(dateStr, country);
  if (!d) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

  // Expiry date label check
  const expiryLabelStatus = getFieldStatus('expiry_date_label', false);
  fieldStatuses['expiry_date_label'] = expiryLabelStatus;
  const dateLabel = expiryLabelStatus.value || 'Expiry Date';

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
        explanation: `${dateLabel} is required for document type "${docType}" but could not be extracted confidently. ${expiryStatus.reason || ''}`,
        missingFields,
        fieldStatuses
      };
    }

    const parsedExpiry = parseAndNormalizeDate(expiryStatus.value, fields.country);
    if (!parsedExpiry) {
      missingFields.push('expiry_date');
      expiryStatus.status = 'uncertain';
      expiryStatus.reason = `${dateLabel} format is invalid or represents an impossible date.`;
      return {
        decision: 'MISSING_REQUIRED_INFORMATION',
        explanation: `${dateLabel} was extracted as "${expiryStatus.value}" but is not a valid date.`,
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
        explanation: `The ${dateLabel.toLowerCase()} on this document is ${cleanExpiry.toLocaleDateString()}. This document has already passed this date.`,
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
    // No expiry is required for this document type (e.g. Aadhaar or Credit Card)
    if (expiryStatus.status === 'missing' || expiryStatus.status === 'not_applicable') {
      expiryStatus.status = 'not_applicable';
      expiryStatus.reason = `This document type (${docType}) does not have a deadline or expiry date.`;
      return {
        decision: 'NO_EXPIRY_AUTO_SAVE',
        explanation: `This document type (${docType}) does not have an expiry or actionable date, so it will be saved to DocVault automatically.`,
        missingFields,
        fieldStatuses
      };
    }

    // If an expiry/due date WAS found, even if not strictly required, validate it
    const parsedExpiry = parseAndNormalizeDate(expiryStatus.value, fields.country);
    if (parsedExpiry) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const cleanExpiry = new Date(parsedExpiry);
      cleanExpiry.setHours(0, 0, 0, 0);

      if (cleanExpiry < today) {
        return {
          decision: 'EXPIRED_REQUIRES_CONFIRMATION',
          explanation: `The document is past its actionable date (${dateLabel}: ${cleanExpiry.toLocaleDateString()}).`,
          missingFields,
          fieldStatuses
        };
      }
      return {
        decision: 'READY_FOR_REMINDER',
        explanation: `Document has a valid actionable date (${dateLabel}). Ready for reminders.`,
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
