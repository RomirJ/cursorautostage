import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Upload, Video, Calendar, BarChart, Share } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Landing() {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleGetStarted = () => {
    setShowLoginModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const endpoint = isLogin ? "/api/auth/login" : "/api/auth/signup";
      const body = isLogin 
        ? { email, password }
        : { email, password, firstName, lastName };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: isLogin ? "Login successful!" : "Account created!",
          description: "Welcome to AutoStage!",
        });
        setShowLoginModal(false);
        // Refresh the page to update authentication state
        window.location.reload();
      } else {
        toast({
          title: "Error",
          description: data.message || "Something went wrong",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Network error. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Play className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">AutoStage</h1>
            </div>
            <Button onClick={handleGetStarted} className="bg-primary hover:bg-blue-700">
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-5xl font-bold text-slate-900 mb-6">
            AI-Powered Content
            <span className="text-primary"> Replication Engine</span>
          </h2>
          <p className="text-xl text-slate-600 mb-8 max-w-3xl mx-auto">
            Transform your videos and audio into multiple engaging content pieces automatically. 
            Upload once, distribute everywhere with AI-generated clips, quotes, and social media posts.
          </p>
          <Button 
            onClick={handleGetStarted}
            size="lg" 
            className="bg-primary hover:bg-blue-700 text-lg px-8 py-4"
          >
            Start Creating Content
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-slate-900 mb-4">
              Everything You Need to Scale Your Content
            </h3>
            <p className="text-slate-600 max-w-2xl mx-auto">
              From transcription to social media scheduling, AutoStage handles your entire content pipeline.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <h4 className="text-xl font-semibold mb-2">Smart Upload</h4>
                <p className="text-slate-600">
                  Support for MP4, MOV, MP3, and WAV files up to 500MB. 
                  Drag and drop or click to upload.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <Video className="w-6 h-6 text-accent" />
                </div>
                <h4 className="text-xl font-semibold mb-2">AI Processing</h4>
                <p className="text-slate-600">
                  OpenAI Whisper transcription and GPT-4o semantic chunking 
                  to identify the best content segments.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <Share className="w-6 h-6 text-purple-600" />
                </div>
                <h4 className="text-xl font-semibold mb-2">Multi-Platform</h4>
                <p className="text-slate-600">
                  Generate vertical shorts, quote graphics, and optimized 
                  social media posts for all platforms.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
                  <Calendar className="w-6 h-6 text-yellow-600" />
                </div>
                <h4 className="text-xl font-semibold mb-2">Smart Scheduling</h4>
                <p className="text-slate-600">
                  Schedule and publish your content across multiple social 
                  media platforms automatically.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center mb-4">
                  <BarChart className="w-6 h-6 text-pink-600" />
                </div>
                <h4 className="text-xl font-semibold mb-2">Analytics</h4>
                <p className="text-slate-600">
                  Track performance, engagement, and ROI across all your 
                  generated content pieces.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                  <Play className="w-6 h-6 text-indigo-600" />
                </div>
                <h4 className="text-xl font-semibold mb-2">Real-time Processing</h4>
                <p className="text-slate-600">
                  Watch your content transform in real-time with live 
                  processing status and progress tracking.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-primary text-white">
        <div className="container mx-auto px-6 text-center">
          <h3 className="text-3xl font-bold mb-4">
            Ready to Transform Your Content Strategy?
          </h3>
          <p className="text-xl mb-8 text-blue-100">
            Join creators who are scaling their content with AI-powered automation.
          </p>
          <Button 
            onClick={handleGetStarted}
            size="lg"
            variant="secondary"
            className="bg-white text-primary hover:bg-gray-100"
          >
            Get Started Now
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-8">
        <div className="container mx-auto px-6 text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Play className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold">AutoStage</span>
          </div>
          <p className="text-slate-400">
            AI-powered content replication and revenue engine
          </p>
        </div>
      </footer>

      {/* Login/Signup Modal */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isLogin ? "Welcome Back" : "Create Your Account"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required={!isLogin}
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required={!isLogin}
                  />
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Loading..." : (isLogin ? "Sign In" : "Create Account")}
            </Button>
          </form>
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-blue-600 hover:underline"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
