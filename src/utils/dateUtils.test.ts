import assert from 'node:assert';
import { isTaskOverdue } from './dateUtils.ts';

console.log('--- Running Remonk Reminder isTaskOverdue Test Suite ---');

// Fixed test clock anchor: October 8, 2026
// In UTC: 2026-10-08T10:12:00.000Z corresponds to 3:42 PM in Asia/Kolkata (+05:30)
// For simplicity, let's establish exact ISO timestamps:
const OCT_08_2026_START_2_42_PM = '2026-10-08T14:42:00.000Z';
const OCT_08_2026_TIME_2_43_PM  = new Date('2026-10-08T14:43:00.000Z').getTime();
const OCT_08_2026_TIME_3_41_PM  = new Date('2026-10-08T15:41:00.000Z').getTime();
const OCT_08_2026_TIME_3_42_PM  = new Date('2026-10-08T15:42:00.000Z').getTime();
const OCT_08_2026_TIME_3_43_PM  = new Date('2026-10-08T15:43:00.000Z').getTime();
const OCT_08_2026_DUE_3_42_PM   = '2026-10-08T15:42:00.000Z';

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

// 1. Current time 2:43 PM, due time 3:42 PM -> Not overdue
runTest('Current time 2:43 PM, due time 3:42 PM -> Not overdue', () => {
  const task = {
    status: 'pending',
    start_time: OCT_08_2026_START_2_42_PM,
    due_date: OCT_08_2026_DUE_3_42_PM,
  };
  const result = isTaskOverdue(task, '2026-10-08', OCT_08_2026_TIME_2_43_PM);
  assert.strictEqual(result, false, 'Expected task not to be overdue at 2:43 PM');
});

// 2. Current time 3:41 PM, due time 3:42 PM -> Not overdue
runTest('Current time 3:41 PM, due time 3:42 PM -> Not overdue', () => {
  const task = {
    status: 'pending',
    start_time: OCT_08_2026_START_2_42_PM,
    due_date: OCT_08_2026_DUE_3_42_PM,
  };
  const result = isTaskOverdue(task, '2026-10-08', OCT_08_2026_TIME_3_41_PM);
  assert.strictEqual(result, false, 'Expected task not to be overdue at 3:41 PM');
});

// 3. Current time exactly 3:42 PM -> Not overdue under chosen strict boundary rule
runTest('Current time exactly 3:42 PM -> Not overdue under strict boundary rule', () => {
  const task = {
    status: 'pending',
    start_time: OCT_08_2026_START_2_42_PM,
    due_date: OCT_08_2026_DUE_3_42_PM,
  };
  const result = isTaskOverdue(task, '2026-10-08', OCT_08_2026_TIME_3_42_PM);
  assert.strictEqual(result, false, 'Expected task not to be overdue at exactly due time');
});

// 4. Current time 3:43 PM, due time 3:42 PM -> Overdue
runTest('Current time 3:43 PM, due time 3:42 PM -> Overdue', () => {
  const task = {
    status: 'pending',
    start_time: OCT_08_2026_START_2_42_PM,
    due_date: OCT_08_2026_DUE_3_42_PM,
  };
  const result = isTaskOverdue(task, '2026-10-08', OCT_08_2026_TIME_3_43_PM);
  assert.strictEqual(result, true, 'Expected task to be overdue at 3:43 PM');
});

// 5. Due date is tomorrow -> Not overdue
runTest('Due date is tomorrow (timestamp) -> Not overdue', () => {
  const task = {
    status: 'pending',
    due_date: '2026-10-09T15:42:00.000Z',
  };
  const result = isTaskOverdue(task, '2026-10-08', OCT_08_2026_TIME_2_43_PM);
  assert.strictEqual(result, false);
});

runTest('Due date is tomorrow (date-only) -> Not overdue', () => {
  const task = {
    status: 'pending',
    due_date: '2026-10-09',
  };
  const result = isTaskOverdue(task, '2026-10-08', OCT_08_2026_TIME_2_43_PM);
  assert.strictEqual(result, false);
});

// 6. Due date was yesterday -> Overdue if task remains active
runTest('Due date was yesterday (timestamp) -> Overdue if active', () => {
  const task = {
    status: 'pending',
    due_date: '2026-10-07T15:42:00.000Z',
  };
  const result = isTaskOverdue(task, '2026-10-08', OCT_08_2026_TIME_2_43_PM);
  assert.strictEqual(result, true);
});

runTest('Due date was yesterday (date-only) -> Overdue if active', () => {
  const task = {
    status: 'pending',
    due_date: '2026-10-07',
  };
  const result = isTaskOverdue(task, '2026-10-08', OCT_08_2026_TIME_2_43_PM);
  assert.strictEqual(result, true);
});

// 7. Task completed before due time -> Never overdue
runTest('Task completed before due time -> Never overdue', () => {
  const task = {
    status: 'completed',
    start_time: OCT_08_2026_START_2_42_PM,
    due_date: OCT_08_2026_DUE_3_42_PM,
  };
  assert.strictEqual(isTaskOverdue(task, '2026-10-08', OCT_08_2026_TIME_2_43_PM), false);
  assert.strictEqual(isTaskOverdue(task, '2026-10-08', OCT_08_2026_TIME_3_43_PM), false);
});

