import { createClient } from '@supabase/supabase-js';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { storage } from './storage';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Session configuration
export function getSession() {
  return session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    },
  });
}

// User interface
interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      firstName?: string;
      lastName?: string;
      profileImageUrl?: string;
    }
  }
}

// Authentication middleware
export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is in session
    if (req.session.userId) {
      const user = await storage.getUser(req.session.userId);
      if (user) {
        req.user = user;
        return next();
      }
    }

    // Check for Authorization header (for API calls)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const user = await getUserFromToken(token);
      if (user) {
        req.user = user;
        return next();
      }
    }

    return res.status(401).json({ message: 'Unauthorized' });
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ message: 'Authentication failed' });
  }
};

// Create user from Supabase user data
async function createUserFromSupabase(supabaseUser: any): Promise<Express.User> {
  const userData = {
    id: supabaseUser.id,
    email: supabaseUser.email!,
    firstName: supabaseUser.user_metadata?.first_name || supabaseUser.user_metadata?.full_name?.split(' ')[0],
    lastName: supabaseUser.user_metadata?.last_name || supabaseUser.user_metadata?.full_name?.slice(1).join(' '),
    profileImageUrl: supabaseUser.user_metadata?.avatar_url,
  };

  await storage.upsertUser(userData);
  return userData;
}

// Setup authentication routes
export function setupAuth(app: express.Application) {
  app.use(getSession());

  // Login endpoint
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return res.status(401).json({ message: error.message });
      }

      if (data.user) {
        // Get or create user in our database
        const dbUser = await storage.getUser(data.user.id) || await createUserFromSupabase(data.user);
        
        // Set session
        req.session.userId = dbUser.id;
        
        return res.json({
          user: dbUser,
          session: data.session,
        });
      }

      return res.status(401).json({ message: 'Login failed' });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Signup endpoint
  app.post('/api/auth/signup', async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

      if (error) {
        return res.status(400).json({ message: error.message });
      }

      if (data.user) {
        // Create user in our database
        const dbUser = await createUserFromSupabase(data.user);
        
        // Set session
        req.session.userId = dbUser.id;
        
        return res.json({
          user: dbUser,
          session: data.session,
        });
      }

      return res.status(400).json({ message: 'Signup failed' });
    } catch (error) {
      console.error('Signup error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Logout endpoint
  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    try {
      // Clear session
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destruction error:', err);
        }
      });

      // Sign out from Supabase
      await supabase.auth.signOut();

      return res.json({ message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Get current user endpoint
  app.get('/api/auth/me', isAuthenticated, async (req: Request, res: Response) => {
    try {
      return res.json({ user: req.user });
    } catch (error) {
      console.error('Get user error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Password reset endpoint
  app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password`,
      });

      if (error) {
        return res.status(400).json({ message: error.message });
      }

      return res.json({ message: 'Password reset email sent' });
    } catch (error) {
      console.error('Password reset error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });

  // Update password endpoint
  app.post('/api/auth/update-password', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ message: 'New password is required' });
      }

      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        return res.status(400).json({ message: error.message });
      }

      return res.json({ message: 'Password updated successfully' });
    } catch (error) {
      console.error('Update password error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
}

// Helper function to get user from token (for API calls)
export async function getUserFromToken(token: string): Promise<Express.User | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (user && !error) {
      return await storage.getUser(user.id) || await createUserFromSupabase(user);
    }
    
    return null;
  } catch (error) {
    console.error('Get user from token error:', error);
    return null;
  }
} 