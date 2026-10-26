import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getPublicEnv,
  getRuntimeServerEnv,
  getServerEnv,
  parsePublicEnv,
  parseServerEnv,
} from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseServerEnv", () => {
  it("returns validated Supabase server env values with a secret key", () => {
    const env = parseServerEnv({
      PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      SUPABASE_SECRET_KEY: "sb_secret_test_key",
    });

    expect(env).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_test_key",
      supabaseServerKey: "sb_secret_test_key",
    });
  });

  it("accepts the legacy service role key name for server env values", () => {
    const env = parseServerEnv({
      PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      SUPABASE_SERVICE_ROLE_KEY: "service_role_test_key",
    });

    expect(env.supabaseServerKey).toBe("service_role_test_key");
  });

  it("returns configured reseller workflow env values and ignores empty optional placeholders", () => {
    const env = parseServerEnv({
      PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      SUPABASE_SECRET_KEY: "sb_secret_test_key",
      PUBLIC_TURNSTILE_SITE_KEY: "site_key",
      TURNSTILE_SECRET_KEY: "secret_key",
      RESEND_API_KEY: "",
      RESELLER_PRICE_LIST_FROM: "JEHMARP <sales@example.com>",
      RESELLER_ADMIN_EMAIL: "",
      UPSTASH_REDIS_REST_URL: "https://redis.example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "redis_token",
    });

    expect(env).toMatchObject({
      turnstileSiteKey: "site_key",
      turnstileSecretKey: "secret_key",
      resellerPriceListFrom: "JEHMARP <sales@example.com>",
      upstashRedisRestUrl: "https://redis.example.upstash.io",
      upstashRedisRestToken: "redis_token",
    });
    expect(env.resendApiKey).toBeUndefined();
    expect(env.resellerAdminEmail).toBeUndefined();
  });

  it("rejects server env values without a server-only key", () => {
    expect(() =>
      parseServerEnv({
        PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      }),
    ).toThrow("Invalid server environment configuration");
  });

  it("reads server values from import.meta.env", () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("MODE", "production");
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_key");
    vi.stubEnv("PUBLIC_TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESELLER_PRICE_LIST_FROM", "");
    vi.stubEnv("RESELLER_ADMIN_EMAIL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    expect(getServerEnv()).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_test_key",
      supabaseServerKey: "sb_secret_test_key",
    });
  });

  it("includes process env values for SSR adapter runtime secrets", () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_runtime_key");

    expect(getRuntimeServerEnv().SUPABASE_SECRET_KEY).toBe("sb_secret_runtime_key");
  });

  it("prefers the local Supabase connection in development", () => {
    const env = parseServerEnv({
      DEV: true,
      PUBLIC_SUPABASE_URL: "https://production.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prod_key",
      SUPABASE_SECRET_KEY: "sb_secret_prod_key",
    });

    expect(env).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
      supabaseServerKey: "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz",
    });
  });

  it("accepts local-only Supabase env values during development", () => {
    const env = parseServerEnv({
      DEV: true,
      LOCAL_SUPABASE_URL: "http://127.0.0.1:54321",
      LOCAL_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_key",
      LOCAL_SUPABASE_SECRET_KEY: "sb_secret_local_key",
      PUBLIC_TURNSTILE_SITE_KEY: "site_key",
      TURNSTILE_SECRET_KEY: "secret_key",
    });

    expect(env).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "sb_publishable_local_key",
      supabaseServerKey: "sb_secret_local_key",
      turnstileSiteKey: "site_key",
      turnstileSecretKey: "secret_key",
    });
  });

  it("omits Turnstile keys in development when TURNSTILE=disable", () => {
    const env = parseServerEnv({
      DEV: true,
      MODE: "development",
      TURNSTILE: " DISABLE ",
      LOCAL_SUPABASE_URL: "http://127.0.0.1:54321",
      LOCAL_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_key",
      LOCAL_SUPABASE_SECRET_KEY: "sb_secret_local_key",
      PUBLIC_TURNSTILE_SITE_KEY: "site_key",
      TURNSTILE_SECRET_KEY: "secret_key",
    });

    expect(env.turnstileDisabled).toBe(true);
    expect(env.turnstileSiteKey).toBeUndefined();
    expect(env.turnstileSecretKey).toBeUndefined();
  });

  it("keeps Turnstile keys when TURNSTILE=disable outside development mode", () => {
    const env = parseServerEnv({
      DEV: true,
      MODE: "test",
      TURNSTILE: "disable",
      LOCAL_SUPABASE_URL: "http://127.0.0.1:54321",
      LOCAL_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_key",
      LOCAL_SUPABASE_SECRET_KEY: "sb_secret_local_key",
      PUBLIC_TURNSTILE_SITE_KEY: "site_key",
      TURNSTILE_SECRET_KEY: "secret_key",
    });

    expect(env.turnstileDisabled).toBeUndefined();
    expect(env.turnstileSecretKey).toBe("secret_key");
  });

  it("keeps Turnstile keys outside development when TURNSTILE=disable", () => {
    const env = parseServerEnv({
      NODE_ENV: "production",
      TURNSTILE: "disable",
      PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      SUPABASE_SECRET_KEY: "sb_secret_test_key",
      PUBLIC_TURNSTILE_SITE_KEY: "site_key",
      TURNSTILE_SECRET_KEY: "secret_key",
    });

    expect(env.turnstileDisabled).toBeUndefined();
    expect(env.turnstileSiteKey).toBe("site_key");
    expect(env.turnstileSecretKey).toBe("secret_key");
  });
});

describe("parsePublicEnv", () => {
  it("returns validated Supabase public env values", () => {
    const env = parsePublicEnv({
      PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
    });

    expect(env).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_test_key",
    });
  });

  it("rejects invalid public env values", () => {
    expect(() =>
      parsePublicEnv({
        PUBLIC_SUPABASE_URL: "not-a-url",
        PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toThrow("Invalid public environment configuration");
  });

  it("reads validated local values from import.meta.env during development", () => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
    vi.stubEnv("PUBLIC_TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE", "");

    expect(getPublicEnv()).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
    });
  });

  it("returns the Turnstile site key when configured", () => {
    const env = parsePublicEnv({
      PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      PUBLIC_TURNSTILE_SITE_KEY: "site_key",
    });

    expect(env.turnstileSiteKey).toBe("site_key");
    expect(env.turnstileDisabled).toBeUndefined();
  });

  it("disables Turnstile in development when TURNSTILE=disable", () => {
    const env = parsePublicEnv({
      DEV: true,
      MODE: "development",
      TURNSTILE: "disable",
      PUBLIC_TURNSTILE_SITE_KEY: "site_key",
    });

    expect(env.turnstileDisabled).toBe(true);
    expect(env.turnstileSiteKey).toBeUndefined();
  });

  it("keeps Turnstile enabled outside development when TURNSTILE=disable", () => {
    const env = parsePublicEnv({
      NODE_ENV: "production",
      TURNSTILE: "disable",
      PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      PUBLIC_TURNSTILE_SITE_KEY: "site_key",
    });

    expect(env.turnstileDisabled).toBeUndefined();
    expect(env.turnstileSiteKey).toBe("site_key");
  });

  it("prefers the local Supabase public connection in development", () => {
    const env = parsePublicEnv({
      DEV: true,
      PUBLIC_SUPABASE_URL: "https://production.supabase.co",
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prod_key",
    });

    expect(env).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
    });
  });
});
