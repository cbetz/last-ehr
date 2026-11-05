"use client";

import { createContext, useContext } from "react";

import type { VendorWriteContext } from "@/lib/fhir/vendor-profile";

const VendorWriteContextValue = createContext<VendorWriteContext | null>(null);

export function VendorWriteProvider({
  value,
  children,
}: {
  value: VendorWriteContext | null;
  children: React.ReactNode;
}) {
  return (
    <VendorWriteContextValue.Provider value={value}>
      {children}
    </VendorWriteContextValue.Provider>
  );
}

export function useVendorWrite(): VendorWriteContext | null {
  return useContext(VendorWriteContextValue);
}
