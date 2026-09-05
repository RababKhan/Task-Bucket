import "server-only";
import { dbGet } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";

export type Branding = {
  name: string;
  logo: string;
  favicon: string;
  colorDark: string;
  colorLight: string;
};

export const EMPTY_BRANDING: Branding = {
  name: "",
  logo: "",
  favicon: "",
  colorDark: "",
  colorLight: "",
};

// Server-side read of the signed-in user's workspace branding, so the root
// layout can hand it to BrandingProvider as initial state. Without this the
// sidebar paints the default name/logo for a frame before the client effect
// swaps in the real branding.
export async function getInitialBranding(): Promise<Branding> {
  try {
    const userId = await currentUserId();
    if (!userId) return EMPTY_BRANDING;
    const m = await getMembership(userId);
    if (!m) return EMPTY_BRANDING;
    const w = await dbGet<{
      brand_name: string | null;
      brand_logo: string | null;
      brand_favicon: string | null;
      brand_color_dark: string | null;
      brand_color_light: string | null;
    }>(
      `SELECT brand_name, brand_logo, brand_favicon, brand_color_dark, brand_color_light
         FROM workspaces WHERE id = ?`,
      [m.workspace_id]
    );
    return {
      name: w?.brand_name ?? "",
      logo: w?.brand_logo ?? "",
      favicon: w?.brand_favicon ?? "",
      colorDark: w?.brand_color_dark ?? "",
      colorLight: w?.brand_color_light ?? "",
    };
  } catch {
    return EMPTY_BRANDING;
  }
}
