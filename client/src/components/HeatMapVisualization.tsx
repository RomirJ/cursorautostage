import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { 
  TrendingUp, 
  TrendingDown, 
  Eye, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Maximize2,
  Minimize2
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
  Area,
  AreaChart,
  Scatter,
  ScatterChart,
  ComposedChart
} from "recharts";

interface HeatMapData {
  segmentId: string;
  title: string;
  duration: number;
  watchTimeData: Array<{
    timestamp: number;
    retentionRate: number;
    dropOffRate: number;
    engagementEvents: number;
    viewerCount: number;
    heatmapIntensity: number;
  }>;
  hookDuration: number;
  avgWatchTime: number;
  completionRate: number;
  bestPerformingMoments: Array<{
    timestamp: number;
    reason: string;
    engagementSpike: number;
    retentionBoost: number;
  }>;
  dropoffPoints: Array<{
    timestamp: number;
    severity: 'low' | 'medium' | 'high';
    reason: string;
    viewerLoss: number;
  }>;
  insights: string[];
  recommendations: string[];
  performanceScore: number;
}

interface HeatMapVisualizationProps {
  segmentId: string;
  onClose?: () => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
        <p className="font-medium">{`${label}s`}</p>
        <div className="space-y-1 text-sm">
          <p>Retention: <span className="font-medium">{data.retentionRate}%</span></p>
          <p>Drop-off: <span className="font-medium">{data.dropOffRate}%</span></p>
          <p>Engagement: <span className="font-medium">{data.engagementEvents} events</span></p>
          <p>Viewers: <span className="font-medium">{data.viewerCount.toLocaleString()}</span></p>
        </div>
      </div>
    );
  }
  return null;
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
  switch (severity) {
    case 'low': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'medium': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'high': return 'bg-red-100 text-red-800 border-red-200';
  }
};

const getPerformanceColor = (score: number) => {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
};

