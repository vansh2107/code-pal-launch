/**
 * test_date_extraction.ts
 *
 * Acceptance test suite for Expiry, Validity, and Due Date extraction and normalization:
 * 1. Distinguishes Expiry / Validity / Due dates from Issue Dates, Birth Dates (DOB),
 *    Invoice Dates, and Manufacture Dates.
 * 2. Normalizes diverse date formats (ISO, DD-MM-YYYY, MM/DD/YYYY, textual months: "20-JUL-2046",
 *    "28-Nov-2024", "Jul 20, 2046").
 * 3. Sanitizes common OCR character errors (e.g. 'O'/'o' for '0', 'I'/'l' for '1').
 * 4. Resolves DD/MM vs MM/DD based on document country preference.
 * 5. Supports card-style expiry format (MM/YY, MM/YYYY) normalized to end-of-month.
 * 6. Preserves null for document types with no expiry (Aadhaar, Birth Certificate, Voter ID).
 * 7. Correctly validates lifecycle state in evaluateDocumentDecision for ready reminders,
 *    past dates requiring confirmation, and missing required info.
 */

import {
  parseAndNormalizeDate,
  formatToIsoDate,
  doesDocumentTypeRequireExpiry,
  evaluateDocumentDecision
} from './src/utils/documentDecisionEngine.ts';

interface TestCase {
  name: string;
  run: () => void;
}

