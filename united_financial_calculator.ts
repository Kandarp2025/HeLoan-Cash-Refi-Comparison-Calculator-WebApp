export interface CalculatorInputs {
  homeValue: number;
  currentMortgageBalance: number;
  cashRefiRate15: number;
  cashRefiRate30: number;
  cashRefiFeePercent: number;
  cashRefiFlatFee: number;
  heloanAmount: number;
  heloanRate: number;
  heloanRepaymentYears: number;
  heloanFeePercent: number;
  heloanFlatFee: number;
}

export interface ComparisonRow {
  scenario: string;
  cashReceived: number;
  loanBalance: number;
  monthlyPayment: number;
  interestRate: number;
  apr: number;
}

export interface CalculatorResult {
  maxAvailableCash: number;
  matchedCashAmount: number;
  heloan: ComparisonRow;
  cashRefi15: ComparisonRow;
  cashRefi30: ComparisonRow;
}

export interface CustomerRecordFormModel {
  id: string;
  name: string;
  email: string;
  phone: string;
  homeValue: number;
  currentMortgageBalance: number;
  cashoutAmount: number;
  cashRefiRate15: number;
  cashRefiRate30: number;
  heloanRate: number;
  heloanRepaymentYears: number;
  cashRefiFeePercent: number;
  heloanFeePercent: number;
  heloanFlatFee: number;
  cashRefiFlatFee: number;
  webhookResponse: Record<string, unknown>;
}

export interface CustomerRecordUpdatePayload {
  name: string;
  email: string;
  phone: string;
  inputData: Record<string, number>;
  normalizedData: Record<string, string>;
  calculationResult: Record<string, unknown>;
  webhookResponse: Record<string, unknown>;
}

export function monthlyPayment(principal: number, annualRate: number, years: number): number {
  const monthlyRate = annualRate / 100 / 12;
  const n = years * 12;
  if (!principal || !n) return 0;
  if (monthlyRate === 0) return principal / n;
  return (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) /
    (Math.pow(1 + monthlyRate, n) - 1);
}

export function calculateAPR(loanAmount: number, payment: number, months: number, fees: number): number {
  const amountReceived = loanAmount - fees;
  let low = 0;
  let high = 1;

  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    let pv = 0;

    for (let t = 1; t <= months; t++) {
      pv += payment / Math.pow(1 + mid / 12, t);
    }

    if (pv > amountReceived) low = mid;
    else high = mid;
  }

  return ((low + high) / 2) * 100;
}

export function maxCashOut(homeValue: number, currentBalance: number, maxCltv = 1500): number {
  const maxLoan = homeValue * (maxCltv / 100);
  return Math.max(maxLoan - currentBalance, 0);
}

export function calculateComparison(inputs: CalculatorInputs): CalculatorResult {
  const maxAvailableCash = maxCashOut(inputs.homeValue, inputs.currentMortgageBalance, 150);
  const matchedCashAmount = Math.min(inputs.heloanAmount, maxAvailableCash);

  const estimatedBaseNewLoanBalance = inputs.currentMortgageBalance + matchedCashAmount;
  const cashRefiFees = estimatedBaseNewLoanBalance * (inputs.cashRefiFeePercent / 100) + inputs.cashRefiFlatFee;
  const cashRefiLoanBalance = estimatedBaseNewLoanBalance + cashRefiFees;

  const cashRefi15Payment = monthlyPayment(cashRefiLoanBalance, inputs.cashRefiRate15, 15);
  const cashRefi30Payment = monthlyPayment(cashRefiLoanBalance, inputs.cashRefiRate30, 30);
  const cashRefi15Apr = calculateAPR(cashRefiLoanBalance, cashRefi15Payment, 15 * 12, cashRefiFees);
  const cashRefi30Apr = calculateAPR(cashRefiLoanBalance, cashRefi30Payment, 30 * 12, cashRefiFees);

  const heloanFees = matchedCashAmount * (inputs.heloanFeePercent / 100) + inputs.heloanFlatFee;
  const heloanLoanBalance = matchedCashAmount + heloanFees;
  const heloanPayment = monthlyPayment(heloanLoanBalance, inputs.heloanRate, inputs.heloanRepaymentYears);
  const heloanApr = calculateAPR(heloanLoanBalance, heloanPayment, inputs.heloanRepaymentYears * 12, heloanFees);

  return {
    maxAvailableCash,
    matchedCashAmount,
    heloan: {
      scenario: `HELOAN ${inputs.heloanRepaymentYears}-Year`,
      cashReceived: matchedCashAmount,
      loanBalance: heloanLoanBalance,
      monthlyPayment: heloanPayment,
      interestRate: inputs.heloanRate,
      apr: heloanApr,
    },
    cashRefi15: {
      scenario: "Cash Refi 15-Year",
      cashReceived: matchedCashAmount,
      loanBalance: cashRefiLoanBalance,
      monthlyPayment: cashRefi15Payment,
      interestRate: inputs.cashRefiRate15,
      apr: cashRefi15Apr,
    },
    cashRefi30: {
      scenario: "Cash Refi 30-Year",
      cashReceived: matchedCashAmount,
      loanBalance: cashRefiLoanBalance,
      monthlyPayment: cashRefi30Payment,
      interestRate: inputs.cashRefiRate30,
      apr: cashRefi30Apr,
    },
  };
}

function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    const normalized = value
      .trim()
      .replace(/[$,%\s]/g, "")
      .replace(/,/g, "");
    if (!normalized) return fallback;
    const parsedFromString = Number(normalized);
    return Number.isFinite(parsedFromString) ? parsedFromString : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readValue(source: Record<string, unknown> | null | undefined, keys: string[], fallback: unknown = ""): unknown {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
  }
  return fallback;
}

