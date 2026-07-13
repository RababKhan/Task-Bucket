import { NextResponse } from "next/server";
import { dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import { getEffectivePlan } from "@/lib/billing";

type BrandRow = {
  id: string;
  brand_name: string | null;
  brand_logo: string | null;
  brand_favicon: string | null;
  brand_color_dark: string | null;
  brand_color_light: string | null;
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const LOGO = /^data:image\/(png|jpe?g|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,/;

function payload(w: BrandRow | undefined) {
  return {
    name: w?.brand_name ?? "",
    logo: w?.brand_logo ?? "",
    favicon: w?.brand_favicon ?? "",
    colorDark: w?.brand_color_dark ?? "",
    colorLight: w?.brand_color_light ?? "",
  };
}

async function currentWorkspace(userId: string) {
  const m = await getMembership(userId);
  if (!m) return null;
  const w = await dbGet<BrandRow>(
    "SELECT id, brand_name, brand_logo, brand_favicon, brand_color_dark, brand_color_light FROM workspaces WHERE id = ?",
    [m.workspace_id]
  );
  return { m, w };
}

// Any member can read the workspace branding (to apply it app-wide).
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cw = await currentWorkspace(userId);
  const plan = cw ? await getEffectivePlan(cw.m.workspace_id) : "free";
  return NextResponse.json({ ...payload(cw?.w), plan });
}

// Admins update the branding.
export async function PATCH(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cw = await currentWorkspace(userId);
  if (!cw?.w) {
    return NextResponse.json({ error: "No workspace." }, { status: 404 });
  }
  if (cw.m.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can change branding." },
      { status: 403 }
    );
  }
  // White-labeling is a Pro feature.
  if ((await getEffectivePlan(cw.m.workspace_id)) !== "pro") {
    return NextResponse.json(
      { error: "Upgrade to Pro to customize branding." },
      { status: 403 }
    );
  }
  const body = await request.json().catch(() => ({}));

  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
  const logo = typeof body.logo === "string" ? body.logo.trim() : "";
  const favicon = typeof body.favicon === "string" ? body.favicon.trim() : "";
  const colorDark =
    typeof body.colorDark === "string" ? body.colorDark.trim() : "";
  const colorLight =
    typeof body.colorLight === "string" ? body.colorLight.trim() : "";

  for (const [img, field, label] of [
    [logo, "logo", "Logo"],
    [favicon, "favicon", "Favicon"],
  ] as const) {
    if (img && !LOGO.test(img)) {
      return NextResponse.json(
        { error: `Unsupported ${label.toLowerCase()} image.`, field },
        { status: 400 }
      );
    }
    if (img && img.length > 400_000) {
      return NextResponse.json(
        { error: `${label} is too large. Use a smaller image.`, field },
        { status: 400 }
      );
    }
  }
  for (const [val, field] of [
    [colorDark, "colorDark"],
    [colorLight, "colorLight"],
  ] as const) {
    if (val && !HEX.test(val)) {
      return NextResponse.json(
        { error: "Enter a valid hex color (e.g. #1f6feb).", field },
        { status: 400 }
      );
    }
  }

  await dbRun(
    "UPDATE workspaces SET brand_name = ?, brand_logo = ?, brand_favicon = ?, brand_color_dark = ?, brand_color_light = ? WHERE id = ?",
    [
      name || null,
      logo || null,
      favicon || null,
      colorDark || null,
      colorLight || null,
      cw.w.id,
    ]
  );

  return NextResponse.json({ ok: true });
}
