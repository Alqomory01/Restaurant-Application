import { ReactNode } from "react";
import { FoodOpsProvider } from "@/lib/foodops/FoodOpsContext";

export default function StoreLayout({ children }: { children: ReactNode }) {
  return <FoodOpsProvider>{children}</FoodOpsProvider>;
}
