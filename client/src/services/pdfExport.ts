// ============================================================
// PDF Export Service - Generates professional PDFs for all modes
// Supports aligned (dual) currency display when toggled on
// ============================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { EmployeeResult, B2BResult, AllocationResult, PayslipResult, EmployeeIdentity } from '../types';

const DISCLAIMER = 'This calculator provides estimates based on current tax rules and rates. Results are for planning only and must be validated by a tax professional.';

// ============================================================
// TSG Logo mark for PDF headers
// Draws: red diamond + red right-arrow + black overlap triangle
// Coordinates based on a 200×120 SVG viewBox
// ============================================================
function drawTSGLogo(doc: jsPDF, x: number, y: number, w = 14, h = 10) {
  const sx = w / 200;
  const sy = h / 120;
  const px = (v: number) => x + v * sx;
  const py = (v: number) => y + v * sy;

  // Left red diamond (two triangles)
  doc.setFillColor(214, 0, 28);
  doc.triangle(px(0), py(60), px(50), py(10), px(100), py(60), 'F');
  doc.triangle(px(0), py(60), px(50), py(110), px(100), py(60), 'F');

  // Right red arrow: rectangular body + right tip + two left flanks
  doc.rect(px(94), py(12), (185 - 94) * sx, (108 - 12) * sy, 'F');
  doc.triangle(px(185), py(12), px(200), py(60), px(185), py(108), 'F');
  doc.triangle(px(70), py(12), px(94), py(12), px(94), py(60), 'F');
  doc.triangle(px(70), py(108), px(94), py(108), px(94), py(60), 'F');

  // Black overlap triangle on top
  doc.setFillColor(0, 0, 0);
  doc.triangle(px(70), py(30), px(94), py(60), px(70), py(90), 'F');
}

// ============================================================
// Aligned currency options passed to all PDF exports
// ============================================================
export interface PDFAlignedOptions {
  /** Whether the user toggled "Show aligned results" on */
  showAligned: boolean;
  /** The target currency to convert to (e.g. 'EUR') */
  alignmentCurrency: string;
  /** FX rates (RON-based) from the FX service */
  rates: Record<string, number>;
}

// ============================================================
// Helpers
// ============================================================

function formatNum(n: number): string {
  return n.toLocaleString('en-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function convertAmt(amount: number, from: string, to: string, rates: Record<string, number>): number {
  if (from === to) return amount;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return amount;
  return Math.round((amount / fromRate) * toRate * 100) / 100;
}

/** Format a value in base currency, and optionally append the aligned currency */
function fmtDual(
  amount: number,
  baseCurrency: string,
  aligned?: { show: boolean; currency: string; rates: Record<string, number> }
): string {
  const base = `${formatNum(amount)} ${baseCurrency}`;
  if (!aligned || !aligned.show || baseCurrency === aligned.currency) return base;
  const converted = convertAmt(amount, baseCurrency, aligned.currency, aligned.rates);
  return `${base}  (${formatNum(converted)} ${aligned.currency})`;
}

function addHeader(doc: jsPDF, title: string) {
  // TSG Logo
  drawTSGLogo(doc, 14, 9.5, 14, 10);

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('TSG', 31, 17);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Technology Staffing Group', 50, 17);

  // Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(45, 45, 45);
  doc.text(title, 14, 30);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB')}`, 14, 36);

  return 42;
}

function addDisclaimer(doc: jsPDF, y: number) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - 30) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(255, 248, 230);
  doc.rect(14, y, 182, 16, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(120, 100, 50);
  doc.text('Disclaimer: ' + DISCLAIMER, 16, y + 6, { maxWidth: 178 });
  return y + 20;
}

/** Add FX rate note when aligned currency is shown */
function addFXNote(doc: jsPDF, y: number, baseCurrency: string, aligned: { currency: string; rates: Record<string, number> }): number {
  const fromRate = aligned.rates[baseCurrency];
  const toRate = aligned.rates[aligned.currency];
  if (!fromRate || !toRate) return y;
  const rate = Math.round((toRate / fromRate) * 10000) / 10000;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 80, 170);
  doc.text(`Exchange rate: 1 ${baseCurrency} = ${rate.toFixed(4)} ${aligned.currency} (indicative, as of report date)`, 14, y);
  return y + 6;
}

