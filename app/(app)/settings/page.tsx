import { redirect } from "next/navigation";

// The General section was removed (theme lives in the topbar toggle; workspace
// info is on Profile) — Settings lands on Profile.
export default function SettingsPage() {
  redirect("/settings/profile");
}
