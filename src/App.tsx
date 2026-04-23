import React, { useState, useEffect } from 'react';
import { Download, ShieldCheck, Youtube, Facebook, Instagram, Twitter, AlertCircle, Loader2, ClipboardPaste, CheckCircle2, History, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const TiktokIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="none"
  >
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
  </svg>
);

type HistoryItem = {
  url: string;
  title: string;
  type: string;
  timestamp: number;
};

const placeholders = [
  "Paste your link here...",
  "Ready for the magic?",
  "Drop a URL to start...",
  "Paste URL from YouTube, Instagram, TikTok...",
];

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ title: string; mediaUrl: string; type: string; thumbnail: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  useEffect(() => {
    // Load history from local storage
    try {
      const saved = localStorage.getItem('onaayash_history');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {}

    // Rotate placeholder
    const interval = setInterval(() => {
      setPlaceholderIdx(prev => (prev + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const saveHistory = (item: HistoryItem) => {
    setHistory(prev => {
      const filtered = prev.filter(h => h.url !== item.url);
      const newHistory = [item, ...filtered].slice(0, 5);
      localStorage.setItem('onaayash_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('onaayash_history');
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text);
    } catch (err) {
      console.error('Failed to read clipboard', err);
      // Let the user know they might need to allow permissions or manually paste
      setError("Clipboard access blocked by browser. Please paste the link manually (Ctrl+V / Cmd+V) or click 'Open App in New Tab'.");
    }
  };

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to extract media. Make sure the link is public.');
      }

      const data = await response.json();
      setResult(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3500);
      saveHistory({ url, title: data.title, type: data.type, timestamp: Date.now() });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-auto flex flex-col font-sans text-slate-200 bg-[#0a0a0c] no-scrollbar">
      {/* Background Glow Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-900/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-indigo-900/20 rounded-full blur-[100px] pointer-events-none" />

      {/* Success Toast */}
      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 20 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-5 py-3 rounded-full flex items-center gap-3 text-sm font-bold tracking-wide backdrop-blur-xl shadow-2xl shadow-emerald-500/10">
              <CheckCircle2 className="w-5 h-5" />
              Media Extracted Successfully!
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="flex w-full justify-between items-center px-10 py-8 z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-blue-400 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Download className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white block">Onaayash</h1>
            <p className="text-xs text-slate-400 font-medium hidden sm:block">Universal Media Downloader</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="px-4 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest hidden sm:inline">Privacy First</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center pt-10 pb-20 px-10 z-10 relative">
        
        {/* Title Section */}
        <div className="text-center mb-12 w-full">
          <h2 className="text-5xl font-bold text-white mb-4 tracking-tight leading-tight">
            Universal Media Extractor
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Paste your link below to fetch high-quality raw media directly to your browser. No logs, no tracking, just content.
          </p>
        </div>

        {/* Input Card */}
        <div className="w-full max-w-3xl relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition-opacity"></div>
          
          <form onSubmit={handleExtract} className="relative flex bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-2xl flex-col sm:flex-row gap-2 overflow-hidden">
            <div className="relative flex-1 flex items-center">
              <input 
                type="text" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={placeholders[placeholderIdx]}
                className="bg-transparent border-none focus:ring-0 text-white placeholder-slate-500 px-6 py-4 w-full text-lg outline-none pr-14 transition-all duration-300"
              />
              <button
                type="button"
                onClick={handlePaste}
                className="absolute right-4 text-slate-500 hover:text-indigo-400 transition-colors tooltip-trigger p-1 hover:bg-white/5 rounded-lg"
                title="Paste from clipboard"
              >
                <ClipboardPaste className="w-5 h-5" />
              </button>
            </div>
            
            <button 
              type="submit"
              disabled={loading || !url.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-4 rounded-xl transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[170px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Processing...
                </>
              ) : 'Download'}
            </button>
            
            {/* Loading Progress Bar */}
            <AnimatePresence>
              {loading && (
                <motion.div 
                  initial={{ width: "0%", opacity: 0 }}
                  animate={{ width: "100%", opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2.5, ease: "easeInOut" }}
                  className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-indigo-500 to-emerald-400 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                />
              )}
            </AnimatePresence>
          </form>

          {/* Results Area */}
          {error && (
            <div className="mt-6 px-4 py-3 rounded-xl bg-red-900/20 border border-red-500/30 text-red-400 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {result && (
            <div className="mt-6 flex flex-col md:flex-row gap-5 items-center bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl">
              {result.thumbnail ? (
                <div className="w-full md:w-32 h-32 rounded-xl overflow-hidden flex-shrink-0 relative group">
                  <img src={result.thumbnail} alt={result.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Download className="w-6 h-6 text-white" />
                  </div>
                </div>
              ) : (
                <div className="w-full md:w-32 h-32 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <Download className="w-8 h-8 text-slate-500" />
                </div>
              )}
              
              <div className="flex-1 w-full flex flex-col justify-between h-full py-1">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400 mb-2 block">
                    {result.type === 'video' ? 'Video Ready' : 'Image Ready'}
                  </span>
                  <h3 className="text-white font-medium line-clamp-2 text-lg" title={result.title}>{result.title}</h3>
                </div>
                
                <a 
                  href={result.mediaUrl} 
                  download
                  className="mt-4 md:mt-0 inline-flex items-center justify-center gap-2 w-full md:w-auto self-start px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-medium transition-all shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Download File
                </a>
              </div>
            </div>
          )}

          {/* Social Proof / Supported Platforms */}
          <div className="mt-20 w-full mb-12">
            <p className="text-center text-xs font-bold text-slate-600 uppercase tracking-[0.3em] mb-8">Supported Ecosystems</p>
            
            {/* SVG Defs for Instagram Gradient */}
            <svg width="0" height="0" className="absolute">
              <defs>
                <linearGradient id="ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FCAF45" />
                  <stop offset="50%" stopColor="#FD1D1D" />
                  <stop offset="100%" stopColor="#833AB4" />
                </linearGradient>
              </defs>
            </svg>

            <div className="grid grid-cols-3 md:grid-cols-6 gap-4 max-w-5xl mx-auto transition-all">
              {[
                { icon: Instagram, label: "INSTAGRAM", colorClass: "text-[#E4405F]", useGradient: true },
                { icon: Youtube, label: "YOUTUBE", colorClass: "text-[#FF0000]" },
                { icon: TiktokIcon, label: "TIKTOK", colorClass: "text-[#EE1D52]" },
                { icon: Facebook, label: "FACEBOOK", colorClass: "text-[#1877F2]" },
                { icon: Twitter, label: "TWITTER", colorClass: "text-white" }
              ].map(({ icon: Icon, label, colorClass, useGradient }) => (
                <div key={label} className="h-16 flex flex-col items-center justify-center gap-2 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-colors">
                  {useGradient ? (
                    <Icon className="w-6 h-6" style={{ stroke: "url(#ig-gradient)" }} />
                  ) : (
                    <Icon className={`w-6 h-6 ${colorClass}`} />
                  )}
                  <span className="text-[10px] font-medium tracking-wider">{label}</span>
                </div>
              ))}
              <div className="h-16 flex flex-col items-center justify-center gap-2 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-colors cursor-help">
                <div className="w-6 h-6 flex items-center justify-center">
                  <span className="text-slate-400 font-bold text-lg">+</span>
                </div>
                <span className="text-[10px] font-medium tracking-wider">50 MORE</span>
              </div>
            </div>
          </div>

          {/* Recent History */}
          {history.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 w-full border-t border-white/5 pt-10"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2 text-slate-400">
                  <History className="w-4 h-4" />
                  <span className="text-xs font-bold tracking-[0.2em] uppercase">Recent Sessions</span>
                </div>
                <button 
                  onClick={clearHistory}
                  className="text-xs text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1 font-semibold"
                >
                  <Trash2 className="w-3 h-3" />
                  CLEAR
                </button>
              </div>

              <div className="space-y-3">
                <AnimatePresence>
                  {history.map((item) => (
                    <motion.div 
                      key={item.url + item.timestamp}
                      initial={{ opacity: 0, height: 0, scale: 0.95 }}
                      animate={{ opacity: 1, height: 'auto', scale: 1 }}
                      exit={{ opacity: 0, height: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="bg-slate-900/50 backdrop-blur-sm border border-white/5 rounded-xl p-4 flex items-center justify-between gap-4 hover:bg-white/5 hover:border-white/10 transition-all group"
                    >
                      <div className="flex items-center gap-4 overflow-hidden">
                        <div className="w-10 h-10 rounded-lg bg-black/50 border border-white/5 flex items-center justify-center flex-shrink-0">
                          {item.url.includes('instagram') ? <Instagram className="w-5 h-5" style={{ stroke: "url(#ig-gradient)" }} /> :
                           item.url.includes('youtube') || item.url.includes('youtu.be') ? <Youtube className="w-5 h-5 text-[#FF0000]" /> :
                           item.url.includes('tiktok') ? <TiktokIcon className="w-5 h-5 text-[#EE1D52]" /> :
                           item.url.includes('facebook') || item.url.includes('fb.watch') ? <Facebook className="w-5 h-5 text-[#1877F2]" /> :
                           item.url.includes('twitter') || item.url.includes('x.com') ? <Twitter className="w-5 h-5 text-white" /> :
                           <Download className="w-5 h-5 text-indigo-400" />}
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-sm font-semibold text-slate-200 truncate pr-4">{item.title}</p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">{item.url}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                           setUrl(item.url);
                           window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="px-4 py-2 rounded-lg bg-white/5 text-indigo-300 font-medium text-xs hover:bg-indigo-500/20 hover:text-indigo-200 transition-colors flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        Load Media
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

        </div>
      </main>

      {/* Footer Branding */}
      <footer className="px-10 py-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 z-10 text-center flex-shrink-0 w-full mt-auto">
        <div className="mx-auto flex gap-4 md:gap-8 text-[10px] sm:text-[11px] font-medium text-slate-500 uppercase tracking-widest flex-wrap justify-center">
          <span>Stateless Architecture</span>
          <span>No Cookies</span>
          <span>SSL Encrypted</span>
        </div>
      </footer>
    </div>
  );
}
