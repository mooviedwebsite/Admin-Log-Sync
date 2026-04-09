import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Film, Eye, EyeOff, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { setCurrentUser } from "@/lib/auth";

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "India",
  "Germany", "France", "Japan", "Brazil", "Sri Lanka", "Other",
];

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [, navigate] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !country) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const data = await api.registerUser(name, email, password, country);
      setCurrentUser({
        id: data.user?.id || Date.now().toString(),
        name,
        email,
        country,
        isAdmin: false,
        created_at: new Date().toISOString(),
      });
      navigate("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      if (msg.includes("not configured")) {
        setCurrentUser({
          id: Date.now().toString(),
          name,
          email,
          country,
          isAdmin: false,
          created_at: new Date().toISOString(),
        });
        navigate("/");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,215,0,0.05)_0%,_transparent_70%)]" />

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <Film className="w-8 h-8 text-yellow-400" />
            <span className="text-3xl font-black text-white">MOOV<span className="text-yellow-400">IED</span></span>
          </Link>
        </div>

        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-white/50 text-sm mb-6">Join MOOVIED and start streaming today.</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-lg px-4 py-3 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-lg px-4 py-3 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-lg px-4 py-3 outline-none transition-colors pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">Country</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white rounded-lg px-4 py-3 outline-none transition-colors"
              >
                <option value="" className="bg-gray-900">Select your country</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c} className="bg-gray-900">{c}</option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <p className="text-center text-white/50 text-sm mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-yellow-400 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
