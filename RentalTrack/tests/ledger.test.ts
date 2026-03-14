import { calculateLedgerBalance, calculateStatusFromLedger, generateMissingRentCharges, LedgerEntry } from '../domain/ledger';

describe('Ledger Domain Functions', () => {
  describe('calculateLedgerBalance', () => {
    it('calculates balance correctly with integer enforcement', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const entries: LedgerEntry[] = [
        { tenant_id: 1, type: 'INITIAL_BALANCE', amount: 500, description: '', reference_date: '2023-01-01' },
        { tenant_id: 1, type: 'RENT_CHARGE', amount: 1000, description: '', reference_date: '2023-02-01' },
        { tenant_id: 1, type: 'PAYMENT', amount: 1500.5, description: '', reference_date: '2023-02-05' }, // Float should be rounded
        { tenant_id: 1, type: 'REVERSAL', amount: -200, description: '', reference_date: '2023-02-10' } // Should be added back (negative payment)
      ];

      // Math.round(1500.5) = 1501
      // 500 (initial) - 1000 (rent) + 1501 (payment) - 200 (reversal of payment)
      // = 500 - 1000 + 1501 - 200 = 801
      const balance = calculateLedgerBalance(entries);
      expect(balance).toBe(801);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not an integer'));
      warnSpy.mockRestore();
    });
  });

  describe('generateMissingRentCharges', () => {
    it('generates correct number of monthly charges', () => {
      // Last charge was Jan 1st. Target is April 15th. Expected charges: Feb 1, Mar 1, Apr 1.
      const charges = generateMissingRentCharges(
        1, 1000, 'monthly', '2023-01-01T00:00:00.000Z', '2023-04-15T00:00:00.000Z'
      );
      
      expect(charges.length).toBe(3);
      expect(charges[0].reference_date).toBe('2023-02-01');
      expect(charges[1].reference_date).toBe('2023-03-01');
      expect(charges[2].reference_date).toBe('2023-04-01');
      expect(charges[0].amount).toBe(1000);
    });

    it('generates biweekly charges properly', () => {
      // Jan 1 to Jan 20. Expected: Jan 15
      const charges = generateMissingRentCharges(
        1, 500, 'biweekly', '2023-01-01T00:00:00.000Z', '2023-01-20T00:00:00.000Z'
      );
      expect(charges.length).toBe(1);
      expect(charges[0].reference_date).toBe('2023-01-15');
    });
  });

  describe('calculateStatusFromLedger', () => {
    it('returns Overdue for negative balance', () => {
      expect(calculateStatusFromLedger(-100, '2023-12-01T00:00:00.000Z')).toBe('Overdue');
    });

    it('returns Due Soon when within 3 days', () => {
      const today = new Date('2023-05-10T12:00:00Z');
      expect(calculateStatusFromLedger(0, '2023-05-12T00:00:00.000Z', today)).toBe('Due Soon');
    });

    it('returns Paid when balance is positive or 0 and charge is far', () => {
      const today = new Date('2023-05-10T12:00:00Z');
      expect(calculateStatusFromLedger(500, '2023-05-25T00:00:00.000Z', today)).toBe('Paid');
    });
  });
});
