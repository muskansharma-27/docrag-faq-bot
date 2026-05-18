import React, { useState, useEffect } from 'react';
import { auth, loginWithGoogle, loginWithEmail, logout, registerWithEmail, requestPasswordReset } from './firebase';
import { onAuthStateChanged, User, AuthError } from 'firebase/auth';
import { 
  FileText, 
  MessageSquare, 
  LogOut, 
  LayoutDashboard,
  ShieldCheck,
  Menu,
  X,
  Mail,
  Lock,
  UserRound,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Dashboard from './components/Dashboard';
import DocumentManager from './components/DocumentManager';
import ChatBot from './components/ChatBot';
import { Toaster, toast } from 'sonner';

export default function App() {
  const passwordHelpText = 'Use 8+ chars with uppercase, lowercase, number, and special character.';
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const clearAuthForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFieldErrors({});
  };

  const switchMode = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setFieldErrors({});
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const getReadableAuthError = (error: unknown) => {
    if (error instanceof Error && error.message === 'NO_PASSWORD_ACCOUNT') {
      return 'This email does not have password sign-in enabled. Use Google sign-in or create a password account first.';
    }

    const err = error as Partial<AuthError>;
    switch (err?.code) {
      case 'auth/email-already-in-use':
        return 'This email is already registered. Please sign in instead.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/user-not-found':
      case 'auth/invalid-credential':
        return 'No account found with these credentials. (If you originally used Google, please click "Continue with Google" below).';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait and try again.';
      case 'auth/weak-password':
        return 'Password is too weak. Choose a stronger one.';
      case 'auth/operation-not-allowed':
        return 'This sign-in method is disabled in Firebase Console. Enable Email/Password (and Google if needed).';
      default:
        return (err?.message as string) || 'Authentication failed.';
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    const emailValue = email.trim();
    const passwordValue = password.trim();

    if (!emailValue) nextErrors.email = 'Email is required.';
    if (!passwordValue) nextErrors.password = 'Password is required.';

    if (authMode === 'signup') {
      if (!name.trim()) nextErrors.name = 'Full name is required.';
      const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
      if (!strongPasswordPattern.test(passwordValue)) nextErrors.password = passwordHelpText;
      if (!confirmPassword.trim()) nextErrors.confirmPassword = 'Please confirm your password.';
      if (passwordValue && confirmPassword.trim() && passwordValue !== confirmPassword.trim()) {
        nextErrors.confirmPassword = 'Passwords do not match.';
      }
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error('Please correct the highlighted fields.');
      return;
    }

    setIsAuthLoading(true);
    try {
      if (authMode === 'signup') {
        await registerWithEmail(name, emailValue, passwordValue);
        toast.success('Account created successfully.');
      } else {
        try {
          await loginWithEmail(emailValue, passwordValue);
          toast.success('Signed in successfully.');
        } catch (loginErr: unknown) {
          const errObj = loginErr as Partial<AuthError>;
          // If the credential is invalid, check if they actually have a Google account
          if (errObj?.code === 'auth/invalid-credential' || errObj?.code === 'auth/wrong-password') {
            try {
              const { fetchSignInMethodsForEmail } = await import('firebase/auth');
              const methods = await fetchSignInMethodsForEmail(auth, emailValue);
              if (methods.includes('google.com') && !methods.includes('password')) {
                toast.error('This email is registered via Google. Please use "Continue with Google" below.');
                setIsAuthLoading(false);
                return;
              }
            } catch (fetchErr) {
              // Ignore fetch errors and fall through to default error handling
            }
          }
          throw loginErr; // Re-throw to be caught by the main catch block
        }
      }
      clearAuthForm();
    } catch (err: unknown) {
      const errObj = err as Partial<AuthError>;
      const message = getReadableAuthError(err);
      if (errObj?.code === 'auth/email-already-in-use' && authMode === 'signup') {
        toast.error(message);
        setAuthMode('signin');
        setFieldErrors({});
        setPassword('');
        setConfirmPassword('');
        return;
      }
      toast.error(message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const emailValue = email.trim();
    if (!emailValue) {
      setFieldErrors((prev) => ({ ...prev, email: 'Enter your email first to reset password.' }));
      toast.error('Enter your email first.');
      return;
    }

    try {
      await requestPasswordReset(emailValue);
      toast.success('Password reset email sent. Check inbox and spam/promotions folders.');
    } catch (err: unknown) {
      toast.error(getReadableAuthError(err));
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#09090b] relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center justify-center">
          <div className="p-4 bg-purple-500/10 rounded-2xl border border-purple-500/20 shadow-[0_0_30px_rgba(168,85,247,0.2)] animate-pulse mb-6">
            <ShieldCheck className="w-12 h-12 text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-wide animate-pulse">Starting DocRAG</h2>
          <p className="text-zinc-500 text-sm mt-2">Authenticating secure connection...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#09090b] p-4 relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-zinc-900/50 backdrop-blur-xl p-8 rounded-2xl shadow-2xl max-w-md w-full border border-white/10 relative z-10"
        >
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-purple-500/10 rounded-2xl border border-purple-500/20 shadow-[0_0_30px_rgba(168,85,247,0.2)]">
              <ShieldCheck className="w-10 h-10 text-purple-400" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-center mb-2 text-white tracking-tight">DocRAG FAQ Bot</h1>
          <p className="text-zinc-400 text-center mb-8 text-sm">
            Sign in to manage your documents and interact with the AI FAQ bot.
          </p>

          <div className="grid grid-cols-2 gap-2 mb-6 bg-black/20 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => switchMode('signin')}
              className={`py-2.5 text-sm rounded-lg transition-all font-semibold ${
                authMode === 'signin' ? 'bg-white text-black' : 'text-zinc-300 hover:bg-white/10'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => switchMode('signup')}
              className={`py-2.5 text-sm rounded-lg transition-all font-semibold ${
                authMode === 'signup' ? 'bg-white text-black' : 'text-zinc-300 hover:bg-white/10'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-3 mb-4">
            {authMode === 'signup' && (
              <label className={`flex items-center gap-3 w-full bg-white/5 border py-3 px-4 rounded-xl text-white ${fieldErrors.name ? 'border-red-500/60' : 'border-white/10'}`}>
                <UserRound className="w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, name: '' }));
                  }}
                  placeholder="Full name"
                  className="bg-transparent w-full text-sm outline-none placeholder:text-zinc-500"
                />
              </label>
            )}
            {fieldErrors.name && authMode === 'signup' && <p className="text-xs text-red-400 -mt-1">{fieldErrors.name}</p>}

            <label className={`flex items-center gap-3 w-full bg-white/5 border py-3 px-4 rounded-xl text-white ${fieldErrors.email ? 'border-red-500/60' : 'border-white/10'}`}>
              <Mail className="w-4 h-4 text-zinc-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, email: '' }));
                }}
                placeholder="Email address"
                className="bg-transparent w-full text-sm outline-none placeholder:text-zinc-500"
              />
            </label>
            {fieldErrors.email && <p className="text-xs text-red-400 -mt-1">{fieldErrors.email}</p>}

            <label className={`flex items-center gap-3 w-full bg-white/5 border py-3 px-4 rounded-xl text-white ${fieldErrors.password ? 'border-red-500/60' : 'border-white/10'}`}>
              <Lock className="w-4 h-4 text-zinc-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, password: '' }));
                }}
                placeholder="Password"
                className="bg-transparent w-full text-sm outline-none placeholder:text-zinc-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-zinc-400 hover:text-white transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </label>
            {fieldErrors.password && <p className="text-xs text-red-400 -mt-1">{fieldErrors.password}</p>}
            {authMode === 'signup' && !fieldErrors.password && <p className="text-[11px] text-zinc-500 -mt-1">{passwordHelpText}</p>}

            {authMode === 'signup' && (
              <label className={`flex items-center gap-3 w-full bg-white/5 border py-3 px-4 rounded-xl text-white ${fieldErrors.confirmPassword ? 'border-red-500/60' : 'border-white/10'}`}>
                <Lock className="w-4 h-4 text-zinc-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }}
                  placeholder="Confirm password"
                  className="bg-transparent w-full text-sm outline-none placeholder:text-zinc-500"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="text-zinc-400 hover:text-white transition-colors"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </label>
            )}
            {fieldErrors.confirmPassword && authMode === 'signup' && <p className="text-xs text-red-400 -mt-1">{fieldErrors.confirmPassword}</p>}

            {authMode === 'signin' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}
            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full bg-white text-black py-3.5 px-4 rounded-xl hover:bg-zinc-200 transition-all font-semibold disabled:opacity-60"
            >
              {isAuthLoading ? 'Please wait...' : authMode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider text-zinc-500">
              <span className="bg-zinc-900 px-2">Or continue with</span>
            </div>
          </div>

          <button
            disabled={isAuthLoading}
            onClick={() => loginWithGoogle().catch(err => toast.error(err.message))}
            className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 py-3.5 px-4 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all font-medium text-white shadow-sm hover:shadow-[0_0_20px_rgba(255,255,255,0.05)]"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            Continue with Google
          </button>
        </motion.div>
        <Toaster position="top-right" theme="dark" />
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'bot', label: 'FAQ Bot', icon: MessageSquare },
  ];

  return (
    <div className="flex h-screen bg-[#09090b] overflow-hidden font-sans text-white selection:bg-purple-500/30">
      <Toaster position="top-right" theme="dark" />
      
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: isSidebarOpen ? 260 : 80 }}
        className="bg-zinc-900/50 backdrop-blur-xl border-r border-white/5 flex flex-col z-20 relative"
      >
        <div className="p-4 flex items-center justify-between border-b border-white/5">
          {isSidebarOpen && (
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-purple-500 to-blue-600 p-2 rounded-xl shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-white tracking-wide">DocRAG</span>
            </div>
          )}
          {!isSidebarOpen && (
             <div className="bg-gradient-to-br from-purple-500 to-blue-600 p-2 rounded-xl mx-auto shadow-[0_0_15px_rgba(168,85,247,0.3)]">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors border border-transparent hover:border-white/5"
          >
            {isSidebarOpen ? <X className="w-5 h-5 text-zinc-400" /> : <Menu className="w-5 h-5 text-zinc-400" />}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-2 overflow-y-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 group ${
                  isActive 
                    ? 'bg-white/10 border border-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)]' 
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
              >
                <Icon className={`flex-shrink-0 transition-colors ${isActive ? 'w-5 h-5 text-purple-400' : 'w-5 h-5 opacity-70 group-hover:text-purple-400'}`} />
                {isSidebarOpen && <span className="font-medium text-sm">{tab.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5 bg-zinc-900/30">
          {isSidebarOpen && (
            <div className="mb-4 flex items-center gap-3 bg-black/20 p-3 rounded-xl border border-white/5">
              <img src={user.photoURL || ''} alt="" className="w-9 h-9 rounded-full border border-white/10" />
              <div className="overflow-hidden">
                <p className="text-sm font-semibold text-white truncate">{user.displayName}</p>
                <p className="text-xs text-zinc-500 truncate">{user.email}</p>
              </div>
            </div>
          )}
          <button 
            onClick={() => logout()}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20 ${!isSidebarOpen && 'justify-center'}`}
          >
            <LogOut className="w-5 h-5" />
            {isSidebarOpen && <span className="font-medium text-sm">Sign Out</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4 md:p-8 relative z-10">
        {/* Main Area Background Glows */}
        <div className="absolute top-0 left-1/4 w-full h-[500px] bg-purple-500/10 rounded-full blur-[150px] mix-blend-screen pointer-events-none" />
        
        <div className="max-w-7xl mx-auto relative z-10">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <Dashboard user={user} />
              </motion.div>
            )}
            {activeTab === 'documents' && (
              <motion.div
                key="documents"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <DocumentManager user={user} />
              </motion.div>
            )}
            {activeTab === 'bot' && (
              <motion.div
                key="bot"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <ChatBot user={user} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
