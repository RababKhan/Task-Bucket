import AppShell from "@/components/app/AppShell";
import PermissionProvider from "@/components/app/PermissionProvider";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PermissionProvider>
      <AppShell>{children}</AppShell>
    </PermissionProvider>
  );
}
