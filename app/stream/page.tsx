import type { Metadata } from "next";
import { Suspense } from "react";
import StreamBoard from "./stream-board";

export const metadata: Metadata = { title: "Tabla general · Major Scrims" };

export default function StreamPage() {
  return (
    <Suspense>
      <StreamBoard />
    </Suspense>
  );
}
