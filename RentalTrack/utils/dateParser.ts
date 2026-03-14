// utils/dateParser.ts

export interface ParseResult {
  isValid: boolean;
  isoDate: string; // YYYY-MM-DD
  displayDate: string; // DD/MM/YYYY  
  error?: string;
  dateObject?: Date;
}

export class DateParser {
  static parseUserInput(input: string): ParseResult {
    try {
      // Step 1: Clean input
      const cleaned = this.cleanInput(input);
      if (!cleaned) {
        return this.invalidResult("Please enter a date");
      }

      // Step 2: Extract tokens
      const tokens = this.extractTokens(cleaned);
      if (tokens.length === 0) {
        return this.invalidResult("Please enter a valid date");
      }

      // Step 3: Normalize tokens to [day, month, year]
      const normalized = this.normalizeTokens(tokens);
      if (!normalized) {
        return this.invalidResult("Invalid date format");
      }

      const [day, month, year] = normalized;

      // Step 4: Validate components
      const validation = this.validateComponents(day, month, year);
      if (!validation.isValid) {
        return this.invalidResult(validation.error!);
      }

      // Step 5: Create and validate final date
      const finalDate = new Date(year, month - 1, day);
      if (!this.isValidDate(finalDate)) {
        return this.invalidResult("Invalid date - please check day and month");
      }

      // Step 6: Return success
      return this.validResult(finalDate, day, month, year);

    } catch (error) {
      return this.invalidResult("An error occurred while parsing the date");
    }
  }

  private static cleanInput(input: string): string {
    return input
      .trim()
      .replace(/[^\d/\-\s]/g, '') // Remove non-numeric except /, -, space
      .replace(/\s+/g, ' ');      // Collapse multiple spaces
  }

  private static extractTokens(input: string): string[] {
    // Try splitting by common separators
    if (input.includes('/') || input.includes('-') || input.includes(' ')) {
      return input.split(/[/\-\s]/);
    }

    // No separators - try to parse as DDMMYYYY or DDMMYY
    if (input.length === 8 || input.length === 6) {
      const day = input.substring(0, 2);
      const month = input.substring(2, 4);
      const year = input.length === 8 ? input.substring(4, 8) : input.substring(4, 6);
      return [day, month, year];
    }

    return [];
  }

  private static normalizeTokens(tokens: string[]): [string, string, string] | null {
    if (tokens.length < 2) return null;

    let day = tokens[0];
    let month = tokens[1];
    let year = tokens[2] || '';

    // Handle month names
    month = this.normalizeMonth(month);
    if (!month) return null;

    // Pad single digits
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');

    // Handle year
    year = this.normalizeYear(year);

    return [day, month, year];
  }

  private static normalizeMonth(month: string): string {
    const monthNames: { [key: string]: string } = {
      'jan': '1', 'feb': '2', 'mar': '3', 'apr': '4', 'may': '5', 'jun': '6',
      'jul': '7', 'aug': '8', 'sep': '9', 'oct': '10', 'nov': '11', 'dec': '12'
    };

    const lowerMonth = month.toLowerCase();
    return monthNames[lowerMonth] || month;
  }

  private static normalizeYear(year: string): string {
    if (!year) {
      return new Date().getFullYear().toString();
    }

    if (year.length === 2) {
      const numYear = parseInt(year);
      return numYear <= 29 ? `20${year}` : `19${year}`;
    }

    return year;
  }

  private static validateComponents(day: string, month: string, year: string): 
    { isValid: boolean; error?: string } {
    
    const dayNum = parseInt(day);
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (dayNum < 1 || dayNum > 31) {
      return { isValid: false, error: "Day must be between 1 and 31" };
    }

    if (monthNum < 1 || monthNum > 12) {
      return { isValid: false, error: "Month must be between 1 and 12" };
    }

    if (yearNum < 1900 || yearNum > 2100) {
      return { isValid: false, error: "Year must be between 1900 and 2100" };
    }

    return { isValid: true };
  }

  private static isValidDate(date: Date): boolean {
    return date instanceof Date && !isNaN(date.getTime());
  }

  private static validResult(date: Date, day: string, month: string, year: string): ParseResult {
    const isoDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const displayDate = `${day}/${month}/${year}`;

    return {
      isValid: true,
      isoDate,
      displayDate,
      dateObject: date
    };
  }

  private static invalidResult(error: string): ParseResult {
    return {
      isValid: false,
      isoDate: '',
      displayDate: '',
      error
    };
  }
}