export function isCorsOriginAllowed(options: {
  origin: string | undefined;
  requestOrigin: string | null;
  configuredOrigins: readonly string[];
  isProduction: boolean;
}): boolean {
  const { origin, requestOrigin, configuredOrigins, isProduction } = options;

  // Requests without Origin are not browser CORS requests. Development keeps
  // its existing permissive behaviour for preview/Vite proxy environments.
  if (!origin || !isProduction) return true;

  // A browser may send Origin on same-origin POST requests. Never require the
  // deployment's own public URL to be duplicated in WEB_ORIGINS.
  if (requestOrigin !== null && origin === requestOrigin) return true;

  return configuredOrigins.includes(origin);
}

