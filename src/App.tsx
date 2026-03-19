import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Activity, Settings, CheckCircle, XCircle, RefreshCw, X, Save, Upload, FileSpreadsheet, Users, LogIn, UserPlus, LogOut, Search, ArrowDown, ArrowUp, Copy, Check, LayoutGrid, AlertCircle, User, Cpu, Zap, Shield, Globe, BarChart3, ChevronRight, HelpCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import * as XLSX from 'xlsx';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface Channel {
  docId: string;
  id: string;
  isLive: boolean;
  addedAt: string;
  lastLiveAt?: string;
  coverUrl?: string;
  title?: string;
  viewerCount?: number;
  isTemporary?: boolean;
}

interface ConfigStatus {
  firebase: boolean;
  telegramBot: boolean;
  telegramChatId: boolean;
}

const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');
  const headers: any = {
    ...options.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.reload();
  }
  return res;
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [showAuth, setShowAuth] = useState(false);

  const handleLogin = (user: string, token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('username', user);
    setUsername(user);
    setIsAuthenticated(true);
    setShowAuth(false);
  };

  if (isAuthenticated) {
    return <MainApp username={username} onLogout={() => {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      setIsAuthenticated(false);
    }} />;
  }

  if (showAuth) {
    return <AuthScreen onLogin={handleLogin} onBack={() => setShowAuth(false)} />;
  }

  return <LandingPage onGetStarted={() => setShowAuth(true)} />;
}

