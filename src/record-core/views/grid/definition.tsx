import * as React from "react";
import { Grid3x3 } from "lucide-react";
import type { ViewDefinition } from "../types";

/* Sheet view — Excel-grade bulk editing (glide-data-grid). The heavy view is a
   LAZY chunk: only this metadata is eager; the host renders the component
   under Suspense (the registry contract). */

const definition: ViewDefinition = {
  type: "grid",
  label: "Sheet",
  icon: <Grid3x3 size={13} />,
  component: React.lazy(() => import("./SpreadsheetView")),
};

export default definition;
