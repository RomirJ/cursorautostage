import { storage } from './storage';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface TaxConfiguration {
  userId: string;
  businessType: 'individual' | 'llc' | 'corporation' | 's-corp';
  taxYear: number;
  jurisdiction: string; // US, CA, UK, etc.
  stateProvince?: string;
  taxId?: string;
  businessName?: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  accountingMethod: 'cash' | 'accrual';
  fiscalYearEnd: string; // MM-DD format
}

interface TaxableTransaction {
  id: string;
  userId: string;
  type: 'revenue' | 'expense' | 'deduction';
  category: string;
  amount: number;
  currency: string;
  date: Date;
  description: string;
  platform?: string;
  invoiceNumber?: string;
  receiptUrl?: string;
  taxDeductible: boolean;
  businessPurpose?: string;
  metadata: Record<string, any>;
}

interface TaxReport {
  userId: string;
  taxYear: number;
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalRevenue: number;
    totalExpenses: number;
    totalDeductions: number;
    netIncome: number;
    estimatedTaxOwed: number;
    quarterlyPayments: number;
    refundOwed: number;
  };
  revenueBreakdown: {
    platform: string;
    amount: number;
    taxable: number;
    withheld: number;
  }[];
  expenseCategories: {
    category: string;
    amount: number;
    deductible: number;
    receipts: number;
  }[];
  quarterlyBreakdown: {
    quarter: number;
    revenue: number;
    expenses: number;
    estimatedTax: number;
    paymentDue: Date;
  }[];
  forms: {
    form1099: boolean;
    scheduleC: boolean;
    scheduleK1: boolean;
    form1120: boolean;
  };
  recommendations: string[];
  warnings: string[];
}

interface FinancialMetrics {
  period: string;
  revenue: {
    total: number;
    recurring: number;
    oneTime: number;
    growth: number;
    forecast: number;
  };
  expenses: {
    total: number;
    fixed: number;
    variable: number;
    deductible: number;
  };
  profitability: {
    grossProfit: number;
    netProfit: number;
    margin: number;
    ebitda: number;
  };
  cashFlow: {
    operating: number;
    investing: number;
    financing: number;
    free: number;
  };
  ratios: {
    revenueGrowth: number;
    profitMargin: number;
    expenseRatio: number;
    burnRate: number;
  };
}

export class TaxReportingService {
  private readonly EXPENSE_CATEGORIES = {
    'equipment': { deductible: true, rate: 1.0, description: 'Computer equipment, cameras, microphones' },
    'software': { deductible: true, rate: 1.0, description: 'Software subscriptions and licenses' },
    'internet': { deductible: true, rate: 0.5, description: 'Internet service (business portion)' },
    'phone': { deductible: true, rate: 0.5, description: 'Phone service (business portion)' },
    'office_rent': { deductible: true, rate: 1.0, description: 'Office or studio rent' },
    'home_office': { deductible: true, rate: 0.3, description: 'Home office expenses' },
    'travel': { deductible: true, rate: 1.0, description: 'Business travel expenses' },
    'meals': { deductible: true, rate: 0.5, description: 'Business meals and entertainment' },
    'education': { deductible: true, rate: 1.0, description: 'Professional development and training' },
    'marketing': { deductible: true, rate: 1.0, description: 'Advertising and marketing expenses' },
    'professional': { deductible: true, rate: 1.0, description: 'Legal, accounting, consulting fees' },
    'supplies': { deductible: true, rate: 1.0, description: 'Office supplies and materials' },
    'utilities': { deductible: true, rate: 0.3, description: 'Utilities (business portion)' },
    'insurance': { deductible: true, rate: 1.0, description: 'Business insurance premiums' },
    'depreciation': { deductible: true, rate: 1.0, description: 'Equipment depreciation' }
  };