function readByPriority(record: Record<string, unknown>, keys: string[], fallback: unknown = ""): unknown {
  const inputData = (record.inputData as Record<string, unknown>) || null;
  const normalizedData = (record.normalizedData as Record<string, unknown>) || null;
  const webhookResponse = (record.webhookResponse as Record<string, unknown>) || null;

  const fromNormalized = readValue(normalizedData, keys, undefined);
  if (fromNormalized !== undefined) return fromNormalized;
  const fromInput = readValue(inputData, keys, undefined);
  if (fromInput !== undefined) return fromInput;
  const fromRoot = readValue(record, keys, undefined);
  if (fromRoot !== undefined) return fromRoot;
  const fromWebhook = readValue(webhookResponse, keys, undefined);
  if (fromWebhook !== undefined) return fromWebhook;
  return fallback;
}

export function mapApiRecordToFormModel(record: Record<string, unknown>): CustomerRecordFormModel {
  const inputData = (record.inputData as Record<string, unknown>) || {};
  const normalizedData = (record.normalizedData as Record<string, unknown>) || {};
  const heloanTermKeys: Array<{ years: number; key: string }> = [
    { years: 10, key: "HELOAN 10 years" },
    { years: 15, key: "HELOAN 15 years" },
    { years: 20, key: "HELOAN 20 years" },
    { years: 30, key: "HELOAN 30 years" },
  ];
  let detectedHeloanYears = safeNumber(readByPriority(record, ["heloanRepaymentYears"], 0), 0);
  let detectedHeloanRate = safeNumber(readByPriority(record, ["heloanRate"], 0), 0);
  for (const term of heloanTermKeys) {
    const value = readByPriority(record, [term.key], undefined);
    if (value !== undefined && value !== null && value !== "") {
      detectedHeloanYears = term.years;
      detectedHeloanRate = safeNumber(value, detectedHeloanRate);
      break;
    }
  }

  return {
    id: String(readValue(record, ["id", "_id"], "")),
    name: String(readValue(record, ["name", "Name"], readValue(inputData, ["name", "Name"], ""))),
    email: String(readValue(record, ["email", "Email"], readValue(inputData, ["email", "Email"], ""))),
    phone: String(readValue(record, ["phone", "Phone"], readValue(inputData, ["phone", "Phone"], ""))),
    homeValue: safeNumber(readValue(normalizedData, ["homeValue"], 0), 0),
    currentMortgageBalance: safeNumber(readByPriority(record, ["currentMortgageBalance", "Current Mortgage Balance"], 0), 0),
    cashoutAmount: safeNumber(readValue(inputData, ["Cashout or HELOAN Amt"], 0), 0),
    cashRefiRate15: safeNumber(readByPriority(record, ["cashRefiRate15", "Cash refi 15 yr interest rate"], 0), 0),
    cashRefiRate30: safeNumber(readByPriority(record, ["cashRefiRate30", "Cash refi 30 yr interest rate"], 0), 0),
    heloanRate: detectedHeloanRate,
    heloanRepaymentYears: detectedHeloanYears,
    cashRefiFeePercent: safeNumber(readValue(inputData, ["Fee"], 0), 0),
    heloanFeePercent: safeNumber(readValue(inputData, ["Fee"], 0), 0),
    heloanFlatFee: safeNumber(readByPriority(record, ["heloanFlatFee", "HELOAN Flat Fee"], 0), 0),
    cashRefiFlatFee: safeNumber(readByPriority(record, ["cashRefiFlatFee", "Cash Refi Flat Fee"], 0), 0),
    webhookResponse: (record.webhookResponse as Record<string, unknown>) || {},
  };
}

export function buildCustomerRecordUpdatePayload(
  formModel: CustomerRecordFormModel,
  calculationResult: Record<string, unknown>,
): CustomerRecordUpdatePayload {
  return {
    name: formModel.name || "",
    email: formModel.email || "",
    phone: formModel.phone || "",
    inputData: {
      homeValue: formModel.homeValue,
      currentMortgageBalance: formModel.currentMortgageBalance,
      cashoutAmount: formModel.cashoutAmount,
      cashRefiRate15: formModel.cashRefiRate15,
      cashRefiRate30: formModel.cashRefiRate30,
      heloanRate: formModel.heloanRate,
      heloanRepaymentYears: formModel.heloanRepaymentYears,
      cashRefiFeePercent: formModel.cashRefiFeePercent,
      heloanFeePercent: formModel.heloanFeePercent,
      heloanFlatFee: formModel.heloanFlatFee,
      cashRefiFlatFee: formModel.cashRefiFlatFee,
    },
    normalizedData: {
      id: formModel.id || "",
      name: formModel.name || "",
      email: formModel.email || "",
      phone: formModel.phone || "",
      homeValue: String(formModel.homeValue || 0),
      currentMortgageBalance: String(formModel.currentMortgageBalance || 0),
      cashoutAmount: String(formModel.cashoutAmount || 0),
      cashRefiRate15: String(formModel.cashRefiRate15 || 0),
      cashRefiRate30: String(formModel.cashRefiRate30 || 0),
      heloanRate: String(formModel.heloanRate || 0),
      heloanRepaymentYears: String(formModel.heloanRepaymentYears || 0),
      cashRefiFeePercent: String(formModel.cashRefiFeePercent || 0),
      heloanFeePercent: String(formModel.heloanFeePercent || 0),
      heloanFlatFee: String(formModel.heloanFlatFee || 0),
      cashRefiFlatFee: String(formModel.cashRefiFlatFee || 0),
    },
    calculationResult: calculationResult || {},
    webhookResponse: formModel.webhookResponse || {},
  };
}
