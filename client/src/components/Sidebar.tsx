import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  Play, 
  Home, 
  Upload, 
  Video, 
  Calendar, 
  BarChart3, 
  Share2,
  Settings,
  LogOut,
  DollarSign,
  MessageCircle,
  CreditCard
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function clearAllCookies() {
  // Remove all cookies for localhost (dev only, for production use a more targeted approach)
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const eqPos = cookie.indexOf('=');
    const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
    document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
  }
}

export default function Sidebar() {
  const { user } = useAuth();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      clearAllCookies();
      toast({
        title: "Logged out",
        description: "You have been logged out successfully.",
      });
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    } catch (e) {
      toast({
        title: "Logout failed",
        description: "Please clear your cookies and try again.",
        variant: "destructive",
      });
    }
  };

  const navigationItems = [
    { icon: Home, label: "Dashboard", href: "/", active: true },
    { icon: Upload, label: "Upload Content", href: "/upload" },
    { icon: Video, label: "Content Library", href: "/library" },
    { icon: Calendar, label: "Scheduling", href: "/scheduling" },
    { icon: BarChart3, label: "Analytics", href: "/analytics" },
    { icon: MessageCircle, label: "Engagement", href: "/engagement" },
    { icon: DollarSign, label: "Monetization", href: "/monetization" },
    { icon: CreditCard, label: "Billing", href: "/billing" },
    { icon: Share2, label: "Social Accounts", href: "/accounts" },
  ];

  return (
    <div className="h-full flex flex-col bg-white border-r border-slate-200 w-64">
      {/* Logo */}
      <div className="flex items-center px-6 py-4 border-b border-slate-200">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mr-3">
          <Play className="w-4 h-4 text-white" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">AutoStage</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.label}
              variant={item.active ? "default" : "ghost"}
              className="w-full justify-start"
              asChild
            >
              <Link href={item.href}>
                <Icon className="w-5 h-5 mr-3" />
                {item.label}
              </Link>
            </Button>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="px-4 py-4 border-t border-slate-200">
        <div className="flex items-center mb-3">
          {user?.profileImageUrl ? (
            <img 
              src={user.profileImageUrl} 
              alt="Profile" 
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 bg-slate-300 rounded-full flex items-center justify-center">
              <span className="text-slate-600 font-medium">
                {user?.firstName?.[0] || user?.email?.[0] || 'U'}
              </span>
            </div>
          )}
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-slate-900">
              {user?.firstName && user?.lastName 
                ? `${user.firstName} ${user.lastName}`
                : user?.email || 'User'
              }
            </p>
            <p className="text-xs text-slate-500">Pro Plan</p>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <Button variant="ghost" size="sm" className="flex-1" asChild>
            <Link href="/settings">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
