import { ReactNode } from "react";
import { FoodOpsProvider } from "@/lib/foodops/FoodOpsContext";
import { StoreAccessGate } from "@/components/StoreAccessGate";

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <StoreAccessGate>
      <FoodOpsProvider>{children}</FoodOpsProvider>
    </StoreAccessGate>
  );
}
