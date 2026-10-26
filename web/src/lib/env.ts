import { z } from "zod";

const optionalStringEnv = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalEmailEnv = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.email().optional(),
);

const localDevSupabaseDefaults = {
  url: "http://127.0.0.1:54321",
  publishableKey: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
  secretKey: "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz",
} as const;

const publicEnvSchema = z
  .object({
    PUBLIC_SUPABASE_URL: optionalStringEnv,
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalStringEnv,
    PUBLIC_TURNSTILE_SITE_KEY: optionalStringEnv,
    TURNSTILE: optionalStringEnv,
    LOCAL_SUPABASE_URL: optionalStringEnv,
    LOCAL_SUPABASE_PUBLISHABLE_KEY: optionalStringEnv,
    LOCAL_SUPABASE_SECRET_KEY: optionalStringEnv,
    LOCAL_SUPABASE_SERVICE_ROLE_KEY: optionalStringEnv,
    DEV: z.boolean().optional(),
    MODE: z.string().optional(),
    NODE_ENV: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (shouldUseLocalSupabase(value)) {
      return;
    }

    if (!value.PUBLIC_SUPABASE_URL) {
      context.addIssue({
        code: "custom",
        message: "PUBLIC_SUPABASE_URL is required outside development",
        path: ["PUBLIC_SUPABASE_URL"],
      });
    } else if (!z.url().safeParse(value.PUBLIC_SUPABASE_URL).success) {
      context.addIssue({
        code: "custom",
        message: "PUBLIC_SUPABASE_URL must be a valid URL",
        path: ["PUBLIC_SUPABASE_URL"],
      });
    }

    if (!value.PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      context.addIssue({
        code: "custom",
        message: "PUBLIC_SUPABASE_PUBLISHABLE_KEY is required outside development",
        path: ["PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
      });
    }
  });

const serverEnvSchema = publicEnvSchema.safeExtend({
  SUPABASE_SECRET_KEY: optionalStringEnv,
  SUPABASE_SERVICE_ROLE_KEY: optionalStringEnv,
  TURNSTILE_SECRET_KEY: optionalStringEnv,
  RESEND_API_KEY: optionalStringEnv,
  RESELLER_PRICE_LIST_FROM: optionalStringEnv,
  RESELLER_ADMIN_EMAIL: optionalEmailEnv,
  UPSTASH_REDIS_REST_URL: optionalStringEnv,
  UPSTASH_REDIS_REST_TOKEN: optionalStringEnv,
}).superRefine((value, context) => {
  if (shouldUseLocalSupabase(value)) {
    return;
  }

  if (!value.SUPABASE_SECRET_KEY && !value.SUPABASE_SERVICE_ROLE_KEY) {
    context.addIssue({
      code: "custom",
      message: "A Supabase server secret key is required",
      path: ["SUPABASE_SECRET_KEY"],
    });
  }
});

export type PublicEnv = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  turnstileSiteKey?: string;
  turnstileDisabled?: boolean;
};

export type ServerEnv = PublicEnv & {
  supabaseServerKey: string;
  turnstileSecretKey?: string;
  resendApiKey?: string;
  resellerPriceListFrom?: string;
  resellerAdminEmail?: string;
  upstashRedisRestUrl?: string;
  upstashRedisRestToken?: string;
};

export function parsePublicEnv(input: Record<string, unknown>): PublicEnv {
  const result = publicEnvSchema.safeParse(input);

  if (!result.success) {
    throw new Error("Invalid public environment configuration");
  }

  const supabaseUrl = shouldUseLocalSupabase(input)
    ? result.data.LOCAL_SUPABASE_URL ?? localDevSupabaseDefaults.url
    : result.data.PUBLIC_SUPABASE_URL ?? "";
  const supabasePublishableKey = shouldUseLocalSupabase(input)
    ? result.data.LOCAL_SUPABASE_PUBLISHABLE_KEY ?? localDevSupabaseDefaults.publishableKey
    : result.data.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  return {
    supabaseUrl,
    supabasePublishableKey,
    ...turnstileEnvFields(result.data),
  };
}

