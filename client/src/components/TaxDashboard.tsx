import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileText,
  Download,
  Calculator,
  PieChart,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Receipt,
  Building,
  CreditCard,
  Wallet,
  Target,
  Zap
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { format } from 'date-fns';

interface TaxConfiguration {
  businessType: 'individual' | 'llc' | 'corporation' | 's-corp';
  taxYear: number;
  jurisdiction: string;
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
  fiscalYearEnd: string;
}

interface TaxableTransaction {
  type: 'revenue' | 'expense' | 'deduction';
  category: string;
  amount: number;
  currency: string;
  date: string;
  description: string;
  platform?: string;
  invoiceNumber?: string;
  receiptUrl?: string;
  taxDeductible: boolean;
  businessPurpose?: string;
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

interface TaxReport {
  taxYear: number;
  summary: {
    totalRevenue: number;
    totalExpenses: number;
    totalDeductions: number;
    netIncome: number;
    estimatedTaxOwed: number;
    quarterlyPayments: number;
    refundOwed: number;
  };
  revenueBreakdown: Array<{
    platform: string;
    amount: number;
    taxable: number;
    withheld: number;
  }>;
  expenseCategories: Array<{
    category: string;
    amount: number;
    deductible: number;
    receipts: number;
  }>;
  quarterlyBreakdown: Array<{
    quarter: number;
    revenue: number;
    expenses: number;
    estimatedTax: number;
    paymentDue: Date;
  }>;
  recommendations: string[];
  warnings: string[];
}

export default function TaxDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState('ytd');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [transactionForm, setTransactionForm] = useState<Partial<TaxableTransaction>>({
    type: 'revenue',
    currency: 'USD',
    taxDeductible: false,
    date: new Date().toISOString().split('T')[0]
  });
  const [configForm, setConfigForm] = useState<Partial<TaxConfiguration>>({
    businessType: 'individual',
    taxYear: new Date().getFullYear(),
    jurisdiction: 'US',
    accountingMethod: 'cash',
    fiscalYearEnd: '12-31',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'US'
    }
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch financial dashboard
  const { data: dashboard, isLoading: dashboardLoading } = useQuery<FinancialMetrics>({
    queryKey: ['/api/tax/dashboard', selectedPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/tax/dashboard?period=${selectedPeriod}`);
      if (!response.ok) throw new Error('Failed to fetch dashboard');
      const data = await response.json();
      return data.dashboard;
    },
  });

  // Fetch tax report
  const { data: taxReport, isLoading: reportLoading } = useQuery<TaxReport>({
    queryKey: ['/api/tax/report', selectedYear],
    queryFn: async () => {
      const response = await fetch(`/api/tax/report/${selectedYear}`);
      if (!response.ok) throw new Error('Failed to fetch tax report');
      const data = await response.json();
      return data.report;
    },
  });

  // Record transaction mutation
  const recordTransactionMutation = useMutation({
    mutationFn: async (transaction: TaxableTransaction) => {
      const response = await fetch('/api/tax/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction),
      });
      if (!response.ok) throw new Error('Failed to record transaction');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Transaction recorded successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/tax/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tax/report'] });
      setShowTransactionForm(false);
      setTransactionForm({
        type: 'revenue',
        currency: 'USD',
        taxDeductible: false,
        date: new Date().toISOString().split('T')[0]
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to record transaction', variant: 'destructive' });
    }
  });

  // Configure tax settings mutation
  const configureSettingsMutation = useMutation({
    mutationFn: async (config: TaxConfiguration) => {
      const response = await fetch('/api/tax/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error('Failed to configure tax settings');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Tax configuration saved successfully' });
      setShowConfigForm(false);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save tax configuration', variant: 'destructive' });
    }
  });

  const handleRecordTransaction = () => {
    if (!transactionForm.description || !transactionForm.amount || !transactionForm.category) {
      toast({ title: 'Error', description: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    recordTransactionMutation.mutate(transactionForm as TaxableTransaction);
  };

  const handleSaveConfig = () => {
    if (!configForm.businessType || !configForm.jurisdiction) {
      toast({ title: 'Error', description: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    configureSettingsMutation.mutate(configForm as TaxConfiguration);
  };

  const handleExportReport = async (format: 'pdf' | 'csv' | 'xlsx') => {
    try {
      const response = await fetch(`/api/tax/export/${selectedYear}/${format}`);
      if (!response.ok) throw new Error('Failed to export report');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax-report-${selectedYear}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: 'Success', description: `Tax report exported as ${format.toUpperCase()}` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to export report', variant: 'destructive' });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  if (dashboardLoading || reportLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Tax & Financial Dashboard</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Tax & Financial Dashboard</h1>
        <div className="flex items-center gap-4">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ytd">Year to Date</SelectItem>
              <SelectItem value="last_year">Last Year</SelectItem>
              <SelectItem value="last_quarter">Last Quarter</SelectItem>
            </SelectContent>
          </Select>
          
          <Dialog open={showConfigForm} onOpenChange={setShowConfigForm}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Building className="w-4 h-4 mr-2" />
                Tax Setup
              </Button>
            </DialogTrigger>
          </Dialog>

          <Dialog open={showTransactionForm} onOpenChange={setShowTransactionForm}>
            <DialogTrigger asChild>
              <Button>
                <Receipt className="w-4 h-4 mr-2" />
                Add Transaction
              </Button>
            </DialogTrigger>
          </Dialog>
        </div>
      </div>

      {/* Key Metrics Cards */}
      {dashboard && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold">{formatCurrency(dashboard.revenue.total)}</p>
                </div>
                <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-green-600" />
                </div>
              </div>
              <div className="flex items-center mt-2">
                {dashboard.ratios.revenueGrowth > 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                )}
                <span className={`text-sm ${dashboard.ratios.revenueGrowth > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercentage(Math.abs(dashboard.ratios.revenueGrowth))} vs last period
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Net Profit</p>
                  <p className="text-2xl font-bold">{formatCurrency(dashboard.profitability.netProfit)}</p>
                </div>
                <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                </div>
              </div>
              <div className="flex items-center mt-2">
                <span className="text-sm text-muted-foreground">
                  {formatPercentage(dashboard.profitability.margin)} profit margin
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Deductible Expenses</p>
                  <p className="text-2xl font-bold">{formatCurrency(dashboard.expenses.deductible)}</p>
                </div>
                <div className="h-8 w-8 bg-purple-100 rounded-full flex items-center justify-center">
                  <Calculator className="w-4 h-4 text-purple-600" />
                </div>
              </div>
              <div className="flex items-center mt-2">
                <span className="text-sm text-muted-foreground">
                  {formatPercentage((dashboard.expenses.deductible / dashboard.expenses.total) * 100)} of total expenses
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Estimated Tax</p>
                  <p className="text-2xl font-bold">
                    {taxReport ? formatCurrency(taxReport.summary.estimatedTaxOwed) : '--'}
                  </p>
                </div>
                <div className="h-8 w-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <FileText className="w-4 h-4 text-orange-600" />
                </div>
              </div>
              <div className="flex items-center mt-2">
                <span className="text-sm text-muted-foreground">
                  For {selectedYear} tax year
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="tax-report">Tax Report</TabsTrigger>
          <TabsTrigger value="forecasting">Forecasting</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {dashboard && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <PieChart className="w-5 h-5 mr-2" />
                    Revenue Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Recurring Revenue</span>
                      <div className="flex items-center">
                        <span className="text-sm font-bold mr-2">
                          {formatCurrency(dashboard.revenue.recurring)}
                        </span>
                        <Badge variant="secondary">
                          {formatPercentage((dashboard.revenue.recurring / dashboard.revenue.total) * 100)}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">One-time Revenue</span>
                      <div className="flex items-center">
                        <span className="text-sm font-bold mr-2">
                          {formatCurrency(dashboard.revenue.oneTime)}
                        </span>
                        <Badge variant="secondary">
                          {formatPercentage((dashboard.revenue.oneTime / dashboard.revenue.total) * 100)}
                        </Badge>
                      </div>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Forecasted Next Period</span>
                        <span className="text-sm font-bold">
                          {formatCurrency(dashboard.revenue.forecast)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Expense Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <BarChart3 className="w-5 h-5 mr-2" />
                    Expense Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Fixed Expenses</span>
                      <div className="flex items-center">
                        <span className="text-sm font-bold mr-2">
                          {formatCurrency(dashboard.expenses.fixed)}
                        </span>
                        <Badge variant="outline">
                          {formatPercentage((dashboard.expenses.fixed / dashboard.expenses.total) * 100)}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Variable Expenses</span>
                      <div className="flex items-center">
                        <span className="text-sm font-bold mr-2">
                          {formatCurrency(dashboard.expenses.variable)}
                        </span>
                        <Badge variant="outline">
                          {formatPercentage((dashboard.expenses.variable / dashboard.expenses.total) * 100)}
                        </Badge>
                      </div>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-green-600">Tax Deductible</span>
                        <span className="text-sm font-bold text-green-600">
                          {formatCurrency(dashboard.expenses.deductible)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cash Flow */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Wallet className="w-5 h-5 mr-2" />
                    Cash Flow Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Operating Cash Flow</span>
                      <span className="text-sm font-bold">
                        {formatCurrency(dashboard.cashFlow.operating)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Investing Cash Flow</span>
                      <span className="text-sm font-bold">
                        {formatCurrency(dashboard.cashFlow.investing)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Free Cash Flow</span>
                      <span className="text-sm font-bold">
                        {formatCurrency(dashboard.cashFlow.free)}
                      </span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Monthly Burn Rate</span>
                        <span className="text-sm font-bold">
                          {formatCurrency(dashboard.ratios.burnRate)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Key Ratios */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Target className="w-5 h-5 mr-2" />
                    Key Financial Ratios
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Revenue Growth</span>
                      <Badge variant={dashboard.ratios.revenueGrowth > 0 ? "default" : "destructive"}>
                        {formatPercentage(dashboard.ratios.revenueGrowth)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Profit Margin</span>
                      <Badge variant={dashboard.ratios.profitMargin > 20 ? "default" : "secondary"}>
                        {formatPercentage(dashboard.ratios.profitMargin)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Expense Ratio</span>
                      <Badge variant={dashboard.ratios.expenseRatio < 80 ? "default" : "destructive"}>
                        {formatPercentage(dashboard.ratios.expenseRatio)}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Transaction history will be displayed here once implemented.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tax-report" className="space-y-6">
          {taxReport && (
            <>
              {/* Tax Report Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Tax Report {taxReport.taxYear}</h2>
                  <p className="text-muted-foreground">Comprehensive tax analysis and recommendations</p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2024, 2023, 2022, 2021].map(year => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => handleExportReport('pdf')}>
                    <Download className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                  <Button variant="outline" onClick={() => handleExportReport('csv')}>
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>

              {/* Tax Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Net Income</p>
                        <p className="text-2xl font-bold">{formatCurrency(taxReport.summary.netIncome)}</p>
                      </div>
                      <CheckCircle className="w-8 h-8 text-green-500" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Estimated Tax Owed</p>
                        <p className="text-2xl font-bold text-orange-600">
                          {formatCurrency(taxReport.summary.estimatedTaxOwed)}
                        </p>
                      </div>
                      <AlertTriangle className="w-8 h-8 text-orange-500" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Total Deductions</p>
                        <p className="text-2xl font-bold text-green-600">
                          {formatCurrency(taxReport.summary.totalDeductions)}
                        </p>
                      </div>
                      <Calculator className="w-8 h-8 text-green-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Revenue & Expense Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue by Platform</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {taxReport.revenueBreakdown.map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="font-medium">{item.platform}</span>
                          <div className="text-right">
                            <div className="font-bold">{formatCurrency(item.amount)}</div>
                            <div className="text-sm text-muted-foreground">
                              Tax withheld: {formatCurrency(item.withheld)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Expense Categories</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {taxReport.expenseCategories.map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="font-medium capitalize">{item.category.replace('_', ' ')}</span>
                          <div className="text-right">
                            <div className="font-bold">{formatCurrency(item.amount)}</div>
                            <div className="text-sm text-green-600">
                              Deductible: {formatCurrency(item.deductible)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Quarterly Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Quarterly Tax Payments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {taxReport.quarterlyBreakdown.map((quarter, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="text-lg font-bold mb-2">Q{quarter.quarter}</div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Revenue:</span>
                            <span className="font-medium">{formatCurrency(quarter.revenue)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Expenses:</span>
                            <span className="font-medium">{formatCurrency(quarter.expenses)}</span>
                          </div>
                          <div className="flex justify-between border-t pt-2">
                            <span>Est. Tax:</span>
                            <span className="font-bold text-orange-600">
                              {formatCurrency(quarter.estimatedTax)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Due: {format(new Date(quarter.paymentDue), 'MMM dd, yyyy')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Recommendations & Warnings */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {taxReport.recommendations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center text-blue-600">
                        <Zap className="w-5 h-5 mr-2" />
                        Recommendations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {taxReport.recommendations.map((rec, index) => (
                          <li key={index} className="flex items-start">
                            <CheckCircle className="w-4 h-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {taxReport.warnings.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center text-orange-600">
                        <AlertTriangle className="w-5 h-5 mr-2" />
                        Warnings
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {taxReport.warnings.map((warning, index) => (
                          <li key={index} className="flex items-start">
                            <AlertTriangle className="w-4 h-4 text-orange-500 mr-2 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{warning}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="forecasting" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Forecasting</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Advanced forecasting models will be displayed here.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Transaction Form Dialog */}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record Transaction</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="type">Transaction Type</Label>
            <Select value={transactionForm.type} onValueChange={(value) => 
              setTransactionForm({ ...transactionForm, type: value as any })
            }>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">Revenue</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="deduction">Deduction</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="category">Category</Label>
            <Input
              value={transactionForm.category || ''}
              onChange={(e) => setTransactionForm({ ...transactionForm, category: e.target.value })}
              placeholder="e.g., equipment, software, advertising"
            />
          </div>

          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={transactionForm.amount || ''}
              onChange={(e) => setTransactionForm({ ...transactionForm, amount: parseFloat(e.target.value) })}
              placeholder="0.00"
            />
          </div>

          <div>
            <Label htmlFor="date">Date</Label>
            <Input
              type="date"
              value={transactionForm.date || ''}
              onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })}
            />
          </div>

          <div className="col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              value={transactionForm.description || ''}
              onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
              placeholder="Detailed description of the transaction"
            />
          </div>

          <div>
            <Label htmlFor="platform">Platform (Optional)</Label>
            <Input
              value={transactionForm.platform || ''}
              onChange={(e) => setTransactionForm({ ...transactionForm, platform: e.target.value })}
              placeholder="YouTube, Instagram, etc."
            />
          </div>

          <div>
            <Label htmlFor="invoiceNumber">Invoice Number (Optional)</Label>
            <Input
              value={transactionForm.invoiceNumber || ''}
              onChange={(e) => setTransactionForm({ ...transactionForm, invoiceNumber: e.target.value })}
              placeholder="INV-001"
            />
          </div>

          <div className="col-span-2 flex items-center space-x-2">
            <input
              type="checkbox"
              checked={transactionForm.taxDeductible || false}
              onChange={(e) => setTransactionForm({ ...transactionForm, taxDeductible: e.target.checked })}
              className="rounded"
            />
            <Label>Tax Deductible</Label>
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setShowTransactionForm(false)}>
            Cancel
          </Button>
          <Button onClick={handleRecordTransaction} disabled={recordTransactionMutation.isPending}>
            {recordTransactionMutation.isPending ? 'Recording...' : 'Record Transaction'}
          </Button>
        </div>
      </DialogContent>

      {/* Config Form Dialog */}
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tax Configuration</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="businessType">Business Type</Label>
            <Select value={configForm.businessType} onValueChange={(value) => 
              setConfigForm({ ...configForm, businessType: value as any })
            }>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual/Sole Proprietor</SelectItem>
                <SelectItem value="llc">LLC</SelectItem>
                <SelectItem value="corporation">Corporation</SelectItem>
                <SelectItem value="s-corp">S-Corporation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="jurisdiction">Jurisdiction</Label>
            <Select value={configForm.jurisdiction} onValueChange={(value) => 
              setConfigForm({ ...configForm, jurisdiction: value })
            }>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="US">United States</SelectItem>
                <SelectItem value="CA">Canada</SelectItem>
                <SelectItem value="UK">United Kingdom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="businessName">Business Name (Optional)</Label>
            <Input
              value={configForm.businessName || ''}
              onChange={(e) => setConfigForm({ ...configForm, businessName: e.target.value })}
              placeholder="Your Business Name"
            />
          </div>

          <div>
            <Label htmlFor="taxId">Tax ID (Optional)</Label>
            <Input
              value={configForm.taxId || ''}
              onChange={(e) => setConfigForm({ ...configForm, taxId: e.target.value })}
              placeholder="EIN or SSN"
            />
          </div>

          <div>
            <Label htmlFor="accountingMethod">Accounting Method</Label>
            <Select value={configForm.accountingMethod} onValueChange={(value) => 
              setConfigForm({ ...configForm, accountingMethod: value as any })
            }>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash Basis</SelectItem>
                <SelectItem value="accrual">Accrual Basis</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="fiscalYearEnd">Fiscal Year End</Label>
            <Input
              value={configForm.fiscalYearEnd || ''}
              onChange={(e) => setConfigForm({ ...configForm, fiscalYearEnd: e.target.value })}
              placeholder="12-31"
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setShowConfigForm(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveConfig} disabled={configureSettingsMutation.isPending}>
            {configureSettingsMutation.isPending ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </DialogContent>
    </div>
  );
} 