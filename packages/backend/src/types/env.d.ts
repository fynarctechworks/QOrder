// Environment variables type definitions
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    PORT: string;
    DATABASE_URL: string;
    REDIS_URL: string;
    JWT_ACCESS_SECRET: string;
    JWT_REFRESH_SECRET: string;
    JWT_ACCESS_EXPIRES_IN: string;
    JWT_REFRESH_EXPIRES_IN: string;
    CORS_ORIGIN: string;
    SMTP_HOST: string;
    SMTP_PORT: string;
    SMTP_USER: string;
    SMTP_PASS: string;
    SMTP_FROM: string;
  }
}
