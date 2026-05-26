import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { AnalyticsData } from '../types';
import { TrendingUp, Users, MessageCircle, FileCheck, LogOut, ChevronDown } from 'lucide-react';

export default function Dashboard({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [data, setData] = useState<AnalyticsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    fetch('/api/analytics')
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="animate-pulse space-y-8">
     <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-zinc-900/50 rounded-2xl border border-white/5" />)}
     </div>
     <div className="h-64 bg-zinc-900/50 rounded-2xl border border-white/5" />
  </div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-4xl font-extrabold text-white leading-tight tracking-tight">Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">{user.displayName?.split(' ')[0] || 'User'}</span> 👋</h1>
          <p className="text-zinc-400 mt-2 text-lg">Here's what's happening with your FAQ Bot today.</p>
        </div>

        <div className="group w-full max-w-sm lg:w-auto">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/70 p-2 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-purple-500/30 hover:bg-zinc-900/90 hover:shadow-[0_0_30px_rgba(168,85,247,0.12)]">
            {user.photoURL && !imgError ? (
              <img 
                src={user.photoURL} 
                alt="" 
                className="h-11 w-11 rounded-xl border border-white/10 bg-zinc-800 object-cover" 
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="h-11 w-11 shrink-0 rounded-xl border border-white/10 bg-zinc-800 flex items-center justify-center text-purple-400 font-bold text-lg">
                {(user.displayName || user.email || 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1 pr-2">
              <p className="truncate text-sm font-bold text-white">{user.displayName || 'User'}</p>
              <p className="truncate text-xs text-zinc-500">{user.email}</p>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-zinc-500 transition-transform duration-300 group-hover:rotate-180 group-hover:text-purple-300 sm:block" />
            <button
              onClick={onSignOut}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-red-500/10 bg-red-500/5 px-3 text-red-400 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden text-sm font-semibold sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatsCard 
          title="Total Queries" 
          value="1,284" 
          change="+12.5%" 
          icon={<MessageCircle className="w-6 h-6 text-purple-400" />} 
          color="purple"
        />
        <StatsCard 
          title="Active Users" 
          value="452" 
          change="+8.2%" 
          icon={<Users className="w-6 h-6 text-blue-400" />} 
          color="blue"
        />
        <StatsCard 
          title="Avg. Accuracy" 
          value="92.4%" 
          change="+2.1%" 
          icon={<TrendingUp className="w-6 h-6 text-emerald-400" />} 
          color="emerald"
        />
        <StatsCard 
          title="Docs Managed" 
          value="18" 
          change="Updated" 
          icon={<FileCheck className="w-6 h-6 text-orange-400" />} 
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-zinc-900/40 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500/50 to-transparent"></div>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-white">Bot Activity</h2>
            <div className="flex items-center gap-2 text-sm text-zinc-300 bg-black/40 px-3 py-1.5 rounded-full border border-white/5">
              <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)] animate-pulse"></span>
              Daily Queries
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorQueries" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#71717a', fontSize: 12}} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#71717a', fontSize: 12}}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(24,24,27,0.8)', backdropFilter: 'blur(12px)', color: '#fff', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#e4e4e7' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="queries" 
                  stroke="#a855f7" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorQueries)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-zinc-900/40 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500/50 to-transparent"></div>
          <h2 className="text-xl font-bold text-white mb-8">Performance Accuracy</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#71717a', fontSize: 10}}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#71717a', fontSize: 12}}
                  domain={[0, 1]}
                  tickFormatter={(val) => `${(val * 100).toFixed(0)}%`}
                />
                <Tooltip 
                   formatter={(val: number) => [`${(val * 100).toFixed(1)}%`, 'Accuracy']}
                   contentStyle={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(24,24,27,0.8)', backdropFilter: 'blur(12px)', color: '#fff', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)' }}
                />
                <Bar dataKey="accuracy" radius={[6, 6, 0, 0]}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.accuracy > 0.9 ? '#10b981' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatsCard({ title, value, change, icon, color }: { title: string, value: string, change: string, icon: React.ReactNode, color: string }) {
  const bgColors = {
    blue: 'bg-blue-500/10 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]',
    purple: 'bg-purple-500/10 border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]',
    orange: 'bg-orange-500/10 border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.1)]'
  };
  
  return (
    <div className="bg-zinc-900/40 backdrop-blur-xl p-6 rounded-3xl border border-white/5 shadow-lg group hover:shadow-[0_0_30px_rgba(255,255,255,0.05)] hover:border-white/10 transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-2xl border ${bgColors[color as keyof typeof bgColors]} group-hover:scale-110 transition-transform duration-300`}>
          {icon}
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${change.startsWith('+') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
          {change}
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-400">{title}</p>
        <p className="text-3xl font-extrabold text-white mt-1 tracking-tight">{value}</p>
      </div>
    </div>
  );
}
