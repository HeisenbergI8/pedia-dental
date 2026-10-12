"use client";
import { useMemo } from "react";
import { useClinic } from "../api";
import { brandCss } from "../brand-css";

/**
 * Applies the signed-in clinic's colour and font. Mounted by AppShell and PortalShell, never on sign-in, so signing out
 * returns to Primolar's own look (decision #32). Before /clinic answers, Primolar's tokens show (cached afterwards).
 */
export function BrandTheme() {
  const account = useClinic().data?.account;
  const css = useMemo(() => (account ? brandCss(account.brandColor, account.headingFont) : ""), [account]);
  return css ? <style>{css}</style> : null;
}
