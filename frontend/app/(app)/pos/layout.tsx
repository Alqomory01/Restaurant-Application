import { ReactNode } from "react";
import { PosProvider } from "@/lib/pos/PosContext";
import { PosAccessGate } from "@/components/PosAccessGate";

export default function PosLayout({ children }: { children: ReactNode }) {
  return (
    <PosAccessGate>
      <PosProvider>{children}</PosProvider>
    </PosAccessGate>
  );
}
