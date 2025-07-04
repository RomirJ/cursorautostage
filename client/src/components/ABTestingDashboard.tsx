import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  FlaskConical, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  BarChart3,
  Target,
  Users,
  Zap,
  Eye,
  Heart,
  Share,
  MessageCircle,
  DollarSign,
  RefreshCw,
  Play,
  Square,
  Plus,
  Settings
} from "lucide-react";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { format } from "date-fns";

interface ABTest {
  testId: string;
  testName: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  completedAt?: Date;
  winnerVariationId?: string;
}

interface ABTestStatus {
  testId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  estimatedCompletion: Date;
  currentResults: PerformanceResult[];
  alerts: string[];
}

interface PerformanceResult {
  variationId: string;
  platform: string;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  watchTime: number;
  engagementRate: number;
  clickThroughRate: number;
  conversionRate: number;
  revenue: number;
  completionRate: number;
  bounceRate: number;
}

interface ABTestResult {
  testId: string;
  winner: string;
  results: PerformanceResult[];
  recommendations: string[];
  confidence: number;
  totalEngagement: number;
  testDuration: number;
  statisticalAnalysis: {
    isSignificant: boolean;
    pValue: number;
    confidenceInterval: [number, number];
    effectSize: number;
    confidence: number;
    sampleSize: number;
    power: number;
  };
  insights: string[];
}

interface TestVariation {
  id: string;
  content: string;
  thumbnail?: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  cta?: string;
  postingTime?: string;
}