  private readonly TAX_RATES = {
    'US': {
      'federal': [
        { min: 0, max: 10275, rate: 0.10 },
        { min: 10275, max: 41775, rate: 0.12 },
        { min: 41775, max: 89450, rate: 0.22 },
        { min: 89450, max: 190750, rate: 0.24 },
        { min: 190750, max: 364200, rate: 0.32 },
        { min: 364200, max: 462500, rate: 0.35 },
        { min: 462500, max: Infinity, rate: 0.37 }
      ],
      'selfEmployment': 0.1413, // 14.13% for 2024
      'standardDeduction': 14600 // 2024 standard deduction for single filers
    }
  };

  async configureTaxSettings(config: TaxConfiguration): Promise<void> {
    await storage.saveTaxConfiguration(config);
    console.log(`[TaxReporting] Tax configuration saved for user ${config.userId}`);
  }

  async recordTransaction(transaction: TaxableTransaction): Promise<void> {
    // Auto-categorize transaction using AI
    if (!transaction.category) {
      transaction.category = await this.categorizeTransaction(transaction);
    }

    // Validate tax deductibility
    transaction.taxDeductible = this.validateDeductibility(transaction);

    await storage.saveTaxableTransaction(transaction);
    console.log(`[TaxReporting] Transaction recorded: ${transaction.type} $${transaction.amount}`);
  }

  async generateTaxReport(userId: string, taxYear: number): Promise<TaxReport> {
    const config = await storage.getTaxConfiguration(userId);
    if (!config) {
      throw new Error('Tax configuration not found. Please complete tax setup first.');
    }

    const startDate = new Date(taxYear, 0, 1);
    const endDate = new Date(taxYear, 11, 31);

    // Get all transactions for the tax year
    const transactions = await storage.getTaxableTransactions(userId, startDate, endDate);

    // Calculate revenue breakdown
    const revenueTransactions = transactions.filter(t => t.type === 'revenue');
    const revenueBreakdown = this.calculateRevenueBreakdown(revenueTransactions);

    // Calculate expense categories
    const expenseTransactions = transactions.filter(t => t.type === 'expense');
    const expenseCategories = this.calculateExpenseCategories(expenseTransactions);

    // Calculate quarterly breakdown
    const quarterlyBreakdown = this.calculateQuarterlyBreakdown(transactions, taxYear);

    // Calculate summary
    const totalRevenue = revenueTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalDeductions = expenseTransactions
      .filter(t => t.taxDeductible)
      .reduce((sum, t) => sum + t.amount, 0);
    const netIncome = totalRevenue - totalDeductions;

    // Calculate estimated tax
    const estimatedTax = this.calculateEstimatedTax(netIncome, config);

    // Generate recommendations and warnings
    const recommendations = await this.generateTaxRecommendations(transactions, config);
    const warnings = this.generateTaxWarnings(transactions, config);

    // Determine required forms
    const forms = this.determineRequiredForms(config, totalRevenue, netIncome);

    return {
      userId,
      taxYear,
      period: { start: startDate, end: endDate },
      summary: {
        totalRevenue,
        totalExpenses,
        totalDeductions,
        netIncome,
        estimatedTaxOwed: estimatedTax.total,
        quarterlyPayments: estimatedTax.quarterly,
        refundOwed: Math.max(0, estimatedTax.quarterly - estimatedTax.total)
      },
      revenueBreakdown,
      expenseCategories,
      quarterlyBreakdown,
      forms,
      recommendations,
      warnings
    };
  }

  async generateFinancialDashboard(userId: string, period: string = 'ytd'): Promise<FinancialMetrics> {
    const { startDate, endDate } = this.getPeriodDates(period);
    const transactions = await storage.getTaxableTransactions(userId, startDate, endDate);

    // Calculate revenue metrics
    const revenueTransactions = transactions.filter(t => t.type === 'revenue');
    const totalRevenue = revenueTransactions.reduce((sum, t) => sum + t.amount, 0);
    const recurringRevenue = this.calculateRecurringRevenue(revenueTransactions);
    const revenueGrowth = await this.calculateRevenueGrowth(userId, startDate, endDate);
    const revenueForecast = await this.forecastRevenue(revenueTransactions);

    // Calculate expense metrics
    const expenseTransactions = transactions.filter(t => t.type === 'expense');
    const totalExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);
    const fixedExpenses = this.calculateFixedExpenses(expenseTransactions);
    const variableExpenses = totalExpenses - fixedExpenses;
    const deductibleExpenses = expenseTransactions
      .filter(t => t.taxDeductible)
      .reduce((sum, t) => sum + t.amount, 0);