/** Add employee identity section to PDF if fields are filled */
function addIdentitySection(doc: jsPDF, y: number, identity?: EmployeeIdentity): number {
  if (!identity) return y;
  const hasData = identity.employeeName || identity.dateOfBirth || identity.roleOrPosition;
  if (!hasData) return y;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(45, 45, 45);
  doc.text('Employee Details', 14, y);
  y += 5;

  const rows: string[][] = [];
  if (identity.employeeName) rows.push(['Name', identity.employeeName]);
  if (identity.dateOfBirth) rows.push(['Date of Birth', identity.dateOfBirth]);
  if (identity.roleOrPosition) rows.push(['Role / Position', identity.roleOrPosition]);

  autoTable(doc, {
    startY: y,
    body: rows,
    theme: 'grid',
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
    margin: { left: 14, right: 14 },
  });

  return (doc as any).lastAutoTable.finalY + 8;
}

const countryNames: Record<string, string> = { CH: 'Switzerland', RO: 'Romania', ES: 'Spain' };

// ============================================================
// EMPLOYEE MODE PDF
// ============================================================

export function exportEmployeePDF(
  result: EmployeeResult,
  inputs: any,
  identity?: EmployeeIdentity,
  alignedOptions?: PDFAlignedOptions,
) {
  const doc = new jsPDF();
  const cur = result.currency;
  const aligned = alignedOptions?.showAligned && alignedOptions.alignmentCurrency !== cur
    ? { show: true, currency: alignedOptions.alignmentCurrency, rates: alignedOptions.rates }
    : undefined;

  let y = addHeader(doc, 'Employee Mode - Salary Calculation');

  // FX rate note
  if (aligned) {
    y = addFXNote(doc, y, cur, aligned);
  }

  // Employee Identity
  y = addIdentitySection(doc, y, identity);

  // Input Summary
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(45, 45, 45);
  doc.text('Input Summary', 14, y);
  y += 6;

  const inputRows: string[][] = [
    ['Country', `${countryNames[result.country] || result.country} (${cur})`],
    ['Calculation Basis', inputs.calculationBasis],
    ['Occupation Rate', `${result.occupationRate}%`],
  ];

  if (inputs.calculationBasis === 'TOTAL_COST' && result.costEnvelope) {
    inputRows.push(['Client Daily Rate', fmtDual(result.costEnvelope.clientDailyRate, cur, aligned)]);
    inputRows.push(['Margin on Sales', `${result.costEnvelope.marginPercent}%`]);
    inputRows.push(['Working Days', `${result.costEnvelope.workingDays}`]);
  } else {
    inputRows.push(['Input Amount (100% FTE)', `${formatNum(inputs.amount)} ${cur} (${inputs.period})`]);
    if (result.occupationRate < 100 && result.effectiveAmountYearly) {
      inputRows.push(['Effective Amount (Yearly)', fmtDual(result.effectiveAmountYearly, cur, aligned)]);
    }
  }

  if (aligned) {
    inputRows.push(['Aligned Currency', aligned.currency]);
  }

  autoTable(doc, {
    startY: y,
    head: [['Parameter', 'Value']],
    body: inputRows,
    theme: 'grid',
    headStyles: { fillColor: [45, 45, 45] },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Cost Envelope (TOTAL_COST mode with client rate)
  if (result.costEnvelope) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Cost Envelope', 14, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: [
        ['Client Daily Rate', fmtDual(result.costEnvelope.clientDailyRate, cur, aligned)],
        ['Working Days', `${result.costEnvelope.workingDays}`],
        ['Annual Revenue', fmtDual(result.costEnvelope.annualRevenue, cur, aligned)],
        [`Margin (${result.costEnvelope.marginPercent}%)`, fmtDual(result.costEnvelope.marginAmount, cur, aligned)],
        ['Total Employer Cost Envelope', fmtDual(result.costEnvelope.totalEmployerCostEnvelope, cur, aligned)],
        ['Daily Cost Rate', fmtDual(result.costEnvelope.dailyCostRate, cur, aligned)],
        ['Daily Margin', fmtDual(result.costEnvelope.dailyMargin, cur, aligned)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [46, 134, 193] },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Business Metrics (GROSS/NET modes only)
  if (inputs.metrics) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Business Metrics', 14, y);
    y += 6;

    const metricsBody: string[][] = [
      ['Daily Cost Rate', fmtDual(inputs.metrics.dailyCostRate, cur, aligned)],
    ];
    const hasPlacementRate = inputs.metrics.dailyPlacementRate !== undefined;
    if (hasPlacementRate) {
      const label = inputs.marginInputType === 'FIXED_DAILY' ? 'Daily Placement Rate (Fixed)' : 'Daily Placement Rate';
      metricsBody.push([label, fmtDual(inputs.metrics.dailyPlacementRate!, cur, aligned)]);
    }
    if (inputs.metrics.dailyRevenue !== undefined) {
      metricsBody.push(['Daily Revenue', fmtDual(inputs.metrics.dailyRevenue, cur, aligned)]);
    }
    if (inputs.metrics.marginPct !== undefined) {
      metricsBody.push(['Margin %', `${inputs.metrics.marginPct.toFixed(1)}%`]);
    }
    if (inputs.metrics.markupPct !== undefined) {
      metricsBody.push(['Markup %', `${inputs.metrics.markupPct.toFixed(1)}%`]);
    }

    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: metricsBody,
      theme: 'grid',
      headStyles: { fillColor: [46, 134, 193] },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.section === 'body' && (data.row.index === 0 || (hasPlacementRate && data.row.index === 1))) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Results Summary
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Salary Summary', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['', 'Monthly', 'Yearly']],
    body: [
      ['Gross Salary', fmtDual(result.grossSalaryMonthly, cur, aligned), fmtDual(result.grossSalaryYearly, cur, aligned)],
      ['Net Salary', fmtDual(result.netSalaryMonthly, cur, aligned), fmtDual(result.netSalaryYearly, cur, aligned)],
      ['Total Employer Cost', fmtDual(result.totalEmployerCostMonthly, cur, aligned), fmtDual(result.totalEmployerCostYearly, cur, aligned)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [214, 0, 28] },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Employee Contributions (monthly base)
  if (result.employeeContributions.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Employee Contributions (Monthly)', 14, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [['Contribution', 'Rate', 'Base', 'Amount']],
      body: [
        ...result.employeeContributions.map(c => [
          c.name,
          `${(c.rate * 100).toFixed(2)}%`,
          fmtDual(c.base / 12, cur, aligned),
          fmtDual(c.amount / 12, cur, aligned),
        ]),
        ...(result.incomeTax !== undefined ? [['Income Tax', `${result.country === 'RO' ? '10%' : 'Progressive'}`, fmtDual((result.taxableBase || 0) / 12, cur, aligned), fmtDual(result.incomeTax / 12, cur, aligned)]] : []),
        ['TOTAL', '', '', fmtDual(result.totalEmployeeContributions / 12, cur, aligned)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [100, 100, 100] },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Employer Contributions (monthly base)
  if (result.employerContributions.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Employer Contributions (Monthly)', 14, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [['Contribution', 'Rate', 'Base', 'Amount']],
      body: [
        ...result.employerContributions.map(c => [
          c.name,
          `${(c.rate * 100).toFixed(3)}%`,
          fmtDual(c.base / 12, cur, aligned),
          fmtDual(c.amount / 12, cur, aligned),
        ]),
        ['TOTAL', '', '', fmtDual(result.totalEmployerContributions / 12, cur, aligned)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [100, 100, 100] },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  y = addDisclaimer(doc, y);

  // Switzerland-specific disclaimer
  if (result.country === 'CH') {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y > pageHeight - 25) { doc.addPage(); y = 20; }
    doc.setFillColor(235, 245, 255);
    doc.rect(14, y, 182, 12, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(50, 80, 140);
    doc.text('Note: Income tax is not included. Swiss income tax varies by canton, commune, and church affiliation.', 16, y + 5, { maxWidth: 178 });
  }

  doc.save(`TSG_Employee_${result.country}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================
// B2B MODE PDF
// ============================================================

export function exportB2BPDF(
  result: B2BResult,
  inputs: any,
  identity?: EmployeeIdentity,
  alignedOptions?: PDFAlignedOptions,
) {
  const doc = new jsPDF();
  const cur = result.currency;
  const aligned = alignedOptions?.showAligned && alignedOptions.alignmentCurrency !== cur
    ? { show: true, currency: alignedOptions.alignmentCurrency, rates: alignedOptions.rates }
    : undefined;

  let y = addHeader(doc, 'B2B Mode - Contractor Cost Analysis');

  // FX rate note
  if (aligned) {
    y = addFXNote(doc, y, cur, aligned);
  }

  // Employee Identity
  y = addIdentitySection(doc, y, identity);

  // Input Summary
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Input Summary', 14, y);
  y += 6;

  const inputRows: string[][] = [
    ['Pricing Mode', inputs.pricingMode],
    ['Currency', cur],
  ];

  if (inputs.pricingMode !== 'CLIENT_BUDGET') {
    inputRows.splice(0, 0, ['Cost Rate', `${formatNum(inputs.costRate)} ${cur}/${inputs.rateType?.toLowerCase() || 'day'}`]);
  }

  if (aligned) {
    inputRows.push(['Aligned Currency', aligned.currency]);
  }

  autoTable(doc, {
    startY: y,
    head: [['Parameter', 'Value']],
    body: inputRows,
    theme: 'grid',
    headStyles: { fillColor: [45, 45, 45] },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Budget Breakdown (CLIENT_BUDGET mode)
  if (result.budgetBreakdown) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Budget Breakdown', 14, y);
    y += 6;

    const bb = result.budgetBreakdown;
    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: [
        ['Client Budget / Day', fmtDual(bb.clientBudgetDaily, cur, aligned)],
        [`Margin (${bb.budgetMarginPercent}% on sales)`, fmtDual(bb.marginAmount, cur, aligned)],
        ['Employer Cost', fmtDual(bb.employerCost, cur, aligned)],
        [`÷ Social Multiplier`, `${bb.socialMultiplier}`],
        ['Max Daily Rate', fmtDual(bb.maxDailyRate, cur, aligned)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [46, 134, 193] },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Min margin floor alert (TARGET_MARGIN mode)
  if (result.minMarginFloorApplied && result.minMarginFloorExplanation) {
    doc.setFillColor(255, 251, 235);
    doc.rect(14, y, 182, 18, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(160, 100, 0);
    doc.text('Minimum Daily Margin Floor Applied', 16, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(result.minMarginFloorExplanation, 16, y + 10, { maxWidth: 178 });
    y += 22;
  }

  // Profitability Analysis
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Profitability Analysis', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Client Daily Rate', fmtDual(result.clientRateDaily, cur, aligned)],
      ['Cost Daily Rate', fmtDual(result.costRateDaily, cur, aligned)],
      ['Daily Margin', fmtDual(result.marginAmount, cur, aligned)],
      ['Margin %', `${result.marginPercent.toFixed(1)}%`],
      ['Markup %', `${result.markupPercent.toFixed(1)}%`],
      ['Annual Revenue', fmtDual(result.annualRevenue, cur, aligned)],
      ['Annual Cost', fmtDual(result.annualCost, cur, aligned)],
      ['Annual Profit', fmtDual(result.annualProfit, cur, aligned)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [214, 0, 28] },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;
  addDisclaimer(doc, y);

  doc.save(`TSG_B2B_${cur}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================
// ALLOCATION MODE PDF
// ============================================================

export function exportAllocationPDF(
  result: AllocationResult,
  inputs: any,
  alignedOptions?: PDFAlignedOptions,
) {
  const doc = new jsPDF();
  const cur = result.currency;
  const aligned = alignedOptions?.showAligned && alignedOptions.alignmentCurrency !== cur
    ? { show: true, currency: alignedOptions.alignmentCurrency, rates: alignedOptions.rates }
    : undefined;

  let y = addHeader(doc, 'Allocation Mode - Multi-Client Profitability');

  // FX rate note
  if (aligned) {
    y = addFXNote(doc, y, cur, aligned);
  }

  // Input Summary
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Input Summary', 14, y);
  y += 6;

  const inputRows: string[][] = [
    ['Base Salary (100%)', fmtDual(inputs.salary100, cur, aligned)],
    ['Engagement %', `${inputs.engagementPercent}%`],
    ['Employer Multiplier', `${inputs.employerMultiplier}x`],
    ['Working Days/Year', `${result.workingDaysPerYear}`],
  ];

  if (aligned) {
    inputRows.push(['Aligned Currency', aligned.currency]);
  }

  autoTable(doc, {
    startY: y,
    head: [['Parameter', 'Value']],
    body: inputRows,
    theme: 'grid',
    headStyles: { fillColor: [45, 45, 45] },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Cost Breakdown
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Cost Breakdown', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    body: [
      ['Engaged Salary', fmtDual(result.engagedSalary, cur, aligned)],
      ['Total Employer Cost', fmtDual(result.employerCost, cur, aligned)],
      ['Base Daily Cost', fmtDual(result.baseDailyCost, cur, aligned)],
    ],
    theme: 'grid',
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Client Analysis
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Client Profitability', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Client', 'Allocation', 'Daily Rate', 'Revenue/Day', 'Profit/Day', 'Type', 'Annual Profit']],
    body: result.clients.map(c => [
      c.clientName,
      `${c.allocationPercent}%`,
      fmtDual(c.dailyRate, cur, aligned),
      fmtDual(c.revenuePerDay, cur, aligned),
      fmtDual(c.profitPerDay, cur, aligned),
      c.isBaseline ? 'Baseline' : 'Incremental',
      fmtDual(c.annualProfit, cur, aligned),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [214, 0, 28], fontSize: 7 },
    styles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Totals
  autoTable(doc, {
    startY: y,
    head: [['Summary', 'Value']],
    body: [
      ['Total Daily Profit', fmtDual(result.totalDailyProfit, cur, aligned)],
      ['Total Annual Profit', fmtDual(result.annualProfit, cur, aligned)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [46, 134, 193] },
    styles: { fontSize: 10, fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;
  addDisclaimer(doc, y);

  doc.save(`TSG_Allocation_${cur}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================
// Payslip PDF Export (already supports aligned currency — unchanged)
// ============================================================

interface PayslipPDFOptions {
  companyName: string;
  payPeriod: string;
  identity?: EmployeeIdentity;
  alignmentCurrency?: string;
  rates?: Record<string, number>;
}

export function exportPayslipPDF(result: PayslipResult, options: PayslipPDFOptions) {
  const { companyName, payPeriod, identity, alignmentCurrency, rates } = options;
  const showAligned = !!alignmentCurrency && !!rates && alignmentCurrency !== result.currency;
  const cur = result.currency;

  const doc = new jsPDF();

  // --- Payslip Header (custom, not standard addHeader) ---
  drawTSGLogo(doc, 14, 9.5, 14, 10);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(companyName, 31, 16);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Technology Staffing Group', 30, 21);

  // Period info right-aligned
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(45, 45, 45);
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.text('Pay Statement', pageWidth - 14, 14, { align: 'right' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${payPeriod}`, pageWidth - 14, 20, { align: 'right' });
  doc.setFontSize(8);
  doc.text(`Currency: ${cur}`, pageWidth - 14, 25, { align: 'right' });

  let y = 32;

  // --- Employee Details ---
  if (identity && (identity.employeeName || identity.dateOfBirth || identity.roleOrPosition)) {
    doc.setDrawColor(200, 200, 200);
    doc.line(14, y, pageWidth - 14, y);
    y += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text('EMPLOYEE DETAILS', 14, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(45, 45, 45);
    doc.setFontSize(9);
    if (identity.employeeName) { doc.text(`Name: ${identity.employeeName}`, 14, y); y += 4.5; }
    if (identity.dateOfBirth) { doc.text(`Date of Birth: ${identity.dateOfBirth}`, 14, y); y += 4.5; }
    if (identity.roleOrPosition) { doc.text(`Role / Position: ${identity.roleOrPosition}`, 14, y); y += 4.5; }
    y += 4;
  }

  // --- Earnings Table ---
  const earningsHead = showAligned
    ? [['Description', `Amount (${cur})`, `Amount (${alignmentCurrency})`]]
    : [['Description', `Amount (${cur})`]];

  const earningsBody = showAligned
    ? [['Gross Monthly Salary', formatNum(result.grossMonthlySalary), formatNum(convertAmt(result.grossMonthlySalary, cur, alignmentCurrency!, rates!))]]
    : [['Gross Monthly Salary', formatNum(result.grossMonthlySalary)]];

  autoTable(doc, {
    startY: y,
    head: earningsHead,
    body: earningsBody,
    theme: 'grid',
    headStyles: { fillColor: [46, 134, 193], fontSize: 9 },
    styles: { fontSize: 9 },
    columnStyles: showAligned
      ? { 1: { halign: 'right', fontStyle: 'bold' }, 2: { halign: 'right', textColor: [100, 80, 170] } }
      : { 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // --- Deductions Table ---
  const hasCappedBase = result.deductions.some(d => !d.isManual && d.base < result.grossMonthlySalary);

  const deductionHead = showAligned
    ? [['Code', 'Description', 'Base', 'Rate', `Amount (${cur})`, `Amount (${alignmentCurrency})`]]
    : [['Code', 'Description', 'Base', 'Rate', `Amount (${cur})`]];

  const deductionBody = result.deductions.map(d => {
    const rateStr = d.isManual ? 'Manual' : `${d.rate.toFixed(3)}%`;
    const isCapped = !d.isManual && d.base < result.grossMonthlySalary;
    const baseStr = d.isManual ? '-' : `${formatNum(d.base)}${isCapped ? ' *' : ''}`;
    const row = [d.code, d.label, baseStr, rateStr, `-${formatNum(d.amount)}`];
    if (showAligned) {
      row.push(`-${formatNum(convertAmt(d.amount, cur, alignmentCurrency!, rates!))}`);
    }
    return row;
  });

  // Total row
  const totalRow = showAligned
    ? ['', 'TOTAL DEDUCTIONS', '', '', `-${formatNum(result.totalDeductions)}`, `-${formatNum(convertAmt(result.totalDeductions, cur, alignmentCurrency!, rates!))}`]
    : ['', 'TOTAL DEDUCTIONS', '', '', `-${formatNum(result.totalDeductions)}`];
  deductionBody.push(totalRow);

  autoTable(doc, {
    startY: y,
    head: deductionHead,
    body: deductionBody,
    theme: 'grid',
    headStyles: { fillColor: [180, 60, 60], fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: showAligned
      ? { 2: { halign: 'right' }, 4: { halign: 'right', textColor: [200, 50, 50] }, 5: { halign: 'right', textColor: [100, 80, 170] } }
      : { 2: { halign: 'right' }, 4: { halign: 'right', textColor: [200, 50, 50] } },
    didParseCell: (data: any) => {
      if (data.row.index === deductionBody.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [255, 245, 245];
      }
      if (data.section === 'body' && data.column.index === 2 && data.row.index < deductionBody.length - 1) {
        const d = result.deductions[data.row.index];
        if (d && !d.isManual && d.base < result.grossMonthlySalary) {
          data.cell.styles.textColor = [180, 100, 20];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY;

  // Cap footnote
  if (hasCappedBase) {
    y += 2;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(180, 100, 20);
    doc.text('* Base capped at 12,350.00 (annual ceiling 148\'200 / 12 months)', 14, y);
    y += 6;
  } else {
    y += 6;
  }

  // --- Net Salary ---
  const netHead = showAligned
    ? [['', `${cur}`, `${alignmentCurrency}`]]
    : [['', `${cur}`]];
  const netBody = showAligned
    ? [['NET SALARY', formatNum(result.netSalary), formatNum(convertAmt(result.netSalary, cur, alignmentCurrency!, rates!))]]
    : [['NET SALARY', formatNum(result.netSalary)]];

  autoTable(doc, {
    startY: y,
    head: netHead,
    body: netBody,
    theme: 'grid',
    headStyles: { fillColor: [39, 174, 96], fontSize: 9 },
    styles: { fontSize: 11, fontStyle: 'bold' },
    columnStyles: showAligned
      ? { 1: { halign: 'right' }, 2: { halign: 'right', textColor: [100, 80, 170] } }
      : { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // --- Generated timestamp ---
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB')}`, 14, y);
  y += 8;

  addDisclaimer(doc, y);

  doc.save(`TSG_Payslip_${payPeriod.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
