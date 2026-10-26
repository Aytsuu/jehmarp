import type { APIRoute } from "astro";

import { getDashboardRoleWithClient } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { getClientIp } from "@/lib/security/client-ip";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/public-website/turnstile";
import { loadPrivacyAcknowledgementRequirement } from "@/lib/public-website/privacy-collection-notice";
import { validatePrivacyNoticeAcknowledgement } from "@/lib/platform-settings/privacy-notice";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const formData = await context.request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return context.redirect("/login?error=Email%20and%20password%20are%20required.", 303);
  }

  const env = getServerEnv();
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "").trim();
  const requirePrivacyAcknowledgement = await loadPrivacyAcknowledgementRequirement();
  const privacyAckError = validatePrivacyNoticeAcknowledgement(formData, requirePrivacyAcknowledgement);
  if (privacyAckError) {
    return context.redirect(`/login?error=${encodeURIComponent(privacyAckError)}`, 303);
  }

  if (!env.turnstileDisabled && env.turnstileSecretKey) {
    if (!turnstileToken) {
      return context.redirect("/login?error=Please%20complete%20the%20verification%20challenge.", 303);
    }
    try {
      await verifyTurnstileToken(env.turnstileSecretKey, turnstileToken, {
        clientIp: getClientIp(context.request.headers),
      });
    } catch {
      return context.redirect("/login?error=Verification%20failed.%20Please%20try%20again.", 303);
    }
  }

  const supabase = createSupabaseServerClient(context);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return context.redirect("/login?error=Invalid%20email%20or%20password.", 303);
  }

  try {
    await getDashboardRoleWithClient(supabase, data.user.id);
  } catch {
    await supabase.auth.signOut();
    return context.redirect("/login?error=This%20account%20has%20no%20dashboard%20access.", 303);
  }

  return context.redirect("/dashboard", 303);
};