// 8. Task cancelled or rejected -> Never overdue
runTest('Task cancelled or rejected -> Never overdue', () => {
  const cancelledTask = {
    status: 'cancelled',
    due_date: '2026-10-07T10:00:00.000Z',
  };
  const rejectedTask = {
    status: 'rejected',
    due_date: '2026-10-07T10:00:00.000Z',
  };
  assert.strictEqual(isTaskOverdue(cancelledTask, '2026-10-08', OCT_08_2026_TIME_3_43_PM), false);
  assert.strictEqual(isTaskOverdue(rejectedTask, '2026-10-08', OCT_08_2026_TIME_3_43_PM), false);
});

// 9. Due time edited from past to future -> No longer overdue
runTest('Due time edited from past to future -> No longer overdue', () => {
  const taskWithPersistedOverdue = {
    status: 'overdue',
    consecutive_missed_days: 2,
    due_date: '2026-10-09T10:00:00.000Z', // edited to tomorrow
  };
  const result = isTaskOverdue(taskWithPersistedOverdue, '2026-10-08', OCT_08_2026_TIME_2_43_PM);
  assert.strictEqual(result, false, 'Persisted overdue status must not override future due timestamp');
});

// 10. Same instant represented in UTC and local time -> Identical classification
runTest('Same instant represented in UTC and local time -> Identical classification', () => {
  const taskUtc = {
    status: 'pending',
    due_date: '2026-10-08T10:12:00.000Z',
  };
  const taskLocal = {
    status: 'pending',
    due_date: '2026-10-08T15:42:00.000+05:30',
  };

  const beforeInstant = new Date('2026-10-08T10:11:00.000Z').getTime();
  const atInstant     = new Date('2026-10-08T10:12:00.000Z').getTime();
  const afterInstant  = new Date('2026-10-08T10:13:00.000Z').getTime();

  assert.strictEqual(isTaskOverdue(taskUtc, '2026-10-08', beforeInstant), isTaskOverdue(taskLocal, '2026-10-08', beforeInstant));
  assert.strictEqual(isTaskOverdue(taskUtc, '2026-10-08', atInstant), isTaskOverdue(taskLocal, '2026-10-08', atInstant));
  assert.strictEqual(isTaskOverdue(taskUtc, '2026-10-08', afterInstant), isTaskOverdue(taskLocal, '2026-10-08', afterInstant));

  assert.strictEqual(isTaskOverdue(taskUtc, '2026-10-08', beforeInstant), false);
  assert.strictEqual(isTaskOverdue(taskUtc, '2026-10-08', atInstant), false);
  assert.strictEqual(isTaskOverdue(taskUtc, '2026-10-08', afterInstant), true);
});

// 11. Existing task without optional start-time fields -> No crash or regression
runTest('Existing task without optional start-time fields -> No crash or regression', () => {
  const legacyPast = { status: 'pending', task_date: '2026-10-07' };
  const legacyFuture = { status: 'pending', task_date: '2026-10-09' };
  const legacyToday = { status: 'pending', task_date: '2026-10-08' };
  const legacyOverdue = { status: 'overdue', consecutive_missed_days: 1 };
  const legacyEmpty = { status: 'pending' };

  assert.strictEqual(isTaskOverdue(legacyPast, '2026-10-08', OCT_08_2026_TIME_2_43_PM), true);
  assert.strictEqual(isTaskOverdue(legacyFuture, '2026-10-08', OCT_08_2026_TIME_2_43_PM), false);
  assert.strictEqual(isTaskOverdue(legacyToday, '2026-10-08', OCT_08_2026_TIME_2_43_PM), false);
  assert.strictEqual(isTaskOverdue(legacyOverdue, '2026-10-08', OCT_08_2026_TIME_2_43_PM), true);
  assert.strictEqual(isTaskOverdue(legacyEmpty, '2026-10-08', OCT_08_2026_TIME_2_43_PM), false);
  assert.strictEqual(isTaskOverdue(null, '2026-10-08', OCT_08_2026_TIME_2_43_PM), false);
  assert.strictEqual(isTaskOverdue(undefined, '2026-10-08', OCT_08_2026_TIME_2_43_PM), false);
});

