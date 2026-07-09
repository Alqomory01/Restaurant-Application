"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Shell } from "@/components/Shell";
import { Spinner } from "@/components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return <Shell>{children}</Shell>;
}
