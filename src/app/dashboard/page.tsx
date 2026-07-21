import { Suspense } from "react";
import { DashboardHome } from "@/components/dashboard/DashboardHome";

export const metadata = { title: "Dashboard — TVinBio" };

export default function Dashboard() {
  // DashboardHome reads "?claimed=" to show the measured claim-to-live time.
  return (
    <Suspense fallback={null}>
      <DashboardHome />
    </Suspense>
  );
}
