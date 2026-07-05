import { NextResponse } from "next/server";
import { dbGet, dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";

type BrandRow = {
  id: string;
  brand_name: string | null;
  brand_logo: string | null;
  brand_color_dark: string | null;
  brand_color_light: string | null;
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const LOGO = /^data:image\/(png|jpe?g|webp|svg\+xml);base64,/;

function payload(w: BrandRow | undefined) {
  return {
    name: w?.brand_name ?? "",
    logo: w?.brand_logo ?? "",
    colorDark: w?.brand_color_dark ?? "",
    colorLight: w?.brand_color_light ?? "",
  };
}

async function currentWorkspace(userId: string) {
  const m = await getMembership(userId);
  if (!m) return null;
  const w = await dbGet<BrandRow>(
    "SELECT id, brand_name, brand_logo, brand_color_dark, brand_color_light FROM workspaces WHERE id = ?",
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
  return NextResponse.json(payload(cw?.w));
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
  const body = await request.json().catch(() => ({}));

  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
  const logo = typeof body.logo === "string" ? body.logo.trim() : "";
  const colorDark =
    typeof body.colorDark === "string" ? body.colorDark.trim() : "";
  const colorLight =
    typeof body.colorLight === "string" ? body.colorLight.trim() : "";

  if (logo && !LOGO.test(logo)) {
    return NextResponse.json(
      { error: "Unsupported logo image.", field: "logo" },
      { status: 400 }
    );
  }
  if (logo && logo.length > 400_000) {
    return NextResponse.json(
      { error: "Logo is too large. Use a smaller image.", field: "logo" },
      { status: 400 }
    );
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
    "UPDATE workspaces SET brand_name = ?, brand_logo = ?, brand_color_dark = ?, brand_color_light = ? WHERE id = ?",
    [name || null, logo || null, colorDark || null, colorLight || null, cw.w.id]
  );

  return NextResponse.json({ ok: true });
}