export default function ABTestingDashboard() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTest, setSelectedTest] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [testConfig, setTestConfig] = useState({
    testName: '',
    contentId: '',
    variations: [
      { id: 'var-1', content: '', title: '', description: '' },
      { id: 'var-2', content: '', title: '', description: '' }
    ] as TestVariation[],
    platforms: ['youtube', 'tiktok'] as string[],
    duration: 24,
    successMetrics: ['engagement_rate', 'views', 'revenue'] as string[],
    trafficSplit: '50-50' as '50-50' | '70-30' | '80-20',
    statisticalSignificance: 0.05
  });

  // Fetch user's A/B tests
  const { data: tests = [], refetch: refetchTests } = useQuery({
    queryKey: ['/api/ab-test/user/current'],
    queryFn: async () => {
      const response = await fetch('/api/ab-test/user/current');
      if (!response.ok) throw new Error('Failed to fetch A/B tests');
      const data = await response.json();
      return data.tests || [];
    },
  });

  // Fetch selected test status
  const { data: testStatus } = useQuery({
    queryKey: ['/api/ab-test/status', selectedTest],
    queryFn: async () => {
      if (!selectedTest) return null;
      const response = await fetch(`/api/ab-test/${selectedTest}/status`);
      if (!response.ok) throw new Error('Failed to fetch test status');
      const data = await response.json();
      return data.status as ABTestStatus;
    },
    enabled: !!selectedTest,
    refetchInterval: selectedTest ? 30000 : false, // Refresh every 30 seconds for running tests
  });

  // Fetch selected test results
  const { data: testResults } = useQuery({
    queryKey: ['/api/ab-test/results', selectedTest],
    queryFn: async () => {
      if (!selectedTest) return null;
      const response = await fetch(`/api/ab-test/${selectedTest}/results`);
      if (!response.ok) throw new Error('Failed to fetch test results');
      const data = await response.json();
      return data.results as ABTestResult;
    },
    enabled: !!selectedTest,
  });

  // Create A/B test mutation
  const createTestMutation = useMutation({
    mutationFn: async (config: typeof testConfig) => {
      return apiRequest('/api/ab-test/create', {
        method: 'POST',
        body: JSON.stringify(config),
      });
    },
    onSuccess: () => {
      toast({ title: "A/B test created successfully" });
      setShowCreateForm(false);
      refetchTests();
      queryClient.invalidateQueries({ queryKey: ['/api/ab-test'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create A/B test",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Cancel test mutation
  const cancelTestMutation = useMutation({
    mutationFn: async (testId: string) => {
      return apiRequest(`/api/ab-test/${testId}/cancel`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({ title: "A/B test cancelled successfully" });
      refetchTests();
      queryClient.invalidateQueries({ queryKey: ['/api/ab-test'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to cancel A/B test",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateTest = () => {
    if (!testConfig.testName || !testConfig.contentId) {
      toast({
        title: "Missing required fields",
        description: "Please fill in test name and content ID",
        variant: "destructive",
      });
      return;
    }

    if (testConfig.variations.some(v => !v.content)) {
      toast({
        title: "Missing variation content",
        description: "Please fill in content for all variations",
        variant: "destructive",
      });
      return;
    }

    createTestMutation.mutate(testConfig);
  };

  const addVariation = () => {
    setTestConfig(prev => ({
      ...prev,
      variations: [
        ...prev.variations,
        { 
          id: `var-${prev.variations.length + 1}`, 
          content: '', 
          title: '', 
          description: '' 
        }
      ]
    }));
  };

  const removeVariation = (index: number) => {
    if (testConfig.variations.length <= 2) {
      toast({
        title: "Minimum variations required",
        description: "At least 2 variations are required for A/B testing",
        variant: "destructive",
      });
      return;
    }

    setTestConfig(prev => ({
      ...prev,
      variations: prev.variations.filter((_, i) => i !== index)
    }));
  };

  const updateVariation = (index: number, field: keyof TestVariation, value: string) => {
    setTestConfig(prev => ({
      ...prev,
      variations: prev.variations.map((v, i) => 
        i === index ? { ...v, [field]: value } : v
      )
    }));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Play className="h-4 w-4 text-blue-500" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled': return <Square className="h-4 w-4 text-gray-500" />;
      default: return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatPercentage = (num: number) => {
    return `${num.toFixed(2)}%`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-6 w-6" />
          <h1 className="text-2xl font-bold">A/B Testing Dashboard</h1>
        </div>
        <Button onClick={() => setShowCreateForm(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create New Test
        </Button>
      </div>

      {/* Create Test Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New A/B Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Test Name</label>
                <Input
                  value={testConfig.testName}
                  onChange={(e) => setTestConfig(prev => ({ ...prev, testName: e.target.value }))}
                  placeholder="Enter test name"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Content ID</label>
                <Input
                  value={testConfig.contentId}
                  onChange={(e) => setTestConfig(prev => ({ ...prev, contentId: e.target.value }))}
                  placeholder="Enter content ID"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Duration (hours)</label>
                <Input
                  type="number"
                  value={testConfig.duration}
                  onChange={(e) => setTestConfig(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                  min="1"
                  max="168"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Traffic Split</label>
                <Select
                  value={testConfig.trafficSplit}
                  onValueChange={(value: '50-50' | '70-30' | '80-20') => 
                    setTestConfig(prev => ({ ...prev, trafficSplit: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50-50">50% - 50%</SelectItem>
                    <SelectItem value="70-30">70% - 30%</SelectItem>
                    <SelectItem value="80-20">80% - 20%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Statistical Significance</label>
                <Input
                  type="number"
                  step="0.01"
                  value={testConfig.statisticalSignificance}
                  onChange={(e) => setTestConfig(prev => ({ ...prev, statisticalSignificance: parseFloat(e.target.value) }))}
                  min="0.01"
                  max="0.1"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Platforms</label>
              <div className="flex gap-2 mt-2">
                {['youtube', 'tiktok', 'instagram', 'twitter'].map(platform => (
                  <Button
                    key={platform}
                    variant={testConfig.platforms.includes(platform) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const newPlatforms = testConfig.platforms.includes(platform)
                        ? testConfig.platforms.filter(p => p !== platform)
                        : [...testConfig.platforms, platform];
                      setTestConfig(prev => ({ ...prev, platforms: newPlatforms }));
                    }}
                  >
                    {platform.charAt(0).toUpperCase() + platform.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Variations</label>
              <div className="space-y-4 mt-2">
                {testConfig.variations.map((variation, index) => (
                  <div key={variation.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Variation {index + 1}</span>
                      {testConfig.variations.length > 2 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeVariation(index)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm">Title</label>
                        <Input
                          value={variation.title}
                          onChange={(e) => updateVariation(index, 'title', e.target.value)}
                          placeholder="Enter title"
                        />
                      </div>
                      <div>
                        <label className="text-sm">Description</label>
                        <Input
                          value={variation.description}
                          onChange={(e) => updateVariation(index, 'description', e.target.value)}
                          placeholder="Enter description"
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="text-sm">Content</label>
                      <Textarea
                        value={variation.content}
                        onChange={(e) => updateVariation(index, 'content', e.target.value)}
                        placeholder="Enter content"
                        rows={3}
                      />
                    </div>
                  </div>
                ))}
                <Button variant="outline" onClick={addVariation} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Variation
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreateTest} disabled={createTestMutation.isPending}>
                {createTestMutation.isPending ? 'Creating...' : 'Create Test'}
              </Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Active Tests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {tests.filter(test => test.status === 'running').map((test: ABTest) => (
                <div
                  key={test.testId}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedTest === test.testId ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedTest(test.testId)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{test.testName}</h3>
                    <Badge className={getStatusColor(test.status)}>
                      {getStatusIcon(test.status)}
                      <span className="ml-1">{test.status}</span>
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600">
                    Created {format(test.createdAt, 'MMM dd, yyyy')}
                  </p>
                </div>
              ))}
              {tests.filter(test => test.status === 'running').length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <FlaskConical className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No active tests</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Completed Tests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {tests.filter(test => test.status === 'completed').map((test: ABTest) => (
                <div
                  key={test.testId}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedTest === test.testId ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedTest(test.testId)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{test.testName}</h3>
                    <Badge className={getStatusColor(test.status)}>
                      {getStatusIcon(test.status)}
                      <span className="ml-1">{test.status}</span>
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600">
                    Completed {test.completedAt ? format(test.completedAt, 'MMM dd, yyyy') : 'Unknown'}
                  </p>
                  {test.winnerVariationId && (
                    <p className="text-sm text-green-600 font-medium">
                      Winner: {test.winnerVariationId}
                    </p>
                  )}
                </div>
              ))}
              {tests.filter(test => test.status === 'completed').length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No completed tests</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Test Details */}
      {selectedTest && (testStatus || testResults) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Test Details
              </div>
              {testStatus?.status === 'running' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cancelTestMutation.mutate(selectedTest)}
                  disabled={cancelTestMutation.isPending}
                >
                  {cancelTestMutation.isPending ? 'Cancelling...' : 'Cancel Test'}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {testStatus && testStatus.status === 'running' && (
              <div className="space-y-6">
                {/* Progress */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Progress</span>
                    <span className="text-sm text-gray-600">{testStatus.progress.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${testStatus.progress}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Estimated completion: {format(testStatus.estimatedCompletion, 'MMM dd, yyyy HH:mm')}
                  </p>
                </div>

                {/* Current Results */}
                {testStatus.currentResults.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-3">Current Results</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {testStatus.currentResults.map((result, index) => (
                        <div key={index} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{result.variationId}</span>
                            <Badge variant="outline">{result.platform}</Badge>
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span>Views:</span>
                              <span>{formatNumber(result.views)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Engagement:</span>
                              <span>{formatPercentage(result.engagementRate)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Revenue:</span>
                              <span>${result.revenue.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alerts */}
                {testStatus.alerts.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-3">Alerts</h3>
                    <div className="space-y-2">
                      {testStatus.alerts.map((alert, index) => (
                        <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            <span className="text-sm text-yellow-800">{alert}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {testResults && (
              <div className="space-y-6">
                {/* Winner */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <h3 className="font-medium text-green-800">Test Completed</h3>
                  </div>
                  <p className="text-green-700">
                    Winner: <span className="font-medium">{testResults.winner}</span>
                  </p>
                  <p className="text-green-700">
                    Confidence: <span className="font-medium">{formatPercentage(testResults.confidence)}</span>
                  </p>
                </div>

                {/* Statistical Analysis */}
                <div>
                  <h3 className="font-medium mb-3">Statistical Analysis</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        {testResults.statisticalAnalysis.isSignificant ? 'Yes' : 'No'}
                      </div>
                      <div className="text-sm text-blue-600">Significant</div>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">
                        {testResults.statisticalAnalysis.pValue.toFixed(4)}
                      </div>
                      <div className="text-sm text-purple-600">P-Value</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        {testResults.statisticalAnalysis.effectSize.toFixed(3)}
                      </div>
                      <div className="text-sm text-green-600">Effect Size</div>
                    </div>
                    <div className="text-center p-3 bg-orange-50 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">
                        {testResults.statisticalAnalysis.sampleSize}
                      </div>
                      <div className="text-sm text-orange-600">Sample Size</div>
                    </div>
                  </div>
                </div>

                {/* Results Chart */}
                <div>
                  <h3 className="font-medium mb-3">Performance Comparison</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={testResults.results}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="variationId" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="engagementRate" fill="#8884d8" name="Engagement Rate (%)" />
                      <Bar dataKey="views" fill="#82ca9d" name="Views" />
                      <Bar dataKey="revenue" fill="#ffc658" name="Revenue ($)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Recommendations */}
                <div>
                  <h3 className="font-medium mb-3">Recommendations</h3>
                  <div className="space-y-2">
                    {testResults.recommendations.map((rec, index) => (
                      <div key={index} className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
                        <Zap className="h-4 w-4 text-blue-600 mt-0.5" />
                        <span className="text-sm text-blue-800">{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Insights */}
                <div>
                  <h3 className="font-medium mb-3">Key Insights</h3>
                  <div className="space-y-2">
                    {testResults.insights.map((insight, index) => (
                      <div key={index} className="flex items-start gap-2 p-3 bg-green-50 rounded-lg">
                        <TrendingUp className="h-4 w-4 text-green-600 mt-0.5" />
                        <span className="text-sm text-green-800">{insight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
} 