export default function HeatMapVisualization({ segmentId, onClose }: HeatMapVisualizationProps) {
  const [selectedView, setSelectedView] = useState<'overview' | 'detailed' | 'insights'>('overview');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fetch heat map data
  const { data: heatMap, isLoading, error } = useQuery({
    queryKey: ['/api/analytics/heatmap', segmentId],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/heatmap/${segmentId}`);
      if (!response.ok) throw new Error('Failed to fetch heat map data');
      const data = await response.json();
      return data.heatMap as HeatMapData;
    },
  });

  // Fetch visualization data
  const { data: visualization } = useQuery({
    queryKey: ['/api/analytics/heatmap/visualization', segmentId],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/heatmap/${segmentId}/visualization`);
      if (!response.ok) throw new Error('Failed to fetch visualization data');
      const data = await response.json();
      return data.visualization;
    },
  });

  if (isLoading) {
    return (
      <Card className={isFullscreen ? "fixed inset-0 z-50 m-4" : ""}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-gray-600">Loading heat map data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !heatMap) {
    return (
      <Card className={isFullscreen ? "fixed inset-0 z-50 m-4" : ""}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-600">Failed to load heat map data</p>
            <Button variant="outline" onClick={() => window.location.reload()} className="mt-2">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = heatMap.watchTimeData.map(point => ({
    ...point,
    time: formatTime(point.timestamp),
    intensity: point.heatmapIntensity
  }));

  return (
    <Card className={isFullscreen ? "fixed inset-0 z-50 m-4 overflow-auto" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            <CardTitle>Watch-Time Heat Map: {heatMap.title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            {onClose && (
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>

        {/* Performance Score */}
        <div className="flex items-center gap-4 mt-4">
          <div className="text-center">
            <div className={`text-2xl font-bold ${getPerformanceColor(heatMap.performanceScore)}`}>
              {heatMap.performanceScore}/100
            </div>
            <div className="text-sm text-gray-600">Performance Score</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {formatTime(heatMap.avgWatchTime)}
            </div>
            <div className="text-sm text-gray-600">Avg Watch Time</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {heatMap.completionRate.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">Completion Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {heatMap.bestPerformingMoments.length}
            </div>
            <div className="text-sm text-gray-600">Best Moments</div>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex gap-2 mt-4">
          <Button
            variant={selectedView === 'overview' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedView('overview')}
          >
            Overview
          </Button>
          <Button
            variant={selectedView === 'detailed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedView('detailed')}
          >
            Detailed Analysis
          </Button>
          <Button
            variant={selectedView === 'insights' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedView('insights')}
          >
            Insights & Recommendations
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {selectedView === 'overview' && (
          <div className="space-y-6">
            {/* Main Heat Map Chart */}
            <div>
              <h3 className="font-medium mb-3">Watch-Time Retention Heat Map</h3>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="time" 
                    label={{ value: 'Time', position: 'insideBottom', offset: -10 }}
                  />
                  <YAxis 
                    label={{ value: 'Retention Rate (%)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  
                  {/* Retention Rate Line */}
                  <Line
                    type="monotone"
                    dataKey="retentionRate"
                    stroke="#8884d8"
                    strokeWidth={3}
                    name="Retention Rate"
                    dot={{ fill: '#8884d8', strokeWidth: 2, r: 4 }}
                  />
                  
                  {/* Drop-off Rate Area */}
                  <Area
                    type="monotone"
                    dataKey="dropOffRate"
                    stroke="#ff7300"
                    fill="#ff7300"
                    fillOpacity={0.3}
                    name="Drop-off Rate"
                  />
                  
                  {/* Engagement Events Scatter */}
                  <Scatter
                    dataKey="engagementEvents"
                    fill="#82ca9d"
                    name="Engagement Events"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Best Performing Moments */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    Best Moments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {heatMap.bestPerformingMoments.slice(0, 3).map((moment, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{formatTime(moment.timestamp)}</span>
                        <Badge variant="outline" className="text-xs">
                          {moment.engagementSpike} events
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Drop-off Points */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-600" />
                    Drop-off Points
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {heatMap.dropoffPoints.slice(0, 3).map((dropoff, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{formatTime(dropoff.timestamp)}</span>
                        <Badge className={`text-xs ${getSeverityColor(dropoff.severity)}`}>
                          {dropoff.severity}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Hook Analysis */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Play className="h-4 w-4 text-blue-600" />
                    Hook Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Hook Duration:</span>
                      <span className="font-medium">{formatTime(heatMap.hookDuration)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Early Retention:</span>
                      <span className="font-medium">
                        {heatMap.watchTimeData.slice(0, 3).reduce((sum, p) => sum + p.retentionRate, 0) / 3}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Engagement Spikes:</span>
                      <span className="font-medium">
                        {heatMap.watchTimeData.filter(p => p.engagementEvents > 5).length}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {selectedView === 'detailed' && (
          <div className="space-y-6">
            {/* Detailed Retention Analysis */}
            <div>
              <h3 className="font-medium mb-3">Detailed Retention Analysis</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="retentionRate"
                    stroke="#8884d8"
                    fill="#8884d8"
                    fillOpacity={0.6}
                    name="Retention Rate"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Engagement Events Timeline */}
            <div>
              <h3 className="font-medium mb-3">Engagement Events Timeline</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="engagementEvents" fill="#82ca9d" name="Engagement Events" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Viewer Count Changes */}
            <div>
              <h3 className="font-medium mb-3">Viewer Count Changes</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="viewerCount"
                    stroke="#ff7300"
                    strokeWidth={2}
                    name="Viewer Count"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Detailed Drop-off Analysis */}
            <div>
              <h3 className="font-medium mb-3">Drop-off Analysis</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {heatMap.dropoffPoints.map((dropoff, index) => (
                  <Card key={index} className="border-l-4 border-red-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{formatTime(dropoff.timestamp)}</span>
                        <Badge className={getSeverityColor(dropoff.severity)}>
                          {dropoff.severity.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{dropoff.reason}</p>
                      <p className="text-sm">
                        <span className="font-medium">Viewer Loss:</span> {dropoff.viewerLoss.toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedView === 'insights' && (
          <div className="space-y-6">
            {/* Key Insights */}
            <div>
              <h3 className="font-medium mb-3">Key Insights</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {heatMap.insights.map((insight, index) => (
                  <Card key={index} className="border-l-4 border-blue-500">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2">
                        <TrendingUp className="h-4 w-4 text-blue-600 mt-0.5" />
                        <p className="text-sm">{insight}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            <div>
              <h3 className="font-medium mb-3">Optimization Recommendations</h3>
              <div className="space-y-3">
                {heatMap.recommendations.map((recommendation, index) => (
                  <Card key={index} className="border-l-4 border-green-500">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium mb-1">Recommendation {index + 1}</p>
                          <p className="text-sm text-gray-600">{recommendation}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Performance Summary */}
            <div>
              <h3 className="font-medium mb-3">Performance Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {heatMap.performanceScore}
                  </div>
                  <div className="text-sm text-blue-600">Performance Score</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {heatMap.completionRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-green-600">Completion Rate</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {heatMap.bestPerformingMoments.length}
                  </div>
                  <div className="text-sm text-purple-600">Best Moments</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {heatMap.dropoffPoints.length}
                  </div>
                  <div className="text-sm text-red-600">Drop-off Points</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 