function LandingPage({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="min-h-screen bg-white font-sans text-zinc-900 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">LiveMonitor</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-500">
            <a href="#features" className="hover:text-emerald-600 transition-colors">Tính năng</a>
            <a href="#how-it-works" className="hover:text-emerald-600 transition-colors">Hướng dẫn</a>
            <a href="#stats" className="hover:text-emerald-600 transition-colors">Thống kê</a>
          </div>
          <button 
            onClick={onGetStarted}
            className="bg-zinc-900 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-zinc-800 transition-all active:scale-95"
          >
            Bắt đầu ngay
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
              <Zap className="w-3 h-3" />
              Công nghệ giám sát thời gian thực
            </div>
            <h1 className="text-6xl md:text-8xl font-bold leading-[0.9] tracking-tighter">
              GIÁM SÁT <br />
              <span className="text-emerald-600">LIVE STREAM</span> <br />
              THÔNG MINH.
            </h1>
            <p className="text-xl text-zinc-500 max-w-lg leading-relaxed">
              Hệ thống tự động theo dõi trạng thái livestream trên TikTok, thông báo tức thì qua Telegram và quản lý danh sách kênh tập trung.
            </p>
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={onGetStarted}
                className="bg-emerald-600 text-white px-8 py-4 rounded-2xl text-lg font-semibold hover:bg-emerald-700 transition-all flex items-center gap-2 group"
              >
                Trải nghiệm miễn phí
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <div className="flex -space-x-3 items-center pl-4">
                {[1, 2, 3, 4].map(i => (
                  <img 
                    key={i}
                    src={`https://picsum.photos/seed/user${i}/100/100`} 
                    className="w-12 h-12 rounded-full border-4 border-white object-cover"
                    alt="User"
                    referrerPolicy="no-referrer"
                  />
                ))}
                <div className="pl-6 text-sm font-medium text-zinc-400">
                  <span className="text-zinc-900 font-bold">500+</span> người dùng tin tưởng
                </div>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-emerald-100/50 rounded-[40px] blur-3xl -z-10 animate-pulse"></div>
            <div className="bg-zinc-900 rounded-[32px] p-4 shadow-2xl border border-white/10 overflow-hidden transform rotate-2 hover:rotate-0 transition-transform duration-700">
              <div className="bg-zinc-800/50 rounded-2xl p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-ping"></div>
                    <span className="text-white font-bold">Đang giám sát 124 kênh</span>
                  </div>
                  <div className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-mono">
                    LIVE: 42
                  </div>
                </div>
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-zinc-700 overflow-hidden">
                          <img src={`https://picsum.photos/seed/stream${i}/100/100`} alt="Stream" referrerPolicy="no-referrer" />
                        </div>
                        <div>
                          <div className="text-white text-sm font-bold">Kênh TikTok #{i}</div>
                          <div className="text-zinc-500 text-xs">Vừa bắt đầu live</div>
                        </div>
                      </div>
                      <div className="text-emerald-500">
                        <Activity className="w-4 h-4" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works section - Enhanced visuals */}
      <section id="how-it-works" className="py-32 bg-white relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 opacity-[0.03]">
          <div className="absolute top-0 left-0 w-full h-full" style={{ backgroundImage: 'radial-gradient(#10b981 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-24 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-widest">
              Quy trình đơn giản
            </div>
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter">3 BƯỚC ĐỂ BẮT ĐẦU</h2>
            <p className="text-zinc-500 text-lg">Thiết lập hệ thống giám sát của bạn chỉ trong chưa đầy 1 phút.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connector Line (Desktop) */}
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-zinc-100 -translate-y-1/2 -z-10"></div>
            
            {[
              {
                step: "01",
                title: "Nhập danh sách",
                desc: "Tải lên file Excel hoặc dán link Google Sheets chứa danh sách TikTok ID cần theo dõi.",
                icon: <FileSpreadsheet className="w-10 h-10 text-emerald-600" />,
                color: "bg-emerald-50",
                borderColor: "border-emerald-100"
              },
              {
                step: "02",
                title: "Thêm tạm thời",
                desc: "Sử dụng chế độ 'Tạm thời' để quét nhanh mà không cần lưu trữ vĩnh viễn vào cơ sở dữ liệu.",
                icon: <Clock className="w-10 h-10 text-blue-600" />,
                color: "bg-blue-50",
                borderColor: "border-blue-100"
              },
              {
                step: "03",
                title: "Cập nhật Live",
                desc: "Hệ thống tự động quét và thông báo qua Telegram ngay khi kênh bắt đầu livestream.",
                icon: <Zap className="w-10 h-10 text-amber-600" />,
                color: "bg-amber-50",
                borderColor: "border-amber-100"
              }
            ].map((item, idx) => (
              <div key={idx} className="relative group">
                <div className="bg-white p-10 rounded-[48px] border border-zinc-100 shadow-sm hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 flex flex-col items-center text-center">
                  <div className={`w-24 h-24 ${item.color} rounded-[32px] flex items-center justify-center mb-8 group-hover:rotate-6 transition-transform duration-500 border-4 border-white shadow-lg`}>
                    {item.icon}
                  </div>
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-zinc-900 text-white w-10 h-10 rounded-full flex items-center justify-center font-black text-sm border-4 border-white shadow-md">
                    {item.step}
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{item.title}</h3>
                  <p className="text-zinc-500 leading-relaxed text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-32 bg-zinc-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Mọi thứ bạn cần để quản lý</h2>
            <p className="text-zinc-500 text-lg">Hệ thống được tối ưu hóa cho hiệu suất và độ chính xác cao nhất.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: <Zap className="w-8 h-8" />, title: "Tốc độ cực nhanh", desc: "Phát hiện trạng thái live chỉ trong vài giây sau khi bắt đầu." },
              { icon: <Shield className="w-8 h-8" />, title: "Bảo mật tuyệt đối", desc: "Dữ liệu cấu hình của bạn được mã hóa và lưu trữ an toàn." },
              { icon: <Globe className="w-8 h-8" />, title: "Đa nền tảng", desc: "Hoạt động mượt mà trên mọi thiết bị và trình duyệt." },
              { icon: <BarChart3 className="w-8 h-8" />, title: "Thống kê chi tiết", desc: "Theo dõi lịch sử live và số lượng người xem theo thời gian." },
              { icon: <Users className="w-8 h-8" />, title: "Quản lý tập trung", desc: "Thêm hàng trăm kênh cùng lúc qua file Excel dễ dàng." },
              { icon: <Activity className="w-8 h-8" />, title: "Thông báo tức thì", desc: "Tích hợp Telegram Bot gửi tin nhắn ngay khi có biến động." }
            ].map((f, i) => (
              <div key={i} className="bg-white p-10 rounded-[32px] border border-zinc-100 hover:shadow-xl transition-all group">
                <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold mb-4">{f.title}</h3>
                <p className="text-zinc-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-zinc-100">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">LiveMonitor</span>
          </div>
          <div className="text-zinc-400 text-sm">
            © 2026 LiveMonitor. All rights reserved.
          </div>
          <div className="flex gap-6 text-sm font-medium text-zinc-500">
            <a href="#" className="hover:text-zinc-900">Điều khoản</a>
            <a href="#" className="hover:text-zinc-900">Bảo mật</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AuthScreen({ onLogin, onBack }: { onLogin: (username: string, token: string) => void, onBack: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      let data;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Server error: ${text.slice(0, 50)}...`);
      }

      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      
      onLogin(data.username, data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans relative">
      <button 
        onClick={onBack}
        className="absolute top-8 left-8 flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors font-medium"
      >
        <X className="w-5 h-5" />
        Quay lại
      </button>
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-zinc-100">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
            <Activity className="w-8 h-8 text-emerald-600" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-zinc-900 mb-2">
          {isLogin ? 'Đăng nhập' : 'Đăng ký tài khoản'}
        </h1>
        <p className="text-center text-zinc-500 mb-8">
          {isLogin ? 'Chào mừng trở lại! Vui lòng đăng nhập.' : 'Tạo tài khoản để lưu cấu hình của bạn.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Tài khoản (ID chữ hoặc số)</label>
            <input
              type="text"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              placeholder="Nhập ID tài khoản của bạn"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Mật khẩu</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              placeholder="Nhập mật khẩu"
            />
          </div>

          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : (isLogin ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />)}
            {isLogin ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </form>

        <div className="mt-6 space-y-3">
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="w-full text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
          >
            {isLogin ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
          </button>
          
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-100"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-zinc-400">Hoặc</span>
            </div>
          </div>

          <button
            onClick={async () => {
              setLoading(true);
              setError('');
              try {
                const res = await fetch('/api/auth/guest', { method: 'GET' });
                const text = await res.text();
                
                if (!res.ok) {
                  throw new Error(`Server error (${res.status}): ${text.slice(0, 100)}`);
                }

                let data;
                try {
                  data = JSON.parse(text);
                } catch (e) {
                  throw new Error(`Invalid JSON response (Status ${res.status}): ${text.slice(0, 100)}`);
                }
                
                onLogin(data.username, data.token);
              } catch (err: any) {
                setError(err.message);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="w-full bg-white hover:bg-zinc-50 text-zinc-700 font-medium py-3 rounded-xl border border-zinc-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <User className="w-5 h-5" />
            Tiếp tục với tư cách Khách
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniRAMMonitor() {
  const [stats, setStats] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/system/stats');
        const data = await res.json();
        setStats(prev => [...prev.slice(-9), { ...data, time: new Date().toLocaleTimeString() }]);
      } catch (e) {
        console.error('Failed to fetch stats', e);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const currentMem = stats[stats.length - 1]?.rss || 0;

  return (
    <div className="flex items-center gap-3 bg-zinc-50/50 px-3 py-1.5 rounded-xl border border-zinc-100 min-w-0">
      <div className="flex flex-col">
        <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider leading-none mb-0.5">RAM</span>
        <span className="text-xs font-bold text-emerald-600 leading-none">{currentMem}MB</span>
      </div>
      <div className="h-5 w-12">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={stats}>
            <Area 
              type="monotone" 
              dataKey="rss" 
              stroke="#10b981" 
              strokeWidth={1.5}
              fill="#10b981" 
              fillOpacity={0.1}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface ScanLog {
  id: string;
  channelId: string;
  status: 'success' | 'error' | 'retrying' | 'info';
  message: string;
  timestamp: string;
  username: string;
}

function RealTimeLogConsole() {
  const [logs, setLogs] = useState<ScanLog[]>([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetchWithAuth('/api/system/logs');
        if (res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch (e) {
        console.error('Failed to fetch logs', e);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: ScanLog['status']) => {
    switch (status) {
      case 'success': return 'text-emerald-600';
      case 'error': return 'text-red-600';
      case 'retrying': return 'text-amber-600';
      default: return 'text-zinc-400';
    }
  };

  return (
    <div className="w-full max-w-full md:max-w-2xl h-9 bg-white border border-zinc-200 rounded-xl overflow-hidden relative flex items-center px-3 shadow-sm group min-w-0">
      <div className="flex items-center gap-2 shrink-0 mr-3 border-r border-zinc-100 pr-3 bg-white z-10">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">LOGS</span>
      </div>
      <div className="flex-1 overflow-hidden relative h-full flex items-center min-w-0">
        <div className="animate-marquee pause flex gap-12 items-center max-w-full">
           {logs.length === 0 ? (
             <span className="text-[11px] text-zinc-400 italic">Đang chờ dữ liệu...</span>
           ) : (
             // Duplicate logs to ensure seamless loop
             [...logs, ...logs].map((log, idx) => (
               <div key={`${log.id}-${idx}`} className="flex items-center gap-2 text-[11px] whitespace-nowrap">
                 <span className="text-zinc-400 font-mono">[{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}]</span>
                 <span className={`${getStatusColor(log.status)} font-bold uppercase text-[9px]`}>{log.status}</span>
                 <span className="text-zinc-600 font-medium">@{log.channelId}: {log.message}</span>
               </div>
             ))
           )}
        </div>
      </div>
    </div>
  );
}

function MainApp({ username, onLogout }: { username: string, onLogout: () => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [filter, setFilter] = useState<'all' | 'live' | 'off'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc' | 'none'>('none');
  const [gridCols, setGridCols] = useState<number>(6);
  const [newChannel, setNewChannel] = useState('');
  const [loading, setLoading] = useState(false);
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [error, setError] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isEcoMode, setIsEcoMode] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isTemporary, setIsTemporary] = useState(false);

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [checkingId, setCheckingId] = useState<string | null>(null);

  const handleCheckNow = async (channelId: string, docId: string) => {
    setCheckingId(docId);
    try {
      const res = await fetchWithAuth('/api/channels/check-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, docId })
      });
      if (res.ok) {
        fetchChannels();
      } else {
        const data = await res.json();
        alert(`Lỗi: ${data.error || 'Không thể kiểm tra kênh'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối server');
    } finally {
      setCheckingId(null);
    }
  };
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [checkResult, setCheckResult] = useState<{isLive: boolean, message: string, coverUrl?: string} | null>(null);

  const fetchChannels = async () => {
    try {
      const res = await fetchWithAuth('/api/channels');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch channels');
      
      data.sort((a: any, b: any) => {
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        
        const timeA = a.lastLiveAt ? new Date(a.lastLiveAt).getTime() : 0;
        const timeB = b.lastLiveAt ? new Date(b.lastLiveAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        
        return a.id.localeCompare(b.id);
      });
      
      setChannels(data);
      setQuotaExceeded(false);
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('Quota exceeded')) {
        setQuotaExceeded(true);
      }
    }
  };

  const fetchConfigStatus = async () => {
    try {
      const res = await fetchWithAuth('/api/config-status');
      const data = await res.json();
      setConfigStatus(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const quotaExceededRef = useRef(false);
  useEffect(() => {
    quotaExceededRef.current = quotaExceeded;
  }, [quotaExceeded]);

  useEffect(() => {
    fetchConfigStatus();
    fetchChannels();
  }, []);

  useEffect(() => {
    const scanInterval = isEcoMode ? 5 * 60 * 1000 : 30 * 1000;
    const interval = setInterval(() => {
      if (!quotaExceededRef.current) {
        fetchChannels();
      }
    }, scanInterval);
    return () => clearInterval(interval);
  }, [isEcoMode]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await fetchWithAuth('/api/channels/refresh', { method: 'POST' });
      await fetchChannels();
    } catch (err: any) {
      console.error('Refresh failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckChannel = async () => {
    if (!newChannel.trim()) return;
    
    setLoading(true);
    setError('');
    setCheckResult(null);
    try {
      const res = await fetchWithAuth(`/api/check-live?id=${newChannel.trim()}`);
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to check channel');
      
      setCheckResult({
        isLive: data.isLive,
        message: data.isLive ? `Kênh @${newChannel.trim()} đang LIVE!` : `Kênh @${newChannel.trim()} hiện KHÔNG live.`,
        coverUrl: data.coverUrl
      });
    } catch (err: any) {
      if (err.message?.includes('Quota exceeded')) {
        setError('Đã vượt quá hạn mức dữ liệu miễn phí trong ngày của Firebase. Vui lòng thử lại vào ngày mai.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannel.trim()) return;
    
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newChannel.trim(), isTemporary }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add channel');
      
      setNewChannel('');
      fetchChannels();
    } catch (err: any) {
      if (err.message?.includes('Quota exceeded')) {
        setError('Đã vượt quá hạn mức dữ liệu miễn phí trong ngày của Firebase. Vui lòng thử lại vào ngày mai.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChannel = async (docId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa kênh này?')) return;
    
    try {
      const res = await fetchWithAuth(`/api/channels/${docId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete channel');
      fetchChannels();
    } catch (err: any) {
      if (err.message?.includes('Quota exceeded')) {
        alert('Đã vượt quá hạn mức dữ liệu miễn phí trong ngày của Firebase. Vui lòng thử lại vào ngày mai.');
      } else {
        alert(err.message);
      }
    }
  };

  const processedChannels = channels
    .filter(c => filter === 'all' ? true : filter === 'live' ? c.isLive : !c.isLive)
    .filter(c => c.id.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortOrder === 'none') return 0;
      const countA = a.viewerCount || 0;
      const countB = b.viewerCount || 0;
      return sortOrder === 'desc' ? countB - countA : countA - countB;
    });

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans p-3 md:p-12 overflow-x-hidden max-w-full">
      <div className="max-w-[1600px] w-full mx-auto space-y-6 md:space-y-8">
        
        {quotaExceeded && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium">Đã vượt quá hạn mức dữ liệu miễn phí (Quota exceeded)</h3>
              <p className="text-sm mt-1 text-red-600">
                Ứng dụng đang sử dụng gói Firebase miễn phí và đã đạt giới hạn đọc/ghi dữ liệu trong ngày. 
                Hạn mức sẽ được tự động làm mới vào ngày mai. Bạn có thể xem chi tiết tại <a href="https://firebase.google.com/pricing#cloud-firestore" target="_blank" rel="noreferrer" className="underline font-medium hover:text-red-800">bảng giá Firebase</a>.
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <Activity className="text-emerald-500 shrink-0" />
              <span className="truncate">TikTok Live Monitor</span>
            </h1>
            <div className="text-zinc-500 mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm">Xin chào, <span className="font-semibold text-zinc-900">{username}</span></span>
              <button onClick={onLogout} className="text-[10px] bg-zinc-200 hover:bg-zinc-300 px-2 py-0.5 rounded-md transition-colors flex items-center gap-1">
                <LogOut className="w-3 h-3" /> Đăng xuất
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <button 
              onClick={() => setIsHelpOpen(true)}
              className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-all shrink-0"
              title="Hướng dẫn"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsImportOpen(true)}
              className="flex items-center gap-2 bg-white border border-zinc-200 px-3 md:px-4 py-2 rounded-xl hover:bg-zinc-50 transition-colors font-medium shadow-sm shrink-0 text-sm md:text-base"
            >
              <Upload className="w-4 h-4 md:w-5 md:h-5" />
              Nhập danh sách
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 bg-white border border-zinc-200 px-3 md:px-4 py-2 rounded-xl hover:bg-zinc-50 transition-colors font-medium shadow-sm shrink-0 text-sm md:text-base"
            >
              <Settings className="w-4 h-4 md:w-5 md:h-5" />
              Cấu hình
            </button>
          </div>
        </header>

        {/* Config Status */}
        {configStatus && (
          <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-zinc-100 flex flex-col md:flex-row gap-4 md:gap-6 justify-between items-start md:items-center mb-6 md:mb-8">
            <div className="space-y-1 min-w-0 flex-1">
              <h2 className="text-base md:text-lg font-semibold flex items-center gap-2 truncate">
                <Settings className="w-4 h-4 md:w-5 md:h-5 text-zinc-400" />
                Trạng thái hệ thống
              </h2>
              <p className="text-xs md:text-sm text-zinc-500">
                {configStatus.firebase ? 'Hệ thống lưu trữ (SQLite) đang hoạt động bình thường.' : 'Vui lòng kiểm tra lại cấu hình SQLite.'}
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 md:gap-4">
              <MiniRAMMonitor />
              <div className="h-8 w-px bg-zinc-100 hidden md:block mx-2"></div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge label="SQLite" active={configStatus.firebase} />
                <StatusBadge label="Telegram Bot" active={configStatus.telegramBot} />
                <StatusBadge label="Chat ID" active={configStatus.telegramChatId} />
                <StatusBadge label="Zalo Bot" active={configStatus.zaloBot} />
                <StatusBadge label="Zalo ID" active={configStatus.zaloUserId} />
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid lg:grid-cols-4 xl:grid-cols-5 gap-8">
          
          {/* Add Channel Form */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-zinc-100">
              <h2 className="text-lg font-semibold mb-4">Thêm kênh theo dõi</h2>
              <form onSubmit={handleAddChannel} className="space-y-4">
                <div>
                  <label htmlFor="channelId" className="block text-sm font-medium text-zinc-700 mb-1">
                    TikTok ID (không có @)
                  </label>
                  <input
                    id="channelId"
                    type="text"
                    value={newChannel}
                    onChange={(e) => {
                      setNewChannel(e.target.value);
                      setCheckResult(null);
                      setError('');
                    }}
                    placeholder="ví dụ: hoaa.hanassii"
                    className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all disabled:bg-zinc-100 disabled:cursor-not-allowed"
                    disabled={loading}
                  />
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                
                {checkResult && (
                  <div className={`p-4 rounded-xl border ${checkResult.isLive ? 'bg-red-50 border-red-200 text-red-700' : 'bg-zinc-50 border-zinc-200 text-zinc-700'} flex items-center gap-3`}>
                    {checkResult.coverUrl ? (
                      <img src={checkResult.coverUrl} alt="Cover" className="w-10 h-10 rounded-full object-cover border border-red-200" referrerPolicy="no-referrer" />
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${checkResult.isLive ? 'bg-red-100' : 'bg-zinc-200'}`}>
                        {checkResult.isLive ? <Activity className="w-5 h-5 text-red-600" /> : <XCircle className="w-5 h-5 text-zinc-500" />}
                      </div>
                    )}
                    <div className="font-medium text-sm">
                      {checkResult.message}
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="isTemporary"
                    checked={isTemporary}
                    onChange={(e) => setIsTemporary(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-zinc-300 focus:ring-emerald-500 shrink-0"
                  />
                  <label htmlFor="isTemporary" className="text-sm text-zinc-600 cursor-pointer leading-tight">
                    Thêm tạm thời (chỉ lưu trên RAM, không lưu Firebase)
                  </label>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="submit"
                    disabled={loading || !newChannel.trim()}
                    className="w-full sm:flex-1 flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-0"
                  >
                    {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    Thêm kênh
                  </button>
                  <button
                    type="button"
                    onClick={handleCheckChannel}
                    disabled={loading || !newChannel.trim()}
                    className="w-full sm:flex-1 flex items-center justify-center gap-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-4 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-0"
                  >
                    <Activity className="w-5 h-5" />
                    Kiểm tra ngay
                  </button>
                </div>
              </form>
            </div>
            
            <div className="bg-zinc-100 p-6 rounded-2xl text-sm text-zinc-600 space-y-2">
              <p className="font-semibold text-zinc-800">Hướng dẫn Telegram Bot:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Gõ <code className="bg-zinc-200 px-1 rounded">/check</code> để xem danh sách kênh đang live.</li>
                <li>Gõ <code className="bg-zinc-200 px-1 rounded">/&lt;id_kênh&gt;</code> để kiểm tra trạng thái 1 kênh.</li>
              </ul>
            </div>
          </div>

          {/* Channels List */}
          <div className="lg:col-span-3 xl:col-span-4 space-y-4 min-w-0 overflow-x-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/50 p-3 rounded-2xl border border-zinc-100/50">
              <div className="flex flex-col md:flex-row md:items-center gap-3 flex-1 min-w-0 overflow-hidden">
                <h2 className="text-sm font-bold truncate text-zinc-800">Danh sách kênh ({channels.length})</h2>
                <RealTimeLogConsole />
              </div>
              
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <div className="flex bg-zinc-100/80 p-0.5 md:p-1 rounded-xl border border-zinc-200/50 min-w-0">
                  <button
                    onClick={() => setFilter('all')}
                    className={`px-1.5 md:px-3 py-1 md:py-1.5 rounded-lg text-[9px] md:text-[11px] font-bold transition-all ${filter === 'all' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
                  >
                    Tất cả ({channels.length})
                  </button>
                  <button
                    onClick={() => setFilter('live')}
                    className={`px-1.5 md:px-3 py-1 md:py-1.5 rounded-lg text-[9px] md:text-[11px] font-bold transition-all ${filter === 'live' ? 'bg-white shadow-sm text-emerald-600' : 'text-zinc-500 hover:text-zinc-700'}`}
                  >
                    Live ({channels.filter(c => c.isLive).length})
                  </button>
                  <button
                    onClick={() => setFilter('off')}
                    className={`px-1.5 md:px-3 py-1 md:py-1.5 rounded-lg text-[9px] md:text-[11px] font-bold transition-all ${filter === 'off' ? 'bg-white shadow-sm text-red-600' : 'text-zinc-500 hover:text-zinc-700'}`}
                  >
                    Off ({channels.filter(c => !c.isLive).length})
                  </button>
                </div>

                <div className="h-6 w-px bg-zinc-200 mx-0.5 md:mx-1 shrink-0"></div>

                <div className="flex bg-zinc-100/80 p-0.5 md:p-1 rounded-xl border border-zinc-200/50 min-w-0">
                  {[3, 4, 5, 6].map((num) => (
                    <button
                      key={num}
                      onClick={() => setGridCols(num)}
                      className={`w-6 h-6 md:w-8 md:h-7 flex items-center justify-center rounded-lg text-[9px] md:text-[11px] font-bold transition-all ${gridCols === num ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
                    >
                      {num}
                    </button>
                  ))}
                </div>

                <div className="h-6 w-px bg-zinc-200 mx-1 shrink-0"></div>

                <button 
                  onClick={handleRefresh}
                  disabled={loading}
                  className="p-2 text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all disabled:opacity-50 shrink-0"
                  title="Làm mới"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Search and Sort Controls */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Tìm kiếm kênh..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsEcoMode(!isEcoMode)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                    isEcoMode 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm' 
                      : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                  }`}
                  title={isEcoMode ? "Đang bật quét 5 phút/lần" : "Đang quét mặc định (30 giây)"}
                >
                  <Clock className={`w-4 h-4 ${isEcoMode ? 'animate-pulse' : ''}`} />
                  <span>Quét 5P: {isEcoMode ? 'BẬT' : 'TẮT'}</span>
                </button>

                <div className="h-6 w-px bg-zinc-200 mx-1"></div>

                <button
                  onClick={() => setSortOrder(prev => prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none')}
                  className={`flex items-center justify-center gap-2 px-4 py-2 bg-white border rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${sortOrder !== 'none' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}
                >
                  {sortOrder === 'desc' ? <ArrowDown className="w-4 h-4" /> : sortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                  {sortOrder === 'desc' ? 'Lượt xem: Cao đến thấp' : sortOrder === 'asc' ? 'Lượt xem: Thấp đến cao' : 'Sắp xếp: Mặc định'}
                </button>
              </div>
            </div>
            
            {processedChannels.length === 0 ? (
              <div className="bg-white p-16 rounded-[32px] shadow-sm border border-zinc-100 text-center flex flex-col items-center justify-center">
                <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mb-6">
                  <Search className="w-10 h-10 text-zinc-300" />
                </div>
                <p className="text-xl font-bold text-zinc-900">Không tìm thấy kênh nào</p>
                <p className="text-zinc-500 mt-2 max-w-xs mx-auto">
                  {filter === 'live' 
                    ? 'Hiện không có kênh nào đang livestream. Hãy thử chọn "Tất cả" hoặc "Offline".' 
                    : 'Hãy thử thay đổi từ khóa tìm kiếm hoặc bộ lọc.'}
                </p>
                {filter === 'live' && (
                  <button 
                    onClick={() => setFilter('all')}
                    className="mt-8 px-8 py-3 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-900/10 active:scale-95"
                  >
                    Xem tất cả kênh
                  </button>
                )}
              </div>
            ) : (
                <div className={`grid gap-3 sm:gap-4 ${
                  gridCols === 3 ? 'grid-cols-1 sm:grid-cols-3' :
                  gridCols === 4 ? 'grid-cols-1 sm:grid-cols-3 md:grid-cols-4' :
                  gridCols === 5 ? 'grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' :
                  'grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
                }`}>
                  {processedChannels.map((channel) => (
                    <div key={channel.docId} className="bg-white p-3 sm:p-4 rounded-2xl shadow-sm border border-zinc-100 flex flex-row sm:flex-col items-center text-left sm:text-center group transition-all hover:shadow-md relative gap-3 sm:gap-0">
                      <div className="flex sm:absolute sm:top-2 sm:right-2 gap-0.5 sm:gap-1 opacity-100 sm:opacity-0 md:group-hover:opacity-100 transition-opacity ml-auto sm:ml-0 order-last sm:order-none">
                        <button
                          onClick={() => handleCheckNow(channel.id, channel.docId)}
                          disabled={checkingId === channel.docId}
                          className="p-1 sm:p-1.5 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Kiểm tra ngay"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${checkingId === channel.docId ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleDeleteChannel(channel.docId)}
                          className="p-1 sm:p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Xóa kênh"
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                      
                      <div className="relative sm:mb-3 shrink-0">
                        {channel.coverUrl ? (
                          <img src={channel.coverUrl} alt={channel.id} className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-zinc-100" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 font-bold text-xl sm:text-2xl uppercase border-2 border-zinc-100">
                            {channel.id.charAt(0)}
                          </div>
                        )}
                        {channel.isLive && (
                          <span className="absolute bottom-0 right-0 flex h-3.5 w-3.5 sm:h-4 sm:w-4">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3.5 w-3.5 sm:h-4 sm:w-4 bg-red-500 border-2 border-white"></span>
                          </span>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0 flex flex-col sm:items-center">
                        <div className="flex items-center sm:justify-center gap-1 w-full">
                          <a 
                            href={`https://www.tiktok.com/@${channel.id}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="font-semibold text-zinc-900 hover:text-emerald-600 transition-colors truncate text-sm sm:text-base"
                            title={`@${channel.id}`}
                          >
                            @{channel.id}
                          </a>
                          {channel.isTemporary && (
                            <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium bg-amber-100 text-amber-700 rounded-md shrink-0" title="Kênh tạm thời (chỉ lưu trên RAM)">Tạm</span>
                          )}
                          <button
                            onClick={(e) => handleCopyId(channel.id, e)}
                            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors shrink-0"
                            title="Copy ID"
                          >
                            {copiedId === channel.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        
                        <div className="text-[11px] sm:text-xs text-zinc-500 mt-0.5 sm:mt-1.5 w-full flex sm:justify-center">
                          {channel.isLive ? (
                            <div className="inline-flex items-center divide-x divide-red-200 bg-red-50 rounded-full border border-red-100 overflow-hidden max-w-full">
                              <span className="flex items-center gap-1 text-red-600 font-medium px-1.5 py-0.5">
                                <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-red-500 animate-pulse shrink-0"></span>
                                <span className="text-[9px] sm:text-[11px] whitespace-nowrap">LIVE</span>
                              </span>
                              <span className="flex items-center gap-1 text-red-700 font-medium px-1.5 py-0.5 bg-red-100/50 min-w-0">
                                <Users className="w-2 h-2 sm:w-2.5 sm:h-2.5 shrink-0" /> 
                                <span className="text-[9px] sm:text-[11px] truncate">{channel.viewerCount?.toLocaleString() || 0}</span>
                              </span>
                            </div>
                          ) : (
                            <span className="truncate block w-full text-zinc-400" title={channel.lastLiveAt ? `Live lần cuối: ${formatDistanceToNow(new Date(channel.lastLiveAt), { addSuffix: true })}` : 'Chưa từng live'}>
                              {channel.lastLiveAt 
                                ? formatDistanceToNow(new Date(channel.lastLiveAt), { addSuffix: true })
                                : 'Chưa từng live'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
            )}
          </div>
        </div>
      </div>

      {isSettingsOpen && (
        <SettingsModal 
          onClose={() => setIsSettingsOpen(false)} 
          onSaved={() => {
            setIsSettingsOpen(false);
            fetchConfigStatus();
            fetchChannels();
          }} 
        />
      )}

      {isImportOpen && (
        <ImportModal 
          onClose={() => setIsImportOpen(false)} 
          onSaved={() => {
            setIsImportOpen(false);
            fetchChannels();
          }} 
        />
      )}

      {isHelpOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-md">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300 border border-white/20">
            <div className="flex items-center justify-between p-8 border-b border-zinc-100 bg-zinc-50/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
                  <HelpCircle className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tight">HƯỚNG DẪN SỬ DỤNG</h2>
                  <p className="text-zinc-500 text-sm font-medium">Làm chủ hệ thống chỉ trong 3 bước</p>
                </div>
              </div>
              <button onClick={() => setIsHelpOpen(false)} className="p-3 text-zinc-400 hover:bg-zinc-100 rounded-full transition-all hover:rotate-90">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-10 overflow-y-auto flex-1 space-y-12 custom-scrollbar">
              <div className="grid gap-8">
                {[
                  {
                    step: 1,
                    title: "Nhập danh sách kênh",
                    desc: "Nhấn nút 'Nhập danh sách' để thêm hàng loạt TikTok ID từ Excel hoặc Google Sheets. Hệ thống sẽ tự động nhận diện ID từ cột đầu tiên.",
                    icon: <FileSpreadsheet className="w-6 h-6" />,
                    color: "bg-emerald-50 text-emerald-600"
                  },
                  {
                    step: 2,
                    title: "Chế độ Thêm tạm thời",
                    desc: "Tích chọn 'Thêm tạm thời' nếu bạn chỉ muốn theo dõi nhanh trong phiên làm việc hiện tại mà không lưu vào Firebase.",
                    icon: <Clock className="w-6 h-6" />,
                    color: "bg-blue-50 text-blue-600"
                  },
                  {
                    step: 3,
                    title: "Theo dõi & Thông báo",
                    desc: "Hệ thống tự động quét mỗi 30 giây. Bạn sẽ nhận được thông báo Telegram ngay khi có kênh bắt đầu livestream.",
                    icon: <Zap className="w-6 h-6" />,
                    color: "bg-amber-50 text-amber-600"
                  }
                ].map((item) => (
              <div className="flex flex-col sm:flex-row gap-8 group">
                <div className={`w-12 h-12 md:w-16 md:h-16 ${item.color} rounded-2xl md:rounded-3xl flex items-center justify-center font-black text-xl md:text-2xl shrink-0 shadow-sm group-hover:scale-110 transition-transform duration-300`}>
                  {item.step}
                </div>
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <span className={`p-1.5 rounded-lg ${item.color}`}>{item.icon}</span>
                    <h4 className="font-black text-lg md:text-xl text-zinc-900">{item.title}</h4>
                  </div>
                  <p className="text-zinc-500 leading-relaxed font-medium text-sm md:text-base">
                    {item.desc}
                  </p>
                </div>
              </div>
                ))}
              </div>

              <div className="p-8 bg-zinc-900 rounded-[32px] text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                <h5 className="font-bold text-emerald-400 mb-4 flex items-center gap-2 text-lg">
                  <AlertCircle className="w-5 h-5" /> Mẹo nhỏ cho bạn
                </h5>
                <ul className="space-y-3 text-zinc-300 font-medium">
                  <li className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0"></div>
                    <span>Sử dụng phím <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 text-xs text-zinc-400">F5</kbd> hoặc nút Làm mới để cập nhật trạng thái tức thì.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0"></div>
                    <span>Đảm bảo Telegram Bot đã được thêm vào nhóm và cấp quyền Admin để gửi thông báo.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="p-8 border-t border-zinc-100 bg-zinc-50/50 flex justify-center">
              <button 
                onClick={() => setIsHelpOpen(false)}
                className="w-full max-w-xs py-4 bg-emerald-600 text-white rounded-2xl font-black text-lg hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-600/20 active:scale-95"
              >
                BẮT ĐẦU NGAY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] md:text-xs font-medium shrink-0 ${
      active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
    }`}>
      {active ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      {label}
    </div>
  );
}

function SettingsModal({ onClose, onSaved }: { onClose: () => void, onSaved: () => void }) {
  const [config, setConfig] = useState({
    telegramBotToken: '',
    telegramChatId: '',
    zaloBotToken: '',
    zaloUserId: '',
    lastZaloUserId: '',
    proxies: '',
    useSystemProxies: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    const fetchConfig = () => {
      fetchWithAuth('/api/config')
        .then(res => res.json())
        .then(data => {
          setConfig(prev => ({
            ...data,
            proxies: data.proxies ? data.proxies.join('\n') : prev.proxies,
            // Keep current input values for other fields unless they were empty
            telegramBotToken: prev.telegramBotToken || data.telegramBotToken || '',
            telegramChatId: prev.telegramChatId || data.telegramChatId || '',
            zaloBotToken: prev.zaloBotToken || data.zaloBotToken || '',
            zaloUserId: prev.zaloUserId || data.zaloUserId || '',
          }));
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    };

    fetchConfig();
    const interval = setInterval(fetchConfig, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as any;
    setConfig({ 
      ...config, 
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value 
    });
  };

  const handleSetZaloWebhook = async () => {
    if (!config.zaloBotToken) {
      alert('Vui lòng nhập Zalo Bot Token trước');
      return;
    }
    setSettingWebhook(true);
    try {
      const res = await fetchWithAuth('/api/zalo/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: config.zaloBotToken })
      });
      const data = await res.json();
      if (data.ok) {
        setWebhookUrl(data.webhookUrl || '');
        alert('Kích hoạt Webhook thành công! Bây giờ hãy nhắn tin cho Bot để lấy ID.');
      } else {
        alert('Lỗi: ' + (data.error || 'Không thể kích hoạt Webhook'));
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối máy chủ');
    } finally {
      setSettingWebhook(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const proxyList = config.proxies
        .split('\n')
        .map(p => p.trim())
        .filter(p => p && (p.includes(':') || p.includes('@')));

      const res = await fetchWithAuth('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          proxies: proxyList
        })
      });
      if (res.ok) {
        onSaved();
      } else {
        alert('Lỗi khi lưu cấu hình');
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi khi lưu cấu hình');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-zinc-100">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6" />
            Cấu hình hệ thống
          </h2>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:bg-zinc-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          <form id="config-form" onSubmit={handleSave} className="space-y-8">
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-blue-600 border-b pb-2">Telegram Configuration</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <InputField label="Bot Token" name="telegramBotToken" value={config.telegramBotToken} onChange={handleChange} />
                <InputField label="Chat ID" name="telegramChatId" value={config.telegramChatId} onChange={handleChange} />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-orange-600 border-b pb-2">Zalo Configuration (New)</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <InputField label="Bot Token" name="zaloBotToken" value={config.zaloBotToken} onChange={handleChange} />
                <InputField label="User ID / Group ID" name="zaloUserId" value={config.zaloUserId} onChange={handleChange} />
              </div>
              
              <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-orange-800 font-medium">Hướng dẫn lấy Zalo ID:</p>
                  <button
                    type="button"
                    onClick={handleSetZaloWebhook}
                    disabled={settingWebhook}
                    className="flex items-center gap-1 bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {settingWebhook ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    Kích hoạt Webhook tự động
                  </button>
                </div>
                <ol className="text-xs text-orange-700 space-y-1 list-decimal ml-4">
                  <li>Nhập <b>Bot Token</b> ở trên.</li>
                  <li>Nhấn nút <b>Kích hoạt Webhook tự động</b> màu cam.</li>
                  <li>Dùng tài khoản Zalo cá nhân nhắn tin cho Bot.</li>
                  <li>Bot sẽ tự động gửi lại ID của bạn. Hãy copy dán vào ô trên.</li>
                </ol>
                {webhookUrl && (
                  <div className="mt-2 p-2 bg-white rounded border border-orange-200">
                    <p className="text-[10px] text-orange-400 uppercase font-bold mb-1">Webhook URL (Đã kích hoạt):</p>
                    <p className="text-[10px] font-mono break-all text-zinc-500">{webhookUrl}</p>
                  </div>
                )}
                {config.lastZaloUserId && (
                  <div className="mt-2 pt-2 border-t border-orange-200">
                    <p className="text-xs text-orange-800">ID vừa nhận được từ Webhook: <span className="font-mono font-bold bg-white px-2 py-1 rounded border border-orange-300 ml-1">{config.lastZaloUserId}</span></p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-lg font-semibold text-emerald-600">Proxy Configuration</h3>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, proxies: '' })}
                    className="text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors border border-red-100"
                  >
                    Xoá toàn bộ Proxy
                  </button>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="useSystemProxies"
                      checked={config.useSystemProxies}
                      onChange={handleChange}
                      className="w-4 h-4 text-emerald-600 rounded border-zinc-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-zinc-600">Sử dụng Proxy hệ thống</span>
                  </label>
                  <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    {config.proxies.split('\n').filter(p => p.trim()).length} proxies
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-700">
                  Danh sách Proxy (Định dạng: <code className="text-emerald-600">user:pass@ip:port</code> hoặc <code className="text-emerald-600">ip:port</code>)
                </label>
                <textarea
                  name="proxies"
                  value={config.proxies}
                  onChange={handleChange}
                  placeholder="proxymart50217:wLxZDWVM@160.250.54.6:50217&#10;proxymart49036:IAyYYtFh@160.250.54.4:49036"
                  className="w-full h-48 px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all font-mono text-sm"
                />
                <p className="text-xs text-zinc-500 italic">
                  * Hệ thống sẽ tự động xoay vòng (rotate) proxy cho mỗi lần quét để tránh bị TikTok chặn.
                </p>
              </div>
            </div>

          </form>
        </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 p-6 border-t border-zinc-100">
            <button 
              type="button"
              onClick={() => {
                if (confirm('Bạn có chắc chắn muốn khôi phục cấu hình mặc định? Toàn bộ Proxy sẽ bị xóa.')) {
                  setConfig({
                    telegramBotToken: '',
                    telegramChatId: '',
                    zaloBotToken: '',
                    zaloUserId: '',
                    lastZaloUserId: '',
                    proxies: '',
                    useSystemProxies: false
                  });
                }
              }}
              className="w-full sm:w-auto px-4 py-2 text-red-600 font-medium hover:bg-red-50 rounded-xl transition-colors border border-red-100 text-sm"
            >
              Khôi phục mặc định
            </button>
            <div className="flex items-center gap-3 w-full sm:w-auto sm:ml-auto">
              <button 
                type="button" 
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2 text-zinc-600 font-medium hover:bg-zinc-200 rounded-xl transition-colors text-sm"
              >
                Hủy
              </button>
              <button 
                type="submit" 
                form="config-form"
                disabled={saving}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-2 rounded-xl font-medium transition-colors disabled:opacity-50 text-sm"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Lưu
              </button>
            </div>
          </div>
      </div>
    </div>
  );
}

function InputField({ label, name, value, onChange }: { label: string, name: string, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1">{label}</label>
      <input
        type="text"
        name={name}
        value={value || ''}
        onChange={onChange}
        className="w-full px-3 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
      />
    </div>
  );
}

function ImportModal({ onClose, onSaved }: { onClose: () => void, onSaved: () => void }) {
  const [activeTab, setActiveTab] = useState<'excel' | 'sheets'>('excel');
  const [sheetUrl, setSheetUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [progress, setProgress] = useState('');
  const [isTemporary, setIsTemporary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBulkAdd = async (ids: string[]) => {
    setLoading(true);
    setError('');
    setSuccess('');
    setProgress(`Đang xử lý ${ids.length} kênh... Vui lòng đợi.`);
    
    try {
      const res = await fetchWithAuth('/api/channels/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, isTemporary })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi thêm danh sách');
      
      setProgress('');
      setSuccess(`Đã thêm thành công ${data.addedCount} kênh mới!`);
      setTimeout(() => {
        onSaved();
      }, 2000);
    } catch (err: any) {
      setProgress('');
      if (err.message?.includes('Quota exceeded')) {
        setError('Đã vượt quá hạn mức dữ liệu miễn phí trong ngày của Firebase. Vui lòng thử lại vào ngày mai.');
      } else {
        setError(err.message);
      }
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        
        const ids: string[] = [];
        data.forEach(row => {
          if (row && row[0] && typeof row[0] === 'string') {
            const id = row[0].trim().replace(/^@/, '');
            if (id) ids.push(id);
          }
        });

        if (ids.length === 0) {
          setError('Không tìm thấy ID nào trong cột đầu tiên của file.');
          return;
        }

        handleBulkAdd(ids);
      } catch (err) {
        setError('Lỗi khi đọc file Excel/CSV.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSheetImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetUrl.trim()) return;

    setLoading(true);
    setError('');
    
    try {
      const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) {
        throw new Error('Link Google Sheet không hợp lệ.');
      }
      const sheetId = match[1];
      
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error('Không thể đọc Google Sheet. Hãy đảm bảo file đã được share "Anyone with the link".');
      
      const csvText = await res.text();
      const rows = csvText.split('\n');
      const ids: string[] = [];
      
      rows.forEach(row => {
        const cols = row.split(',');
        if (cols && cols[0]) {
          const id = cols[0].trim().replace(/^"|"$/g, '').replace(/^@/, '');
          if (id) ids.push(id);
        }
      });

      if (ids.length === 0) {
        throw new Error('Không tìm thấy ID nào trong cột đầu tiên.');
      }

      handleBulkAdd(ids);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-zinc-100">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Upload className="w-6 h-6" />
            Nhập danh sách kênh
          </h2>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:bg-zinc-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          <div className="flex gap-2 mb-6 p-1 bg-zinc-100 rounded-xl">
            <button 
              onClick={() => setActiveTab('excel')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'excel' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
              Excel / CSV
            </button>
            <button 
              onClick={() => setActiveTab('sheets')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'sheets' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
              Google Sheets
            </button>
          </div>

          <div className="flex items-center gap-2 mb-6">
            <input
              type="checkbox"
              id="isTemporaryBulk"
              checked={isTemporary}
              onChange={(e) => setIsTemporary(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-zinc-300 focus:ring-emerald-500"
            />
            <label htmlFor="isTemporaryBulk" className="text-sm text-zinc-600 cursor-pointer">
              Thêm tạm thời (chỉ lưu trên RAM, không lưu Firebase)
            </label>
          </div>

          {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">{error}</div>}
          {success && <div className="mb-4 p-3 bg-emerald-50 text-emerald-600 rounded-xl text-sm border border-emerald-100 flex items-center gap-2"><CheckCircle className="w-4 h-4"/> {success}</div>}
          {progress && <div className="mb-4 p-3 bg-blue-50 text-blue-600 rounded-xl text-sm border border-blue-100 flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin"/> {progress}</div>}

          {activeTab === 'excel' ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-500">
                Tải lên file .xlsx hoặc .csv. Hệ thống sẽ đọc dữ liệu từ <strong>cột đầu tiên (cột A)</strong>.
              </p>
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || !!success}
                className="w-full flex flex-col items-center justify-center gap-3 border-2 border-dashed border-zinc-200 rounded-2xl p-8 hover:border-emerald-500 hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {loading ? (
                  <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin" />
                ) : (
                  <>
                    <FileSpreadsheet className="w-8 h-8 text-zinc-400 group-hover:text-emerald-500 transition-colors" />
                    <span className="text-sm font-medium text-zinc-600 group-hover:text-emerald-600">Chọn file từ máy tính</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSheetImport} className="space-y-4">
              <p className="text-sm text-zinc-500">
                Dán link Google Sheet. Đảm bảo file đã được share quyền <strong>"Anyone with the link"</strong>. Hệ thống sẽ đọc từ cột A.
              </p>
              <div>
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading || !sheetUrl.trim() || !!success}
                className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                Nhập dữ liệu
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