// 12. Screenshot reproduction verification
runTest('Screenshot task reproduction: start 2:42 PM, due 3:42 PM, checked at 2:43 PM', () => {
  const screenshotTask = {
    id: 'test-screenshot-task',
    title: 'Hi',
    status: 'pending',
    start_time: '2026-10-08T14:42:00.000+05:30',
    due_date: '2026-10-08T15:42:00.000+05:30',
    consecutive_missed_days: 0,
    task_date: '2026-10-08',
  };

  const phoneClock2_43_PM = new Date('2026-10-08T14:43:00.000+05:30').getTime();
  assert.strictEqual(
    isTaskOverdue(screenshotTask, '2026-10-08', phoneClock2_43_PM),
    false,
    'Screenshot task MUST NOT be marked Overdue at 2:43 PM'
  );

  const phoneClock3_41_PM = new Date('2026-10-08T15:41:00.000+05:30').getTime();
  assert.strictEqual(isTaskOverdue(screenshotTask, '2026-10-08', phoneClock3_41_PM), false);

  const phoneClock3_42_PM = new Date('2026-10-08T15:42:00.000+05:30').getTime();
  assert.strictEqual(isTaskOverdue(screenshotTask, '2026-10-08', phoneClock3_42_PM), false);

  const phoneClock3_43_PM = new Date('2026-10-08T15:43:00.000+05:30').getTime();
  assert.strictEqual(isTaskOverdue(screenshotTask, '2026-10-08', phoneClock3_43_PM), true);
});

// 13. CamelCase property support (Firestore raw objects)
runTest('Firestore camelCase property support (startTime, dueDate, consecutiveMissedDays)', () => {
  const fsTask = {
    status: 'pending',
    startTime: OCT_08_2026_START_2_42_PM,
    dueDate: OCT_08_2026_DUE_3_42_PM,
  };
  assert.strictEqual(isTaskOverdue(fsTask, '2026-10-08', OCT_08_2026_TIME_2_43_PM), false);
  assert.strictEqual(isTaskOverdue(fsTask, '2026-10-08', OCT_08_2026_TIME_3_43_PM), true);
});

// 14. Separate due_date and due_time fields combined with timezone (12h and 24h formats)
runTest('Separate due_date and due_time fields combined in Asia/Kolkata timezone (12h format "3:42 PM")', () => {
  const task = {
    status: 'pending',
    due_date: '2026-10-08',
    due_time: '3:42 PM',
    timezone: 'Asia/Kolkata',
  };
  // In Asia/Kolkata (+05:30), 15:42 is 10:12:00 UTC
  const time2_43_PM = new Date('2026-10-08T14:43:00.000+05:30').getTime();
  const time3_41_PM = new Date('2026-10-08T15:41:00.000+05:30').getTime();
  const time3_42_PM = new Date('2026-10-08T15:42:00.000+05:30').getTime();
  const time3_43_PM = new Date('2026-10-08T15:43:00.000+05:30').getTime();

  assert.strictEqual(isTaskOverdue(task, '2026-10-08', time2_43_PM), false, 'Not overdue at 2:43 PM');
  assert.strictEqual(isTaskOverdue(task, '2026-10-08', time3_41_PM), false, 'Not overdue at 3:41 PM');
  assert.strictEqual(isTaskOverdue(task, '2026-10-08', time3_42_PM), false, 'Not overdue at exactly 3:42 PM');
  assert.strictEqual(isTaskOverdue(task, '2026-10-08', time3_43_PM), true, 'Overdue after 3:42 PM');
});

runTest('Separate dueDate and dueTime fields combined in America/New_York timezone (24h format "15:42")', () => {
  const task = {
    status: 'pending',
    dueDate: '2026-10-08',
    dueTime: '15:42',
    timezone: 'America/New_York',
  };
  // In America/New_York (-04:00), 15:42 is 19:42:00 UTC
  const timeBefore = new Date('2026-10-08T15:41:00.000-04:00').getTime();
  const timeAt     = new Date('2026-10-08T15:42:00.000-04:00').getTime();
  const timeAfter  = new Date('2026-10-08T15:43:00.000-04:00').getTime();

  assert.strictEqual(isTaskOverdue(task, '2026-10-08', timeBefore), false, 'Not overdue before 3:42 PM EDT');
  assert.strictEqual(isTaskOverdue(task, '2026-10-08', timeAt), false, 'Not overdue at 3:42 PM EDT');
  assert.strictEqual(isTaskOverdue(task, '2026-10-08', timeAfter), true, 'Overdue after 3:42 PM EDT');
});

// 15. Fallback for legacy tasks without due_date: never use start_time alone to mark overdue
runTest('Legacy task without due_date: start_time alone NEVER marks active task as overdue', () => {
  const legacyActiveTask = {
    status: 'pending',
    start_time: '2026-10-08T14:42:00.000Z',
    task_date: '2026-10-08',
  };
  // Current time is 2:43 PM (after start_time 2:42 PM)
  const resultAt2_43 = isTaskOverdue(legacyActiveTask, '2026-10-08', OCT_08_2026_TIME_2_43_PM);
  assert.strictEqual(resultAt2_43, false, 'Active legacy task without due_date must preserve pending status');

  const resultAt3_43 = isTaskOverdue(legacyActiveTask, '2026-10-08', OCT_08_2026_TIME_3_43_PM);
  assert.strictEqual(resultAt3_43, false, 'Active legacy task without due_date must remain pending during today');
});

console.log(`\nTest results: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL REQUIRED BOUNDARY AND REGRESSION TEST CASES PASSED!\n');
}
