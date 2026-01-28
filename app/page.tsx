/**
 * ShellVault Landing Page
 * 
 * Minimalist design with rustic touches
 * Dark theme with warm accents
 * Terminal-inspired aesthetics
 */

import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-zinc-950/80 backdrop-blur-sm border-b border-zinc-800/50 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {/* Logo */}
            <div className="w-8 h-8 bg-gradient-to-br from-amber-600 to-amber-800 rounded-md flex items-center justify-center font-mono text-sm font-bold">
              SV
            </div>
            <span className="text-xl font-light tracking-tight">
              Shell<span className="font-semibold text-amber-600">Vault</span>
            </span>
          </div>
          
          <div className="flex items-center space-x-6">
            <Link 
              href="/login" 
              className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              Login
            </Link>
            <Link 
              href="/register" 
              className="text-sm bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md transition-colors font-medium"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center space-x-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2 mb-8">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-sm text-zinc-400">Secure SSH Management</span>
            </div>

            {/* Main Heading */}
            <h1 className="text-6xl md:text-7xl font-light tracking-tight mb-6">
              Your SSH Credentials.
              <br />
              <span className="font-semibold bg-gradient-to-r from-amber-500 via-amber-600 to-orange-700 bg-clip-text text-transparent">
                Fortified.
              </span>
            </h1>

            {/* Subheading */}
            <p className="text-xl text-zinc-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              Military-grade encryption meets passwordless authentication. 
              Rotate credentials automatically. Access servers securely from anywhere.
            </p>

            {/* CTA Buttons */}
            <div className="flex items-center justify-center space-x-4">
              <Link 
                href="/register"
                className="bg-amber-600 hover:bg-amber-700 text-white px-8 py-4 rounded-lg font-medium transition-all hover:scale-105 shadow-lg shadow-amber-900/50"
              >
                Start Free Trial
              </Link>
              <Link 
                href="#features"
                className="bg-zinc-900 hover:bg-zinc-800 text-zinc-100 px-8 py-4 rounded-lg font-medium transition-colors border border-zinc-800"
              >
                Learn More
              </Link>
            </div>

            {/* Terminal Preview */}
            <div className="mt-20 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shadow-2xl">
              <div className="bg-zinc-800 px-4 py-3 flex items-center space-x-2 border-b border-zinc-700">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-xs text-zinc-500 ml-4 font-mono">shellvault@secure</span>
              </div>
              <div className="p-6 font-mono text-sm text-left">
                <div className="text-zinc-500">$ shellvault connect production-server</div>
                <div className="text-emerald-500 mt-2">✓ Authenticating with TOTP...</div>
                <div className="text-emerald-500 mt-1">✓ Credentials rotated 2 hours ago</div>
                <div className="text-emerald-500 mt-1">✓ Establishing secure connection...</div>
                <div className="text-amber-500 mt-2">→ Connected to production-server (192.168.1.100)</div>
                <div className="text-zinc-500 mt-4">ubuntu@production:~$ <span className="animate-pulse">▊</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-light tracking-tight mb-4">
              Built for <span className="font-semibold text-amber-600">Security</span>
            </h2>
            <p className="text-zinc-400 text-lg">Zero-trust architecture. Every connection verified.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 hover:border-amber-600/50 transition-colors">
              <div className="w-12 h-12 bg-amber-600/10 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Passwordless Auth</h3>
              <p className="text-zinc-400 leading-relaxed">
                TOTP-based authentication eliminates password vulnerabilities. 
                Your phone is your key.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 hover:border-amber-600/50 transition-colors">
              <div className="w-12 h-12 bg-amber-600/10 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Auto Rotation</h3>
              <p className="text-zinc-400 leading-relaxed">
                Credentials rotate automatically on your schedule. 
                Compromised keys become useless instantly.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 hover:border-amber-600/50 transition-colors">
              <div className="w-12 h-12 bg-amber-600/10 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">IP Binding</h3>
              <p className="text-zinc-400 leading-relaxed">
                Sessions locked to your IP address. 
                Token theft becomes impossible.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 hover:border-amber-600/50 transition-colors">
              <div className="w-12 h-12 bg-amber-600/10 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Audit Logging</h3>
              <p className="text-zinc-400 leading-relaxed">
                Every connection tracked and logged. 
                Know exactly who accessed what, when.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 hover:border-amber-600/50 transition-colors">
              <div className="w-12 h-12 bg-amber-600/10 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Lightning Fast</h3>
              <p className="text-zinc-400 leading-relaxed">
                Redis-backed sessions. Sub-millisecond authentication. 
                Security without slowdown.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 hover:border-amber-600/50 transition-colors">
              <div className="w-12 h-12 bg-amber-600/10 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Self-Hosted</h3>
              <p className="text-zinc-400 leading-relaxed">
                Your infrastructure, your rules. 
                Full control over your security architecture.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-light tracking-tight mb-4">
              Simple <span className="font-semibold text-amber-600">Yet Secure</span>
            </h2>
            <p className="text-zinc-400 text-lg">Three steps to fortress-grade SSH management</p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-amber-600/10 border border-amber-600/20 rounded-full flex items-center justify-center mx-auto mb-6 font-mono text-2xl font-bold text-amber-600">
                1
              </div>
              <h3 className="text-xl font-semibold mb-3">Register & Verify</h3>
              <p className="text-zinc-400">
                Create your account, verify your email, and set up two-factor authentication in minutes.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-amber-600/10 border border-amber-600/20 rounded-full flex items-center justify-center mx-auto mb-6 font-mono text-2xl font-bold text-amber-600">
                2
              </div>
              <h3 className="text-xl font-semibold mb-3">Add Your Servers</h3>
              <p className="text-zinc-400">
                Install our lightweight agent on your servers. One command. Zero hassle.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-amber-600/10 border border-amber-600/20 rounded-full flex items-center justify-center mx-auto mb-6 font-mono text-2xl font-bold text-amber-600">
                3
              </div>
              <h3 className="text-xl font-semibold mb-3">Connect Securely</h3>
              <p className="text-zinc-400">
                Access your servers through our broker. Credentials rotate automatically. Sleep soundly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center bg-gradient-to-br from-amber-600/10 to-orange-700/10 border border-amber-600/20 rounded-2xl p-12">
          <h2 className="text-4xl font-light tracking-tight mb-4">
            Ready to <span className="font-semibold text-amber-600">Secure</span> Your Infrastructure?
          </h2>
          <p className="text-xl text-zinc-400 mb-8">
            Join security-conscious teams protecting their SSH access.
          </p>
          <Link 
            href="/register"
            className="inline-block bg-amber-600 hover:bg-amber-700 text-white px-10 py-4 rounded-lg font-medium transition-all hover:scale-105 shadow-lg shadow-amber-900/50"
          >
            Get Started Free
          </Link>
          <p className="text-sm text-zinc-500 mt-4">
            No credit card required • 30-day free trial
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-zinc-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-zinc-500">
              <div className="w-6 h-6 bg-gradient-to-br from-amber-600 to-amber-800 rounded-md flex items-center justify-center font-mono text-xs font-bold">
                SV
              </div>
              <span className="text-sm">© 2026 ShellVault. Built for security.</span>
            </div>
            <div className="flex items-center space-x-6 text-sm text-zinc-500">
              <a href="#" className="hover:text-zinc-300 transition-colors">Documentation</a>
              <a href="#" className="hover:text-zinc-300 transition-colors">GitHub</a>
              <a href="#" className="hover:text-zinc-300 transition-colors">Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}