import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";

// Create Express app for testing
export const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add basic logging middleware for tests
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      console.log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

// Register routes
export async function setupTestServer() {
  try {
    const server = await registerRoutes(app);
    
    // Error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });
    
    return server;
  } catch (error) {
    console.error('Error setting up test server:', error);
    throw error;
  }
}

// Export a function to create a test app instance
export function createTestApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(express.urlencoded({ extended: false }));
  
  // Add basic logging
  testApp.use((req, res, next) => {
    console.log(`TEST: ${req.method} ${req.path}`);
    next();
  });
  
  return testApp;
} 