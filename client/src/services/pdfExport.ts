// ============================================================
// PDF Export Service - Generates professional PDFs for all modes
// ============================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { EmployeeResult, B2BResult, AllocationResult, PayslipResult, EmployeeIdentity } from '../types';

const DISCLAIMER = 'This calculator provides estimates based on current tax rules and rates. Results are for planning only and must be validated by a tax professional.';

function formatNum(n: number): string {
  return n.toLocaleString('en-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function addHeader(doc: jsPDF, title: string) {
  // TSG Logo area
  doc.setFillColor(214, 0, 28);
  doc.rect(14, 10, 8, 8, 'F');
  doc.setFillColor(0, 0, 0);
  doc.rect(18, 10, 8, 8, 'F');
  doc.setFillColor(214, 0, 28);
  doc.triangle(18, 14, 22, 10, 22, 18, 'F');

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('TSG', 30, 17);

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

export function exportEmployeePDF(result: EmployeeResult, inputs: any, identity?: EmployeeIdentity) {
  const doc = new jsPDF();
  let y = addHeader(doc, 'Employee Mode - Salary Calculation');

  // Employee Identity
  y = addIdentitySection(doc, y, identity);

  // Input Summary
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(45, 45, 45);
  doc.text('Input Summary', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Parameter', 'Value']],
    body: [
      ['Country', `${countryNames[result.country] || result.country} (${result.currency})`],
      ['Calculation Basis', inputs.calculationBasis],
      ['Input Amount', `${formatNum(inputs.amount)} ${result.currency} (${inputs.period})`],
      ['Occupation Rate', `${result.occupationRate}%`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [45, 45, 45] },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Results Summary
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Calculation Results', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['', 'Monthly', 'Yearly']],
    body: [
      ['Gross Salary', `${formatNum(result.grossSalaryMonthly)} ${result.currency}`, `${formatNum(result.grossSalaryYearly)} ${result.currency}`],
      ['Net Salary', `${formatNum(result.netSalaryMonthly)} ${result.currency}`, `${formatNum(result.netSalaryYearly)} ${result.currency}`],
      ['Total Employer Cost', `${formatNum(result.totalEmployerCostMonthly)} ${result.currency}`, `${formatNum(result.totalEmployerCostYearly)} ${result.currency}`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [214, 0, 28] },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Employee Contributions
  if (result.employeeContributions.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Employee Contributions', 14, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [['Contribution', 'Rate', 'Base', 'Amount']],
      body: [
        ...result.employeeContributions.map(c => [
          c.name,
          `${(c.rate * 100).toFixed(2)}%`,
          `${formatNum(c.base)} ${result.currency}`,
          `${formatNum(c.amount)} ${result.currency}`,
        ]),
        ...(result.incomeTax !== undefined ? [['Income Tax', `${result.country === 'RO' ? '10%' : 'Progressive'}`, `${formatNum(result.taxableBase || 0)} ${result.currency}`, `${formatNum(result.incomeTax)} ${result.currency}`]] : []),
        ['TOTAL', '', '', `${formatNum(result.totalEmployeeContributions)} ${result.currency}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [100, 100, 100] },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Employer Contributions
  if (result.employerContributions.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Employer Contributions', 14, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [['Contribution', 'Rate', 'Base', 'Amount']],
      body: [
        ...result.employerContributions.map(c => [
          c.name,
          `${(c.rate * 100).toFixed(3)}%`,
          `${formatNum(c.base)} ${result.currency}`,
          `${formatNum(c.amount)} ${result.currency}`,
        ]),
        ['TOTAL', '', '', `${formatNum(result.totalEmployerContributions)} ${result.currency}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [100, 100, 100] },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Business Metrics
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Business Metrics', 14, y);
  y += 5;

  const metricsBody = [
    ['Employer Daily Rate', `${formatNum(result.dailyRate)} ${result.currency}`],
  ];
  if (result.marginVsClientRate !== undefined) {
    metricsBody.push(['Margin vs Client Rate', `${formatNum(result.marginVsClientRate)} ${result.currency}`]);
  }

  autoTable(doc, {
    startY: y,
    body: metricsBody,
    theme: 'grid',
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;
  addDisclaimer(doc, y);

  doc.save(`TSG_Employee_${result.country}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportB2BPDF(result: B2BResult, inputs: any, identity?: EmployeeIdentity) {
  const doc = new jsPDF();
  let y = addHeader(doc, 'B2B Mode - Contractor Cost Analysis');

  // Employee Identity
  y = addIdentitySection(doc, y, identity);

  // Input Summary
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Input Summary', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Parameter', 'Value']],
    body: [
      ['Cost Rate', `${formatNum(inputs.costRate)} ${result.currency}/${inputs.rateType?.toLowerCase() || 'day'}`],
      ['Pricing Mode', inputs.pricingMode],
      ['Currency', result.currency],
    ],
    theme: 'grid',
    headStyles: { fillColor: [45, 45, 45] },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // Results
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Profitability Analysis', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Client Daily Rate', `${formatNum(result.clientRateDaily)} ${result.currency}`],
      ['Cost Daily Rate', `${formatNum(result.costRateDaily)} ${result.currency}`],
      ['Daily Margin', `${formatNum(result.marginAmount)} ${result.currency}`],
      ['Margin %', `${result.marginPercent.toFixed(1)}%`],
      ['Markup %', `${result.markupPercent.toFixed(1)}%`],
      ['Annual Revenue', `${formatNum(result.annualRevenue)} ${result.currency}`],
      ['Annual Cost', `${formatNum(result.annualCost)} ${result.currency}`],
      ['Annual Profit', `${formatNum(result.annualProfit)} ${result.currency}`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [214, 0, 28] },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;
  addDisclaimer(doc, y);

  doc.save(`TSG_B2B_${result.currency}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportAllocationPDF(result: AllocationResult, inputs: any) {
  const doc = new jsPDF();
  let y = addHeader(doc, 'Allocation Mode - Multi-Client Profitability');

  // Input Summary
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Input Summary', 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Parameter', 'Value']],
    body: [
      ['Base Salary (100%)', `${formatNum(inputs.salary100)} ${result.currency}`],
      ['Engagement %', `${inputs.engagementPercent}%`],
      ['Employer Multiplier', `${inputs.employerMultiplier}x`],
      ['Working Days/Year', `${result.workingDaysPerYear}`],
    ],
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
      ['Engaged Salary', `${formatNum(result.engagedSalary)} ${result.currency}`],
      ['Total Employer Cost', `${formatNum(result.employerCost)} ${result.currency}`],
      ['Base Daily Cost', `${formatNum(result.baseDailyCost)} ${result.currency}`],
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
      `${formatNum(c.dailyRate)} ${result.currency}`,
      `${formatNum(c.revenuePerDay)} ${result.currency}`,
      `${formatNum(c.profitPerDay)} ${result.currency}`,
      c.isBaseline ? 'Baseline' : 'Incremental',
      `${formatNum(c.annualProfit)} ${result.currency}`,
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
      ['Total Daily Profit', `${formatNum(result.totalDailyProfit)} ${result.currency}`],
      ['Total Annual Profit', `${formatNum(result.annualProfit)} ${result.currency}`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [46, 134, 193] },
    styles: { fontSize: 10, fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;
  addDisclaimer(doc, y);

  doc.save(`TSG_Allocation_${result.currency}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================
// Payslip PDF Export
// ============================================================

function convertAmt(amount: number, from: string, to: string, rates: Record<string, number>): number {
  if (from === to) return amount;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return amount;
  return Math.round((amount / fromRate) * toRate * 100) / 100;
}

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
  doc.setFillColor(214, 0, 28);
  doc.rect(14, 10, 8, 8, 'F');
  doc.setFillColor(0, 0, 0);
  doc.rect(18, 10, 8, 8, 'F');
  doc.setFillColor(214, 0, 28);
  doc.triangle(18, 14, 22, 10, 22, 18, 'F');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(companyName, 30, 16);

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
  const deductionHead = showAligned
    ? [['Code', 'Description', 'Rate', `Amount (${cur})`, `Amount (${alignmentCurrency})`]]
    : [['Code', 'Description', 'Rate', `Amount (${cur})`]];

  const deductionBody = result.deductions.map(d => {
    const rateStr = d.isManual ? 'Manual' : `${d.rate.toFixed(3)}%`;
    const row = [d.code, d.label, rateStr, `-${formatNum(d.amount)}`];
    if (showAligned) {
      row.push(`-${formatNum(convertAmt(d.amount, cur, alignmentCurrency!, rates!))}`);
    }
    return row;
  });

  // Total row
  const totalRow = showAligned
    ? ['', 'TOTAL DEDUCTIONS', '', `-${formatNum(result.totalDeductions)}`, `-${formatNum(convertAmt(result.totalDeductions, cur, alignmentCurrency!, rates!))}`]
    : ['', 'TOTAL DEDUCTIONS', '', `-${formatNum(result.totalDeductions)}`];
  deductionBody.push(totalRow);

  autoTable(doc, {
    startY: y,
    head: deductionHead,
    body: deductionBody,
    theme: 'grid',
    headStyles: { fillColor: [180, 60, 60], fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: showAligned
      ? { 3: { halign: 'right', textColor: [200, 50, 50] }, 4: { halign: 'right', textColor: [100, 80, 170] } }
      : { 3: { halign: 'right', textColor: [200, 50, 50] } },
    didParseCell: (data: any) => {
      // Bold the total row
      if (data.row.index === deductionBody.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [255, 245, 245];
      }
    },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

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
