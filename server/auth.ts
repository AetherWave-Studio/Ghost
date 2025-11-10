import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { storage } from "./storage";

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Development test bypass - "backstage pass"
  if (process.env.NODE_ENV === 'development' && req.headers['x-test-user'] === 'backstage-pass') {
    // Create a test session for development
    req.session = req.session || {};
    req.session.userId = 'test-user-backstage';
    console.log('🎫 Backstage pass activated for testing');
    next();
    return;
  }

  if (!req.session?.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

export async function getCurrentUser(req: Request) {
  // Development test bypass - return test user
  if (process.env.NODE_ENV === 'development' && req.headers['x-test-user'] === 'backstage-pass') {
    return {
      id: 'test-user-backstage',
      username: 'BackstageTestUser',
      password: 'test'
    };
  }

  if (!req.session?.userId) {
    return null;
  }
  return await storage.getUser(req.session.userId);
}