    // Calculate profitability
    const grossProfit = totalRevenue - variableExpenses;
    const netProfit = totalRevenue - totalExpenses;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const ebitda = netProfit; // Simplified for content creators

    // Calculate cash flow (simplified)
    const operatingCashFlow = netProfit;
    const investingCashFlow = this.calculateInvestingCashFlow(expenseTransactions);
    const financingCashFlow = 0; // Would include loans, investments
    const freeCashFlow = operatingCashFlow + investingCashFlow;

    // Calculate ratios
    const previousPeriodRevenue = await this.getPreviousPeriodRevenue(userId, startDate, endDate);
    const revenueGrowthRate = previousPeriodRevenue > 0 
      ? ((totalRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100 
      : 0;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const expenseRatio = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0;
    const burnRate = this.calculateBurnRate(expenseTransactions);

    return {
      period,
      revenue: {
        total: totalRevenue,
        recurring: recurringRevenue,
        oneTime: totalRevenue - recurringRevenue,
        growth: revenueGrowth,
        forecast: revenueForecast
      },
      expenses: {
        total: totalExpenses,
        fixed: fixedExpenses,
        variable: variableExpenses,
        deductible: deductibleExpenses
      },
      profitability: {
        grossProfit,
        netProfit,
        margin,
        ebitda
      },
      cashFlow: {
        operating: operatingCashFlow,
        investing: investingCashFlow,
        financing: financingCashFlow,
        free: freeCashFlow
      },
      ratios: {
        revenueGrowth: revenueGrowthRate,
        profitMargin,
        expenseRatio,
        burnRate
      }
    };
  }

  async exportTaxReport(userId: string, taxYear: number, format: 'pdf' | 'csv' | 'xlsx'): Promise<string> {
    const report = await this.generateTaxReport(userId, taxYear);

    switch (format) {
      case 'pdf':
        return await this.generateTaxReportPDF(report);
      case 'csv':
        return await this.generateTaxReportCSV(report);
      case 'xlsx':
        return await this.generateTaxReportXLSX(report);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private async categorizeTransaction(transaction: TaxableTransaction): Promise<string> {
    try {
      const prompt = `Categorize this business transaction for tax purposes:
      
      Description: ${transaction.description}
      Amount: $${transaction.amount}
      Type: ${transaction.type}
      Platform: ${transaction.platform || 'N/A'}
      
      Available categories: ${Object.keys(this.EXPENSE_CATEGORIES).join(', ')}
      
      Return only the category name that best fits this transaction.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 50,
        temperature: 0.1
      });

      const category = response.choices[0].message.content?.trim().toLowerCase() || 'supplies';
      return Object.keys(this.EXPENSE_CATEGORIES).includes(category) ? category : 'supplies';
    } catch (error) {
      console.error('[TaxReporting] Error categorizing transaction:', error);
      return 'supplies'; // Default category
    }
  }

  private validateDeductibility(transaction: TaxableTransaction): boolean {
    if (transaction.type !== 'expense') return false;
    
    const category = this.EXPENSE_CATEGORIES[transaction.category as keyof typeof this.EXPENSE_CATEGORIES];
    if (!category) return false;

    return category.deductible;
  }

  private calculateRevenueBreakdown(transactions: TaxableTransaction[]) {
    const platformMap = new Map<string, { amount: number; taxable: number; withheld: number }>();

    for (const transaction of transactions) {
      const platform = transaction.platform || 'Other';
      const existing = platformMap.get(platform) || { amount: 0, taxable: 0, withheld: 0 };
      
      existing.amount += transaction.amount;
      existing.taxable += transaction.amount; // All revenue is taxable for content creators
      existing.withheld += transaction.metadata?.taxWithheld || 0;
      
      platformMap.set(platform, existing);
    }

    return Array.from(platformMap.entries()).map(([platform, data]) => ({
      platform,
      ...data
    }));
  }

  private calculateExpenseCategories(transactions: TaxableTransaction[]) {
    const categoryMap = new Map<string, { amount: number; deductible: number; receipts: number }>();

    for (const transaction of transactions) {
      const category = transaction.category;
      const existing = categoryMap.get(category) || { amount: 0, deductible: 0, receipts: 0 };
      
      existing.amount += transaction.amount;
      if (transaction.taxDeductible) {
        const categoryInfo = this.EXPENSE_CATEGORIES[category as keyof typeof this.EXPENSE_CATEGORIES];
        existing.deductible += transaction.amount * (categoryInfo?.rate || 1.0);
      }
      if (transaction.receiptUrl) {
        existing.receipts += 1;
      }
      
      categoryMap.set(category, existing);
    }

    return Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      ...data
    }));
  }

  private calculateQuarterlyBreakdown(transactions: TaxableTransaction[], taxYear: number) {
    const quarters = [
      { quarter: 1, start: new Date(taxYear, 0, 1), end: new Date(taxYear, 2, 31), paymentDue: new Date(taxYear, 3, 15) },
      { quarter: 2, start: new Date(taxYear, 3, 1), end: new Date(taxYear, 5, 30), paymentDue: new Date(taxYear, 5, 15) },
      { quarter: 3, start: new Date(taxYear, 6, 1), end: new Date(taxYear, 8, 30), paymentDue: new Date(taxYear, 8, 15) },
      { quarter: 4, start: new Date(taxYear, 9, 1), end: new Date(taxYear, 11, 31), paymentDue: new Date(taxYear + 1, 0, 15) }
    ];

    return quarters.map(({ quarter, start, end, paymentDue }) => {
      const quarterTransactions = transactions.filter(t => 
        t.date >= start && t.date <= end
      );

      const revenue = quarterTransactions
        .filter(t => t.type === 'revenue')
        .reduce((sum, t) => sum + t.amount, 0);

      const expenses = quarterTransactions
        .filter(t => t.type === 'expense' && t.taxDeductible)
        .reduce((sum, t) => sum + t.amount, 0);

      const netIncome = revenue - expenses;
      const estimatedTax = this.calculateQuarterlyTax(netIncome);

      return {
        quarter,
        revenue,
        expenses,
        estimatedTax,
        paymentDue
      };
    });
  }

  private calculateEstimatedTax(netIncome: number, config: TaxConfiguration) {
    const jurisdiction = config.jurisdiction;
    const taxRates = this.TAX_RATES[jurisdiction as keyof typeof this.TAX_RATES];
    
    if (!taxRates) {
      throw new Error(`Tax rates not available for jurisdiction: ${jurisdiction}`);
    }

    // Calculate federal income tax
    let federalTax = 0;
    let remainingIncome = Math.max(0, netIncome - taxRates.standardDeduction);

    for (const bracket of taxRates.federal) {
      if (remainingIncome <= 0) break;
      
      const taxableInThisBracket = Math.min(remainingIncome, bracket.max - bracket.min);
      federalTax += taxableInThisBracket * bracket.rate;
      remainingIncome -= taxableInThisBracket;
    }

    // Calculate self-employment tax
    const selfEmploymentTax = netIncome * taxRates.selfEmployment;

    const totalTax = federalTax + selfEmploymentTax;
    const quarterlyTax = totalTax / 4;

    return {
      federal: federalTax,
      selfEmployment: selfEmploymentTax,
      total: totalTax,
      quarterly: quarterlyTax
    };
  }

  private calculateQuarterlyTax(quarterlyNetIncome: number): number {
    const annualizedIncome = quarterlyNetIncome * 4;
    const estimatedTax = this.calculateEstimatedTax(annualizedIncome, {
      jurisdiction: 'US',
      businessType: 'individual'
    } as TaxConfiguration);
    
    return estimatedTax.quarterly;
  }

  private async generateTaxRecommendations(
    transactions: TaxableTransaction[], 
    config: TaxConfiguration
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Check for missing receipts
    const expensesWithoutReceipts = transactions.filter(t => 
      t.type === 'expense' && t.taxDeductible && !t.receiptUrl
    );
    
    if (expensesWithoutReceipts.length > 0) {
      recommendations.push(`Upload receipts for ${expensesWithoutReceipts.length} deductible expenses to ensure compliance.`);
    }

    // Check for quarterly payment requirements
    const annualIncome = transactions
      .filter(t => t.type === 'revenue')
      .reduce((sum, t) => sum + t.amount, 0);
    
    if (annualIncome > 1000) {
      recommendations.push('Consider making quarterly estimated tax payments to avoid penalties.');
    }

    // Check for retirement contributions
    const retirementContributions = transactions.filter(t => 
      t.category === 'retirement' || t.description.toLowerCase().includes('ira')
    );
    
    if (retirementContributions.length === 0 && annualIncome > 50000) {
      recommendations.push('Consider SEP-IRA or Solo 401(k) contributions to reduce taxable income.');
    }

    // Check for business structure optimization
    if (config.businessType === 'individual' && annualIncome > 100000) {
      recommendations.push('Consider LLC or S-Corp election for potential tax savings on self-employment tax.');
    }

    return recommendations;
  }

  private generateTaxWarnings(
    transactions: TaxableTransaction[], 
    config: TaxConfiguration
  ): string[] {
    const warnings: string[] = [];

    // Check for large cash transactions
    const largeCashTransactions = transactions.filter(t => 
      t.amount > 10000 && t.metadata?.paymentMethod === 'cash'
    );
    
    if (largeCashTransactions.length > 0) {
      warnings.push('Large cash transactions may require additional reporting (Form 8300).');
    }

    // Check for foreign income
    const foreignIncome = transactions.filter(t => 
      t.type === 'revenue' && t.metadata?.country && t.metadata.country !== 'US'
    );
    
    if (foreignIncome.length > 0) {
      warnings.push('Foreign income may require additional forms (FBAR, Form 8938).');
    }

    // Check for hobby loss rules
    const netIncome = transactions
      .filter(t => t.type === 'revenue')
      .reduce((sum, t) => sum + t.amount, 0) -
      transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    if (netIncome < 0) {
      warnings.push('Business shows a loss. Ensure you can demonstrate profit motive to avoid hobby loss rules.');
    }

    return warnings;
  }

  private determineRequiredForms(config: TaxConfiguration, revenue: number, netIncome: number) {
    return {
      form1099: revenue > 600, // If receiving payments from platforms
      scheduleC: config.businessType === 'individual' && revenue > 400,
      scheduleK1: config.businessType === 'llc' || config.businessType === 's-corp',
      form1120: config.businessType === 'corporation'
    };
  }

  private getPeriodDates(period: string): { startDate: Date; endDate: Date } {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    switch (period) {
      case 'ytd':
        return {
          startDate: new Date(currentYear, 0, 1),
          endDate: now
        };
      case 'last_year':
        return {
          startDate: new Date(currentYear - 1, 0, 1),
          endDate: new Date(currentYear - 1, 11, 31)
        };
      case 'last_quarter':
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const lastQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
        const lastQuarterYear = currentQuarter === 0 ? currentYear - 1 : currentYear;
        return {
          startDate: new Date(lastQuarterYear, lastQuarter * 3, 1),
          endDate: new Date(lastQuarterYear, (lastQuarter + 1) * 3, 0)
        };
      default:
        return {
          startDate: new Date(currentYear, 0, 1),
          endDate: now
        };
    }
  }

  private calculateRecurringRevenue(transactions: TaxableTransaction[]): number {
    // Identify recurring revenue patterns (subscriptions, sponsorships)
    const recurringPlatforms = ['patreon', 'youtube_memberships', 'twitch_subscriptions'];
    return transactions
      .filter(t => recurringPlatforms.includes(t.platform || ''))
      .reduce((sum, t) => sum + t.amount, 0);
  }

  private async calculateRevenueGrowth(userId: string, startDate: Date, endDate: Date): Promise<number> {
    const periodLength = endDate.getTime() - startDate.getTime();
    const previousStart = new Date(startDate.getTime() - periodLength);
    const previousEnd = new Date(endDate.getTime() - periodLength);

    const currentRevenue = await this.getPeriodRevenue(userId, startDate, endDate);
    const previousRevenue = await this.getPeriodRevenue(userId, previousStart, previousEnd);

    return previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
  }

  private async forecastRevenue(transactions: TaxableTransaction[]): Promise<number> {
    // Simple linear regression forecast based on recent trends
    const monthlyRevenue = this.groupTransactionsByMonth(transactions);
    if (monthlyRevenue.length < 3) return 0;

    const trend = this.calculateTrend(monthlyRevenue);
    const lastMonth = monthlyRevenue[monthlyRevenue.length - 1];
    
    return lastMonth + trend;
  }

  private calculateFixedExpenses(transactions: TaxableTransaction[]): number {
    const fixedCategories = ['office_rent', 'software', 'internet', 'phone', 'insurance'];
    return transactions
      .filter(t => fixedCategories.includes(t.category))
      .reduce((sum, t) => sum + t.amount, 0);
  }

  private calculateInvestingCashFlow(transactions: TaxableTransaction[]): number {
    const investingCategories = ['equipment', 'software'];
    return -transactions
      .filter(t => investingCategories.includes(t.category))
      .reduce((sum, t) => sum + t.amount, 0);
  }

  private calculateBurnRate(transactions: TaxableTransaction[]): number {
    // Calculate monthly burn rate
    const monthlyExpenses = this.groupTransactionsByMonth(transactions);
    return monthlyExpenses.length > 0 
      ? monthlyExpenses.reduce((sum, month) => sum + month, 0) / monthlyExpenses.length
      : 0;
  }

  private async getPeriodRevenue(userId: string, startDate: Date, endDate: Date): Promise<number> {
    const transactions = await storage.getTaxableTransactions(userId, startDate, endDate);
    return transactions
      .filter(t => t.type === 'revenue')
      .reduce((sum, t) => sum + t.amount, 0);
  }

  private async getPreviousPeriodRevenue(userId: string, startDate: Date, endDate: Date): Promise<number> {
    const periodLength = endDate.getTime() - startDate.getTime();
    const previousStart = new Date(startDate.getTime() - periodLength);
    const previousEnd = new Date(endDate.getTime() - periodLength);
    
    return await this.getPeriodRevenue(userId, previousStart, previousEnd);
  }

  private groupTransactionsByMonth(transactions: TaxableTransaction[]): number[] {
    const monthlyMap = new Map<string, number>();
    
    for (const transaction of transactions) {
      if (transaction.type !== 'revenue') continue;
      
      const monthKey = `${transaction.date.getFullYear()}-${transaction.date.getMonth()}`;
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + transaction.amount);
    }
    
    return Array.from(monthlyMap.values());
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, idx) => sum + (idx * val), 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
    
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  private async generateTaxReportPDF(report: TaxReport): Promise<string> {
    const fileName = `tax-report-${report.userId}-${report.taxYear}.pdf`;
    const filePath = path.join(process.cwd(), 'exports', fileName);
    
    // Ensure exports directory exists
    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Header
        doc.fontSize(24).fillColor('#2563eb').text(`Tax Report ${report.taxYear}`, 50, 50);
        doc.fontSize(12).fillColor('#64748b').text(
          `Generated on ${new Date().toLocaleDateString()}`,
          50, 85
        );
        doc.moveDown(2);

        // Summary Section
        doc.fontSize(18).fillColor('#1e293b').text('Summary', 50, 120);
        doc.moveTo(50, 140).lineTo(550, 140).stroke('#e2e8f0');
        
        let yPos = 160;
        const summaryItems = [
          ['Total Revenue:', `$${report.summary.totalRevenue.toLocaleString()}`],
          ['Total Expenses:', `$${report.summary.totalExpenses.toLocaleString()}`],
          ['Total Deductions:', `$${report.summary.totalDeductions.toLocaleString()}`],
          ['Net Income:', `$${report.summary.netIncome.toLocaleString()}`],
          ['Estimated Tax Owed:', `$${report.summary.estimatedTaxOwed.toLocaleString()}`]
        ];

        summaryItems.forEach(([label, value]) => {
          doc.fontSize(12).fillColor('#374151');
          doc.text(label, 50, yPos);
          doc.text(value, 300, yPos);
          yPos += 20;
        });

        // Revenue Breakdown
        yPos += 30;
        doc.fontSize(16).fillColor('#2563eb').text('Revenue by Platform', 50, yPos);
        yPos += 25;
        doc.moveTo(50, yPos).lineTo(550, yPos).stroke('#e2e8f0');
        yPos += 15;

        report.revenueBreakdown.forEach(platform => {
          doc.fontSize(11).fillColor('#374151');
          doc.text(platform.platform, 50, yPos);
          doc.text(`$${platform.amount.toLocaleString()}`, 200, yPos);
          doc.text(`$${platform.taxable.toLocaleString()}`, 300, yPos);
          doc.text(`$${platform.withheld.toLocaleString()}`, 400, yPos);
          yPos += 15;
        });

        // Expense Categories
        yPos += 30;
        doc.fontSize(16).fillColor('#2563eb').text('Expense Categories', 50, yPos);
        yPos += 25;
        doc.moveTo(50, yPos).lineTo(550, yPos).stroke('#e2e8f0');
        yPos += 15;

        report.expenseCategories.forEach(category => {
          doc.fontSize(11).fillColor('#374151');
          doc.text(category.category, 50, yPos);
          doc.text(`$${category.amount.toLocaleString()}`, 200, yPos);
          doc.text(`$${category.deductible.toLocaleString()}`, 300, yPos);
          doc.text(`${category.receipts} receipts`, 400, yPos);
          yPos += 15;
        });

        // Recommendations
        if (report.recommendations.length > 0) {
          yPos += 30;
          doc.fontSize(16).fillColor('#2563eb').text('Recommendations', 50, yPos);
          yPos += 25;
          doc.moveTo(50, yPos).lineTo(550, yPos).stroke('#e2e8f0');
          yPos += 15;

          report.recommendations.forEach(recommendation => {
            doc.fontSize(10).fillColor('#374151');
            doc.text(`• ${recommendation}`, 50, yPos, { width: 500 });
            yPos += 20;
          });
        }

        doc.end();
        
        stream.on('finish', () => {
          resolve(filePath);
        });
        
        stream.on('error', (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private async generateTaxReportCSV(report: TaxReport): Promise<string> {
    const fileName = `tax-report-${report.userId}-${report.taxYear}.csv`;
    const filePath = path.join(process.cwd(), 'exports', fileName);
    
    const csvContent = [
      'Tax Report Summary',
      `Tax Year,${report.taxYear}`,
      `Total Revenue,$${report.summary.totalRevenue}`,
      `Total Expenses,$${report.summary.totalExpenses}`,
      `Total Deductions,$${report.summary.totalDeductions}`,
      `Net Income,$${report.summary.netIncome}`,
      `Estimated Tax Owed,$${report.summary.estimatedTaxOwed}`,
      '',
      'Revenue Breakdown',
      'Platform,Amount,Taxable,Withheld',
      ...report.revenueBreakdown.map(p => `${p.platform},$${p.amount},$${p.taxable},$${p.withheld}`),
      '',
      'Expense Categories',
      'Category,Amount,Deductible,Receipts',
      ...report.expenseCategories.map(c => `${c.category},$${c.amount},$${c.deductible},${c.receipts}`)
    ].join('\n');

    fs.writeFileSync(filePath, csvContent);
    return filePath;
  }

  private async generateTaxReportXLSX(report: TaxReport): Promise<string> {
    // For now, return CSV - would implement Excel export with a library like exceljs
    return await this.generateTaxReportCSV(report);
  }
}

export const taxReportingService = new TaxReportingService(); 