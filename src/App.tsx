import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Activity, Settings, CheckCircle, XCircle, RefreshCw, X, Save, Upload, FileSpreadsheet, Users, LogIn, UserPlus, LogOut } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import * as XLSX from 'xlsx';

interface Channel {
  docId: string;
  id: string;
  isLive: boolean;
  addedAt: string;
  lastLiveAt?: string;
  coverUrl?: string;
  title?: string;
  viewerCount?: number;
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

  if (!isAuthenticated) {
    return <AuthScreen onLogin={(user, token) => {
      localStorage.setItem('token', token);
      localStorage.setItem('username', user);
      setUsername(user);
      setIsAuthenticated(true);
    }} />;
  }

  return <MainApp username={username} onLogout={() => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setIsAuthenticated(false);
  }} />;
}

function AuthScreen({ onLogin }: { onLogin: (username: string, token: string) => void }) {
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
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      
      onLogin(data.username, data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans">
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
            <label className="block text-sm font-medium text-zinc-700 mb-1">Tên đăng nhập</label>
            <input
              type="text"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              placeholder="Nhập tên đăng nhập"
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

        <div className="mt-6 text-center">
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
          >
            {isLogin ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MainApp({ username, onLogout }: { username: string, onLogout: () => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [filter, setFilter] = useState<'all' | 'live' | 'off'>('all');
  const [newChannel, setNewChannel] = useState('');
  const [loading, setLoading] = useState(false);
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [error, setError] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const [checkResult, setCheckResult] = useState<{isLive: boolean, message: string, coverUrl?: string} | null>(null);

  const fetchChannels = async () => {
    try {
      const res = await fetchWithAuth('/api/channels');
      if (!res.ok) throw new Error('Failed to fetch channels');
      const data = await res.json();
      
      data.sort((a: any, b: any) => {
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        
        const timeA = a.lastLiveAt ? new Date(a.lastLiveAt).getTime() : 0;
        const timeB = b.lastLiveAt ? new Date(b.lastLiveAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        
        return a.id.localeCompare(b.id);
      });
      
      setChannels(data);
    } catch (err: any) {
      console.error(err);
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

  useEffect(() => {
    fetchConfigStatus();
    fetchChannels();
    const interval = setInterval(fetchChannels, 30000);
    return () => clearInterval(interval);
  }, []);

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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannel.trim()) return;
    
    if (!configStatus?.telegramBot) {
      setError('Vui lòng cấu hình Telegram Bot trước khi thêm kênh.');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newChannel.trim() }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add channel');
      
      setNewChannel('');
      fetchChannels();
    } catch (err: any) {
      setError(err.message);
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
      alert(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <Activity className="text-emerald-500" />
              TikTok Live Monitor
            </h1>
            <p className="text-zinc-500 mt-1 flex items-center gap-2">
              Xin chào, <span className="font-semibold text-zinc-900">{username}</span>
              <button onClick={onLogout} className="text-xs bg-zinc-200 hover:bg-zinc-300 px-2 py-1 rounded-md transition-colors flex items-center gap-1">
                <LogOut className="w-3 h-3" /> Đăng xuất
              </button>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsImportOpen(true)}
              className="flex items-center gap-2 bg-white border border-zinc-200 px-4 py-2 rounded-xl hover:bg-zinc-50 transition-colors font-medium shadow-sm"
            >
              <Upload className="w-5 h-5" />
              Nhập danh sách
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 bg-white border border-zinc-200 px-4 py-2 rounded-xl hover:bg-zinc-50 transition-colors font-medium shadow-sm"
            >
              <Settings className="w-5 h-5" />
              Cấu hình
            </button>
          </div>
        </header>

        {/* Config Status */}
        {configStatus && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Settings className="w-5 h-5 text-zinc-400" />
                Trạng thái hệ thống
              </h2>
              <p className="text-sm text-zinc-500">
                {!configStatus.telegramBot ? 'Vui lòng nhấn nút Cấu hình ở góc trên để thiết lập hệ thống.' : 'Hệ thống đang hoạt động bình thường.'}
              </p>
            </div>
            
            <div className="flex flex-wrap gap-4">
              <StatusBadge label="Firebase" active={configStatus.firebase} />
              <StatusBadge label="Telegram Bot" active={configStatus.telegramBot} />
              <StatusBadge label="Chat ID" active={configStatus.telegramChatId} />
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid md:grid-cols-3 gap-8">
          
          {/* Add Channel Form */}
          <div className="md:col-span-1 space-y-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
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

                {!configStatus?.telegramBot && (
                  <p className="text-amber-600 text-sm bg-amber-50 p-2 rounded-lg border border-amber-200">
                    ⚠️ Vui lòng cấu hình Telegram Bot ở nút "Cấu hình" góc trên bên phải trước khi thêm kênh.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={loading || !newChannel.trim()}
                    className="flex-1 flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    Thêm kênh
                  </button>
                  <button
                    type="button"
                    onClick={handleCheckChannel}
                    disabled={loading || !newChannel.trim()}
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-4 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Danh sách kênh ({channels.length})</h2>
              <div className="flex items-center gap-4">
                <div className="flex bg-zinc-100 p-1 rounded-lg">
                  <button
                    onClick={() => setFilter('all')}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${filter === 'all' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                  >
                    Tất cả ({channels.length})
                  </button>
                  <button
                    onClick={() => setFilter('live')}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${filter === 'live' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                  >
                    Đang Live ({channels.filter(c => c.isLive).length})
                  </button>
                  <button
                    onClick={() => setFilter('off')}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${filter === 'off' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                  >
                    Offline ({channels.filter(c => !c.isLive).length})
                  </button>
                </div>
                <button 
                  onClick={fetchChannels}
                  className="text-zinc-500 hover:text-zinc-900 transition-colors flex items-center gap-1 text-sm"
                >
                  <RefreshCw className="w-4 h-4" /> Làm mới
                </button>
              </div>
            </div>
            
            {channels.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl shadow-sm border border-zinc-100 text-center">
                <p className="text-zinc-500">Chưa có kênh nào được theo dõi.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {channels.filter(c => filter === 'all' ? true : filter === 'live' ? c.isLive : !c.isLive).map((channel) => (
                  <div key={channel.docId} className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 flex flex-col items-center text-center group transition-all hover:shadow-md relative">
                    <button
                      onClick={() => handleDeleteChannel(channel.docId)}
                      className="absolute top-2 right-2 p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 md:group-hover:opacity-100"
                      title="Xóa kênh"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    
                    <div className="relative mb-3">
                      {channel.coverUrl ? (
                        <img src={channel.coverUrl} alt={channel.id} className="w-16 h-16 rounded-full object-cover border-2 border-zinc-100" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 font-bold text-2xl uppercase border-2 border-zinc-100">
                          {channel.id.charAt(0)}
                        </div>
                      )}
                      {channel.isLive && (
                        <span className="absolute bottom-0 right-0 flex h-4 w-4">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-white"></span>
                        </span>
                      )}
                    </div>
                    
                    <a 
                      href={`https://www.tiktok.com/@${channel.id}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="font-semibold text-zinc-900 hover:text-emerald-600 transition-colors truncate w-full"
                      title={`@${channel.id}`}
                    >
                      @{channel.id}
                    </a>
                    
                    <div className="text-xs text-zinc-500 mt-1.5 w-full flex justify-center">
                      {channel.isLive ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1.5 text-red-600 font-medium bg-red-50 px-2.5 py-1 rounded-full border border-red-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                            Đang LIVE
                          </span>
                          <span className="text-zinc-500 font-medium flex items-center gap-1">
                            <Users className="w-3 h-3" /> {channel.viewerCount?.toLocaleString() || 0}
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
    </div>
  );
}

function StatusBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
      active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
    }`}>
      {active ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {label}
    </div>
  );
}

function SettingsModal({ onClose, onSaved }: { onClose: () => void, onSaved: () => void }) {
  const [config, setConfig] = useState({
    telegramBotToken: '',
    telegramChatId: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchWithAuth('/api/config')
      .then(res => res.json())
      .then(data => {
        setConfig(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
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

          </form>
        </div>

        <div className="p-6 border-t border-zinc-100 bg-zinc-50 flex justify-end gap-3">
          <button 
            type="button" 
            onClick={onClose}
            className="px-4 py-2 text-zinc-600 font-medium hover:bg-zinc-200 rounded-xl transition-colors"
          >
            Hủy
          </button>
          <button 
            type="submit" 
            form="config-form"
            disabled={saving}
            className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-2 rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Lưu cấu hình
          </button>
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
        body: JSON.stringify({ ids })
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
      setError(err.message);
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
