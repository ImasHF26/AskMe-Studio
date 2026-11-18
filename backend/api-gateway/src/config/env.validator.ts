export interface EnvValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Valide les variables d'environnement critiques au démarrage du Gateway.
 * En production, bloque le démarrage si les secrets sont faibles ou par défaut.
 * En développement, alerte le développeur de façon visible.
 */
export function validateEnvironment(): EnvValidationResult {
  const isProd = process.env.NODE_ENV === 'production';
  const jwtSecret = (process.env.JWT_SECRET || '').trim();
  const datasourceSecret = (process.env.DATASOURCE_SECRET || '').trim();

  const warnings: string[] = [];
  const errors: string[] = [];

  // 1. Validation du JWT_SECRET
  if (!jwtSecret || jwtSecret === 'change-me') {
    const msg = 'JWT_SECRET is either missing or set to the default insecure value "change-me".';
    if (isProd) {
      errors.push(`[FATAL SECURITY] ${msg} Refusing to start in production mode.`);
    } else {
      warnings.push(`[SECURITY WARNING] ${msg} Please define a strong secret in your .env file.`);
    }
  } else if (jwtSecret.length < 8) {
    const msg = 'JWT_SECRET is too short (< 8 characters). High risk of brute-force forging.';
    if (isProd) {
      errors.push(`[FATAL SECURITY] ${msg}`);
    } else {
      warnings.push(`[SECURITY WARNING] ${msg}`);
    }
  }

  // 2. Validation du DATASOURCE_SECRET (chiffrement AES-256-GCM)
  if (datasourceSecret === 'change-me') {
    const msg = 'DATASOURCE_SECRET is set to "change-me". Encrypted datasource credentials can be decrypted by attackers.';
    if (isProd) {
      errors.push(`[FATAL SECURITY] ${msg}`);
    } else {
      warnings.push(`[SECURITY WARNING] ${msg}`);
    }
  }

  // Affichage des alertes en console
  for (const warn of warnings) {
    console.warn('\x1b[33m%s\x1b[0m', `⚠️  ${warn}`);
  }

  if (errors.length > 0) {
    for (const err of errors) {
      console.error('\x1b[31m%s\x1b[0m', `❌ ${err}`);
    }
    throw new Error(`Environment validation failed with ${errors.length} fatal security error(s). Application startup aborted.`);
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors
  };
}
