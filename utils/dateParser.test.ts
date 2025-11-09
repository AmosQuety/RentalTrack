// utils/dateParser.test.ts
import { DateParser } from './dateParser';

console.log('🧪 Testing Date Parser...');

const testCases = [
  { input: '25/12/2024', expected: '2024-12-25', description: 'Standard DD/MM/YYYY' },
  { input: '25-12-2024', expected: '2024-12-25', description: 'DD-MM-YYYY with dashes' },
  { input: '25 12 2024', expected: '2024-12-25', description: 'DD MM YYYY with spaces' },
  { input: '5/7/24', expected: '2024-07-05', description: 'D/M/YY shorthand' },
  { input: '25122024', expected: '2024-12-25', description: 'DDMMYYYY no separators' },
  { input: '25/12', expected: '2024-12-25', description: 'DD/MM with current year' },
  { input: '1/1/2025', expected: '2025-01-01', description: 'Single digit day/month' },
];

testCases.forEach(({ input, expected, description }) => {
  const result = DateParser.parseUserInput(input);
  const passed = result.isoDate === expected;
  
  console.log(
    passed ? '✅' : '❌',
    description,
    passed ? '' : `| Expected: ${expected}, Got: ${result.isoDate}`
  );
});