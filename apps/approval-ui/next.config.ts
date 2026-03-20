import { resolve } from 'node:path';
import type { NextConfig } from 'next';
import { validateApprovaUiEnvironment } from '@approva/config';
import { buildUiSecurityHeaders } from './lib/security';

const { loadEnvConfig } = require('@next/env') as {
  loadEnvConfig: (dir: string) => void;
};

loadEnvConfig(resolve(process.cwd(), '../..'));
validateApprovaUiEnvironment(process.env);

const nextConfig: NextConfig = {
  transpilePackages: ['@approva/config', '@approva/shared', '@approva/sdk', '@approva/email'],
  headers: buildUiSecurityHeaders(process.env),
};

export default nextConfig;