export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    ...getProcessEnv(),
    ...import.meta.env,
  });
}

export function parseServerEnv(input: Record<string, unknown>): ServerEnv {
  const result = serverEnvSchema.safeParse(input);

  if (!result.success) {
    throw new Error("Invalid server environment configuration");
  }

  const useLocalSupabase = shouldUseLocalSupabase(input);
  const supabaseUrl = useLocalSupabase
    ? result.data.LOCAL_SUPABASE_URL ?? localDevSupabaseDefaults.url
    : result.data.PUBLIC_SUPABASE_URL ?? "";
  const supabasePublishableKey = useLocalSupabase
    ? result.data.LOCAL_SUPABASE_PUBLISHABLE_KEY ?? localDevSupabaseDefaults.publishableKey
    : result.data.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const supabaseServerKey = useLocalSupabase
    ? result.data.LOCAL_SUPABASE_SECRET_KEY
      ?? result.data.LOCAL_SUPABASE_SERVICE_ROLE_KEY
      ?? localDevSupabaseDefaults.secretKey
    : result.data.SUPABASE_SECRET_KEY ?? result.data.SUPABASE_SERVICE_ROLE_KEY ?? "";

  return {
    supabaseUrl,
    supabasePublishableKey,
    supabaseServerKey,
    ...turnstileEnvFields(result.data, result.data.TURNSTILE_SECRET_KEY),
    ...(result.data.RESEND_API_KEY ? { resendApiKey: result.data.RESEND_API_KEY } : {}),
    ...(result.data.RESELLER_PRICE_LIST_FROM
      ? { resellerPriceListFrom: result.data.RESELLER_PRICE_LIST_FROM }
      : {}),
    ...(result.data.RESELLER_ADMIN_EMAIL
      ? { resellerAdminEmail: result.data.RESELLER_ADMIN_EMAIL }
      : {}),
    ...(result.data.UPSTASH_REDIS_REST_URL
      ? { upstashRedisRestUrl: result.data.UPSTASH_REDIS_REST_URL }
      : {}),
    ...(result.data.UPSTASH_REDIS_REST_TOKEN
      ? { upstashRedisRestToken: result.data.UPSTASH_REDIS_REST_TOKEN }
      : {}),
  };
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv(getRuntimeServerEnv());
}

export function turnstileFormToken(value: FormDataEntryValue | null): string {
  const token = typeof value === "string" ? value.trim() : "";
  if (token || !getServerEnv().turnstileDisabled) {
    return token;
  }

  return "disabled";
}

export function getRuntimeServerEnv(): Record<string, unknown> {
  // Vite-injected values win over process.env so dev/test stubs and .env.local load correctly.
  return {
    ...getProcessEnv(),
    ...import.meta.env,
  };
}

function getProcessEnv(): Record<string, unknown> {
  if (typeof process === "undefined") {
    return {};
  }

  return process.env;
}

function shouldUseLocalSupabase(input: Record<string, unknown>) {
  return (
    input.DEV === true
    || input.DEV === "true"
    || input.NODE_ENV === "development"
  );
}

function isTurnstileDisabledInDev(input: {
  MODE?: string;
  TURNSTILE?: string;
}) {
  return input.MODE === "development"
    && input.TURNSTILE?.trim().toLowerCase() === "disable";
}

function turnstileEnvFields(
  input: {
    MODE?: string;
    TURNSTILE?: string;
    PUBLIC_TURNSTILE_SITE_KEY?: string;
  },
  secretKey?: string,
) {
  if (isTurnstileDisabledInDev(input)) {
    return { turnstileDisabled: true };
  }

  return {
    ...(input.PUBLIC_TURNSTILE_SITE_KEY
      ? { turnstileSiteKey: input.PUBLIC_TURNSTILE_SITE_KEY }
      : {}),
    ...(secretKey ? { turnstileSecretKey: secretKey } : {}),
  };
}
