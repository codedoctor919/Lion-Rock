"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';

interface Metrics {
  active_subscribers: number;
  monthly_messages: number;
  api_cost: number;
  system_status: string;
  top_prompts: [string, number][];
  last_updated: string;
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const router = useRouter();

  const fetchMetrics = async () => {
    try {
      const response = await fetch('https://lionrock-6p8fy.ondigitalocean.app/admin/api/metrics', {
        credentials: 'include', // Important for cookies
      });

      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }

      const data = await response.json();
      setMetrics(data);
      setLastUpdated(new Date().toLocaleString());
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();

    // Set up auto-refresh
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchMetrics, 30000); // 30 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, router]);

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  const refreshData = () => {
    setLoading(true);
    fetchMetrics();
  };

  if (loading && !metrics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      {/* Status Bar */}
      <div className="mb-8 bg-white rounded-2xl shadow-lg p-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center space-y-4 lg:space-y-0">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                metrics?.system_status === 'Online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`}></div>
              <span className="font-semibold text-gray-800">System Status:</span>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                metrics?.system_status === 'Online' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {metrics?.system_status}
              </span>
            </div>
            <div className="hidden lg:block w-px h-6 bg-gray-300"></div>
            <div className="text-sm text-gray-600">
              <i className="fas fa-clock mr-1"></i>
              Last updated: <span className="font-semibold">{lastUpdated}</span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={toggleAutoRefresh}
              className={`px-4 py-2 rounded-lg transition-all duration-200 font-semibold flex items-center space-x-2 ${
                autoRefresh 
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              <i className={`fas ${autoRefresh ? 'fa-pause' : 'fa-play'}`}></i>
              <span>{autoRefresh ? 'Pause Auto-Refresh' : 'Start Auto-Refresh'}</span>
            </button>
            <button 
              onClick={refreshData}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all duration-200 font-semibold flex items-center space-x-2"
            >
              <i className="fas fa-sync-alt"></i>
              <span>Refresh Now</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Active Subscribers */}
        <MetricCard
          title="Active Subscribers"
          value={metrics?.active_subscribers || 0}
          icon="users"
          color="blue"
          description="Today's active users"
        />

        {/* Monthly Messages */}
        <MetricCard
          title="Monthly Messages"
          value={metrics?.monthly_messages || 0}
          icon="comments"
          color="green"
          description="This month's total"
          format="number"
        />

        {/* API Cost */}
        <MetricCard
          title="API Cost"
          value={metrics?.api_cost || 0}
          icon="dollar-sign"
          color="purple"
          description="Estimated monthly"
          format="currency"
        />

        {/* System Status */}
        <MetricCard
          title="System Status"
          value={metrics?.system_status || 'Loading...'}
          icon="server"
          color="green"
          description="Service health"
          isStatus={true}
        />
      </div>

      {/* Top Prompts Section */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-800 flex items-center">
            <i className="fas fa-chart-line mr-3 text-blue-500"></i>
            Top Used Prompts
          </h3>
          <span className="text-gray-500 text-sm bg-gray-100 px-3 py-1 rounded-full">This Month</span>
        </div>
        
        <div className="space-y-4">
          {metrics?.top_prompts && metrics.top_prompts.length > 0 ? (
            metrics.top_prompts.map(([prompt, count], index) => (
              <PromptItem
                key={prompt}
                rank={index + 1}
                prompt={prompt}
                count={count}
                totalMessages={metrics.monthly_messages}
              />
            ))
          ) : (
            <div className="text-center py-8 text-gray-500">
              <i className="fas fa-chart-bar text-4xl mb-4 opacity-50"></i>
              <p>No prompt usage data available yet</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

// Metric Card Component
interface MetricCardProps {
  title: string;
  value: number | string;
  icon: string;
  color: 'blue' | 'green' | 'purple' | 'red';
  description: string;
  format?: 'number' | 'currency' | 'default';
  isStatus?: boolean;
}

function MetricCard({ title, value, icon, color, description, format = 'default', isStatus = false }: MetricCardProps) {
  const colorClasses = {
    blue: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-500' },
    green: { bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-500' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-500' },
    red: { bg: 'bg-red-100', text: 'text-red-600', border: 'border-red-500' },
  };

  const formatValue = (val: number | string) => {
    if (typeof val === 'number') {
      if (format === 'currency') {
        return `$${val.toFixed(2)}`;
      } else if (format === 'number') {
        return val.toLocaleString();
      }
    }
    return val;
  };

  return (
    <div className={`bg-white rounded-2xl shadow-lg p-6 border-l-4 ${colorClasses[color].border} transition-all duration-300 hover:shadow-xl hover:-translate-y-1`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm font-semibold uppercase tracking-wide">{title}</p>
          <h2 className="text-3xl font-bold text-gray-800 mt-2">
            {formatValue(value)}
          </h2>
          <p className="text-gray-500 text-xs mt-1">{description}</p>
        </div>
        <div className={`w-12 h-12 ${colorClasses[color].bg} rounded-xl flex items-center justify-center`}>
          <i className={`fas fa-${icon} ${colorClasses[color].text} text-xl`}></i>
        </div>
      </div>
    </div>
  );
}

// Prompt Item Component
interface PromptItemProps {
  rank: number;
  prompt: string;
  count: number;
  totalMessages: number;
}

function PromptItem({ rank, prompt, count, totalMessages }: PromptItemProps) {

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
      <div className="flex items-center space-x-4">
        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
          {rank}
        </div>
        <div>
          <h4 className="font-semibold text-gray-800">{prompt}</h4>
          <p className="text-gray-600 text-sm">{count} uses</p>
        </div>
      </div>
      <div className="text-right">
      </div>
    </div>
  );
}