const tests: TestCase[] = [
  // 1. Textual Month Formats
  {
    name: 'Textual month format "20-JUL-2046" (e.g. Indian Driving License NT validity)',
    run: () => {
      const parsed = parseAndNormalizeDate('20-JUL-2046');
      if (!parsed) throw new Error('Failed to parse 20-JUL-2046');
      const iso = formatToIsoDate('20-JUL-2046');
      if (iso !== '2046-07-20') throw new Error(`Expected 2046-07-20, got ${iso}`);
    }
  },
  {
    name: 'Textual month format "28-Nov-2024" (e.g. Issue date / near date)',
    run: () => {
      const iso = formatToIsoDate('28-Nov-2024');
      if (iso !== '2024-11-28') throw new Error(`Expected 2024-11-28, got ${iso}`);
    }
  },
  {
    name: 'Textual month format "November 28, 2024"',
    run: () => {
      const iso = formatToIsoDate('November 28, 2024');
      if (iso !== '2024-11-28') throw new Error(`Expected 2024-11-28, got ${iso}`);
    }
  },
  {
    name: 'Textual month format "Jul 20 2046"',
    run: () => {
      const iso = formatToIsoDate('Jul 20 2046');
      if (iso !== '2046-07-20') throw new Error(`Expected 2046-07-20, got ${iso}`);
    }
  },

  // 2. OCR Typo Recovery
  {
    name: 'OCR character correction: Letter O for zero in "28-NOV-2O24"',
    run: () => {
      const iso = formatToIsoDate('28-NOV-2O24');
      if (iso !== '2024-11-28') throw new Error(`Expected 2024-11-28, got ${iso}`);
    }
  },
  {
    name: 'OCR character correction: Letter I for one in "I5-08-2025"',
    run: () => {
      const iso = formatToIsoDate('I5-08-2025');
      if (iso !== '2025-08-15') throw new Error(`Expected 2025-08-15, got ${iso}`);
    }
  },

  // 3. Card Expiry Format (MM/YY & MM/YYYY)
  {
    name: 'Card expiry format "07/26" normalizes to end of July 2026',
    run: () => {
      const iso = formatToIsoDate('07/26');
      if (iso !== '2026-07-31') throw new Error(`Expected 2026-07-31, got ${iso}`);
    }
  },
  {
    name: 'Card expiry format "02/2028" (leap year) normalizes to end of Feb 2028',
    run: () => {
      const iso = formatToIsoDate('02/2028');
      if (iso !== '2028-02-29') throw new Error(`Expected 2028-02-29, got ${iso}`);
    }
  },

  // 4. Day / Month Ambiguity & Country Context
  {
    name: 'Unambiguous day: "25/06/2025" correctly parsed as June 25, 2025',
    run: () => {
      const iso = formatToIsoDate('25/06/2025');
      if (iso !== '2025-06-25') throw new Error(`Expected 2025-06-25, got ${iso}`);
    }
  },
  {
    name: 'Ambiguous date "05/09/2026": defaults to DD/MM/YYYY for India (9th May)',
    run: () => {
      const iso = formatToIsoDate('05/09/2026', 'India');
      if (iso !== '2026-09-05') throw new Error(`Expected 2026-09-05, got ${iso}`);
    }
  },
  {
    name: 'Ambiguous date "05/09/2026": respects US country context MM/DD/YYYY (May 9th)',
    run: () => {
      const iso = formatToIsoDate('05/09/2026', 'United States');
      if (iso !== '2026-05-09') throw new Error(`Expected 2026-05-09, got ${iso}`);
    }
  },

  // 5. Document Type Expiry Requirement
  {
    name: 'No-expiry documents (Aadhaar, Birth Certificate, Voter ID, Degree) require no expiry',
    run: () => {
      if (doesDocumentTypeRequireExpiry('aadhaar')) throw new Error('Aadhaar should not require expiry');
      if (doesDocumentTypeRequireExpiry('birth_certificate')) throw new Error('Birth certificate should not require expiry');
      if (doesDocumentTypeRequireExpiry('voter_id')) throw new Error('Voter ID should not require expiry');
      if (doesDocumentTypeRequireExpiry('academic_transcript')) throw new Error('Transcript should not require expiry');
    }
  },
  {
    name: 'Expiry-required documents (Drivers License, Passport, Insurance, Permit) require expiry',
    run: () => {
      if (!doesDocumentTypeRequireExpiry('drivers_license')) throw new Error('Drivers license must require expiry');
      if (!doesDocumentTypeRequireExpiry('passport_renewal')) throw new Error('Passport must require expiry');
      if (!doesDocumentTypeRequireExpiry('insurance_policy')) throw new Error('Insurance must require expiry');
      if (!doesDocumentTypeRequireExpiry('work_permit_visa')) throw new Error('Visa must require expiry');
    }
  },

  // 6. Decision Engine Evaluation for Driving License with Validity (NT)
  {
    name: 'Driving license with "Validity (NT): 20-JUL-2046" resolves to READY_FOR_REMINDER',
    run: () => {
      const result = evaluateDocumentDecision(
        'drivers_license',
        {
          name: "Driver's License",
          expiry_date: '20-JUL-2046',
          expiry_date_label: 'Validity (NT)',
          issuing_authority: 'Transport Dept'
        },
        0.95
      );
      if (result.decision !== 'READY_FOR_REMINDER') {
        throw new Error(`Expected READY_FOR_REMINDER, got ${result.decision}: ${result.explanation}`);
      }
    }
  },

  // 7. Decision Engine Evaluation for Utility Bill / Invoice with Payment Due Date
  {
    name: 'Utility Bill with "Payment Due Date: 2026-11-15" resolves to READY_FOR_REMINDER',
    run: () => {
      const result = evaluateDocumentDecision(
        'utility_bills',
        {
          name: 'Electricity Bill',
          expiry_date: '2026-11-15',
          expiry_date_label: 'Payment Due Date',
          issuing_authority: 'Power Corp'
        },
        0.95
      );
      if (result.decision !== 'READY_FOR_REMINDER') {
        throw new Error(`Expected READY_FOR_REMINDER, got ${result.decision}: ${result.explanation}`);
      }
    }
  },

  // 8. Decision Engine Evaluation for Expired Document
  {
    name: 'Expired document (e.g. 2020-01-01) resolves to EXPIRED_REQUIRES_CONFIRMATION',
    run: () => {
      const result = evaluateDocumentDecision(
        'insurance_policy',
        {
          name: 'Car Insurance',
          expiry_date: '2020-01-01',
          expiry_date_label: 'Valid Through',
          issuing_authority: 'Geico'
        },
        0.95
      );
      if (result.decision !== 'EXPIRED_REQUIRES_CONFIRMATION') {
        throw new Error(`Expected EXPIRED_REQUIRES_CONFIRMATION, got ${result.decision}`);
      }
    }
  },

  // 9. Decision Engine Evaluation for Aadhaar / Birth Certificate (No Expiry -> Auto Save)
  {
    name: 'Non-expiry document with null expiry_date resolves to NO_EXPIRY_AUTO_SAVE',
    run: () => {
      const result = evaluateDocumentDecision(
        'aadhaar',
        {
          name: 'Aadhaar Card',
          expiry_date: null,
          expiry_date_label: null,
          issuing_authority: 'UIDAI'
        },
        0.95
      );
      if (result.decision !== 'NO_EXPIRY_AUTO_SAVE') {
        throw new Error(`Expected NO_EXPIRY_AUTO_SAVE, got ${result.decision}`);
      }
    }
  },

  // 10. Missing Expiry on Required Document
  {
    name: 'Missing expiry on Passport resolves to MISSING_REQUIRED_INFORMATION',
    run: () => {
      const result = evaluateDocumentDecision(
        'passport_renewal',
        {
          name: 'Passport',
          expiry_date: null,
          issuing_authority: 'Passport Office'
        },
        0.95
      );
      if (result.decision !== 'MISSING_REQUIRED_INFORMATION') {
        throw new Error(`Expected MISSING_REQUIRED_INFORMATION, got ${result.decision}`);
      }
    }
  }
];

let passed = 0;
let failed = 0;
console.log('--- Running Expiry/Validity Date Extraction & Normalization Test Suite ---');
for (const test of tests) {
  try {
    test.run();
    console.log(`  ✓ PASS: ${test.name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ FAIL: ${test.name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log(`\nTest results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL EXPIRY & VALIDITY EXTRACTION AND NORMALIZATION TESTS PASSED!\n');
}
